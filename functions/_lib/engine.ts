import { gqlAdmin } from "./db";
import { callLlm } from "./llm";
import { executeHttpRequest } from "./http";
import { interpolate, getPath } from "./template";
import { nowIso } from "./time";
import {
  Q_WORKFLOW_WITH_STEPS,
  Q_ORG_MEMBER_ROLE,
  Q_ORGANIZATION,
  M_RESET_QUOTA_PERIOD,
  M_INCREMENT_QUOTA,
  M_INSERT_WORKFLOW_RUN,
  Q_WORKFLOW_RUN,
  M_UPDATE_WORKFLOW_RUN,
  Q_STEP_RUNS_FOR_RUN,
  M_INSERT_STEP_RUN,
  M_UPDATE_STEP_RUN,
  M_INSERT_WORKFLOW_OUTPUT,
  M_INSERT_NOTIFICATION,
} from "./queries";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type OrgRole = "owner" | "editor" | "viewer";

interface WorkflowStep {
  id: string;
  step_order: number;
  type: string;
  name: string;
  config: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Permission helpers — every entry point re-derives these itself. Nothing here
// trusts a Hasura row permission having already filtered anything, because these
// handlers run with the admin secret and bypass row permissions entirely.
// ---------------------------------------------------------------------------

export async function getOrgRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const data = await gqlAdmin<{ org_members: { role: OrgRole }[] }>(Q_ORG_MEMBER_ROLE, {
    org_id: orgId,
    user_id: userId,
  });
  return data.org_members[0]?.role ?? null;
}

export async function requireOrgRole(orgId: string, userId: string, allowed: OrgRole[]): Promise<OrgRole> {
  const role = await getOrgRole(orgId, userId);
  if (!role || !allowed.includes(role)) {
    throw new HttpError(403, `Caller is not a ${allowed.join("/")} in this organization`);
  }
  return role;
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

function currentMonthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

async function ensureQuotaPeriod(orgId: string): Promise<{ used: number; allowed: number }> {
  const data = await gqlAdmin<{ organizations_by_pk: { quota_calls_used: number; quota_calls_allowed: number; quota_period_start: string } }>(
    Q_ORGANIZATION,
    { id: orgId }
  );
  const org = data.organizations_by_pk;
  if (!org) throw new HttpError(404, "Organization not found");

  const nowPeriod = currentMonthStart();
  if (org.quota_period_start.slice(0, 10) < nowPeriod) {
    await gqlAdmin(M_RESET_QUOTA_PERIOD, { id: orgId, period_start: nowPeriod });
    return { used: 0, allowed: org.quota_calls_allowed };
  }
  return { used: org.quota_calls_used, allowed: org.quota_calls_allowed };
}

async function assertQuotaAvailable(orgId: string): Promise<void> {
  const { used, allowed } = await ensureQuotaPeriod(orgId);
  if (used >= allowed) {
    throw new HttpError(402, "Organization usage quota is exhausted for this period");
  }
}

async function incrementQuota(orgId: string, by: number): Promise<void> {
  if (by <= 0) return;
  await gqlAdmin(M_INCREMENT_QUOTA, { id: orgId, by });
}

// ---------------------------------------------------------------------------
// Starting a run
// ---------------------------------------------------------------------------

export async function startWorkflowRun(opts: {
  workflowId: string;
  triggerType: "manual" | "webhook" | "scheduled" | "database_event";
  callerUserId: string | null; // present for manual (session user); null for system-initiated triggers
}): Promise<{ runId: string; status: string }> {
  const { workflowId, triggerType, callerUserId } = opts;

  const wf = await gqlAdmin<{ workflows_by_pk: { id: string; org_id: string } | null }>(
    `query($id: uuid!) { workflows_by_pk(id: $id) { id org_id } }`,
    { id: workflowId }
  );
  if (!wf.workflows_by_pk) throw new HttpError(404, "Workflow not found");
  const orgId = wf.workflows_by_pk.org_id;

  // Step 1 of the spec: verify caller is owner/editor in the workflow's org. Only
  // applies to human-initiated (manual) runs — webhook/scheduled/database_event runs
  // are pre-authorized by the fact that only an owner/editor could have created that
  // trigger in the first place (enforced by the Layer 2 Hasura permission on
  // workflow_triggers), and webhook additionally requires its own per-trigger secret.
  if (triggerType === "manual") {
    if (!callerUserId) throw new HttpError(401, "Missing caller identity for a manual run");
    await requireOrgRole(orgId, callerUserId, ["owner", "editor"]);
  }

  // Step 2: quota check, before we spend anything creating a run.
  await assertQuotaAvailable(orgId);

  const inserted = await gqlAdmin<{ insert_workflow_runs_one: { id: string } }>(M_INSERT_WORKFLOW_RUN, {
    workflow_id: workflowId,
    trigger_type: triggerType,
    triggered_by: callerUserId,
  });
  const runId = inserted.insert_workflow_runs_one.id;

  const finalStatus = await runWorkflow(runId);
  return { runId, status: finalStatus };
}

// ---------------------------------------------------------------------------
// Executing / resuming a run
// ---------------------------------------------------------------------------

interface ExistingStepRun {
  id: string;
  workflow_step_id: string;
  status: string;
  output: unknown;
}

// Re-derives all state from the DB every time it's called, so it works identically
// whether it's a brand-new run or a resume-after-approval: it walks the workflow's
// steps in order, skips anything that already has a terminal step_run (succeeded /
// skipped / failed), and picks up execution at the first step that doesn't.
export async function runWorkflow(runId: string): Promise<string> {
  const runData = await gqlAdmin<{ workflow_runs_by_pk: { id: string; workflow_id: string; org_id: string; status: string } | null }>(
    Q_WORKFLOW_RUN,
    { id: runId }
  );
  const run = runData.workflow_runs_by_pk;
  if (!run) throw new HttpError(404, "workflow_run not found");
  if (run.status === "paused") return run.status; // idempotency guard, see approve-step.ts
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return run.status;

  if (run.status === "pending") {
    await gqlAdmin(M_UPDATE_WORKFLOW_RUN, { id: runId, set: { status: "running", started_at: nowIso() } });
  }

  const wfData = await gqlAdmin<{ workflows_by_pk: { steps: WorkflowStep[] } }>(Q_WORKFLOW_WITH_STEPS, {
    id: run.workflow_id,
  });
  const steps = wfData.workflows_by_pk.steps;

  const existingData = await gqlAdmin<{ step_runs: ExistingStepRun[] }>(Q_STEP_RUNS_FOR_RUN, { workflow_run_id: runId });
  const existingByStep = new Map(existingData.step_runs.map((sr) => [sr.workflow_step_id, sr]));

  // Fold through already-completed steps to reconstruct `previousOutput` and the
  // most recent conditional_branch result, so a resumed run behaves exactly like a
  // fresh one that happened to pause partway through.
  let previousOutput: unknown = null;
  let lastBranch: boolean | null = null;
  let externalCallCount = 0;

  for (const step of steps) {
    const existing = existingByStep.get(step.id);
    if (existing && existing.status !== "pending") {
      if (existing.status === "succeeded" && step.type === "conditional_branch") {
        lastBranch = (existing.output as any)?.branch ?? null;
      }
      if (existing.status === "succeeded" || existing.status === "skipped") {
        previousOutput = existing.output ?? previousOutput;
      }
      continue;
    }

    // run_if_branch lets a step declare it only runs when the most recent
    // conditional_branch evaluated to true or false; steps without it always run.
    const runIfBranch = step.config?.run_if_branch;
    if (typeof runIfBranch === "boolean" && lastBranch !== null && runIfBranch !== lastBranch) {
      await gqlAdmin(M_INSERT_STEP_RUN, {
        workflow_run_id: runId,
        workflow_step_id: step.id,
        status: "skipped",
        input: previousOutput ?? null,
        started_at: nowIso(),
      });
      continue;
    }

    const stepRunId = (
      await gqlAdmin<{ insert_step_runs_one: { id: string } }>(M_INSERT_STEP_RUN, {
        workflow_run_id: runId,
        workflow_step_id: step.id,
        status: "running",
        input: previousOutput ?? null,
        started_at: nowIso(),
      })
    ).insert_step_runs_one.id;

    try {
      if (step.type === "approval_gate") {
        await gqlAdmin(M_UPDATE_STEP_RUN, { id: stepRunId, set: { status: "paused" } });
        await gqlAdmin(M_UPDATE_WORKFLOW_RUN, { id: runId, set: { status: "paused" } });
        await incrementQuota(run.org_id, externalCallCount);
        return "paused"; // execution stops here until approveStep resumes it
      }

      const result = await executeStep(step, { previous: previousOutput, runId, orgId: run.org_id, stepRunId });
      if (result.externalCall) externalCallCount += 1;

      await gqlAdmin(M_UPDATE_STEP_RUN, {
        id: stepRunId,
        set: { status: "succeeded", output: result.output, attempt: result.attempts, finished_at: nowIso() },
      });

      previousOutput = result.output;
      if (step.type === "conditional_branch") lastBranch = (result.output as any).branch;
    } catch (err: any) {
      await gqlAdmin(M_UPDATE_STEP_RUN, {
        id: stepRunId,
        set: { status: "failed", error: String(err?.message ?? err), finished_at: nowIso() },
      });
      await gqlAdmin(M_UPDATE_WORKFLOW_RUN, { id: runId, set: { status: "failed", finished_at: nowIso() } });
      await incrementQuota(run.org_id, externalCallCount);
      return "failed";
    }
  }

  await gqlAdmin(M_UPDATE_WORKFLOW_RUN, { id: runId, set: { status: "completed", finished_at: nowIso() } });
  await incrementQuota(run.org_id, externalCallCount);
  return "completed";
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

async function withRetry<T>(attemptFn: () => Promise<T>, maxAttempts: number): Promise<{ value: T; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await attemptFn();
      return { value, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

async function executeStep(
  step: WorkflowStep,
  ctx: { previous: unknown; runId: string; orgId: string; stepRunId: string }
): Promise<{ output: unknown; attempts: number; externalCall: boolean }> {
  switch (step.type) {
    case "llm_call": {
      const prompt = interpolate(step.config?.prompt ?? "", { previous: ctx.previous }) as string;
      const { value, attempts } = await withRetry(() => callLlm(prompt, step.config), 2);
      return { output: { text: value.text, provider: value.provider, stubbed: value.stubbed }, attempts, externalCall: true };
    }

    case "http_request": {
      const config = interpolate(step.config ?? {}, { previous: ctx.previous }) as Record<string, any>;
      const { value, attempts } = await withRetry(() => executeHttpRequest(config), 2);
      return { output: value, attempts, externalCall: true };
    }

    case "db_write": {
      const data = interpolate(step.config?.data ?? ctx.previous ?? {}, { previous: ctx.previous });
      await gqlAdmin(M_INSERT_WORKFLOW_OUTPUT, { workflow_run_id: ctx.runId, step_run_id: ctx.stepRunId, data });
      return { output: { saved: true, data }, attempts: 1, externalCall: false };
    }

    case "notify": {
      const message = interpolate(step.config?.message ?? "Workflow notification", { previous: ctx.previous }) as string;
      const channel = step.config?.channel ?? "slack";
      // Insert only — the actual send happens in the `notification_outbox` Event
      // Trigger (see nhost/metadata/.../public_notifications.yaml + functions/events).
      await gqlAdmin(M_INSERT_NOTIFICATION, { workflow_run_id: ctx.runId, step_run_id: ctx.stepRunId, channel, message });
      return { output: { queued: true, channel, message }, attempts: 1, externalCall: false };
    }

    case "conditional_branch": {
      const { field, operator, value: expected } = step.config ?? {};
      const actual = getPath(ctx.previous, field);
      const branch = evaluateCondition(actual, operator, expected);
      return { output: { branch, field, operator, actual, expected }, attempts: 1, externalCall: false };
    }

    default:
      throw new Error(`Unknown step type "${step.type}"`);
  }
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "exists":
      return actual !== undefined && actual !== null;
    default:
      throw new Error(`Unknown conditional_branch operator "${operator}"`);
  }
}
