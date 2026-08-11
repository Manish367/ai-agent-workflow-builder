import type { Request, Response } from "express";
import { assertActionSecret, getCallerUserId, wrap, ActionBody } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { HttpError, requireOrgRole, runWorkflow } from "../_lib/engine";
import { Q_STEP_RUN_BY_PK, M_UPDATE_STEP_RUN, M_UPDATE_WORKFLOW_RUN } from "../_lib/queries";
import { nowIso } from "../_lib/time";

// Hasura Action: approveStep(step_run_id: uuid!, approve: Boolean!)
//
// This is the piece the assignment calls out specifically: clearing an
// approval_gate can't be a database permission, because it's not a row read/write —
// it's "check this caller's role right now, then resume execution." So the role
// check happens here, in code, against the *current* org_members table, every time.
export default wrap(async (req: Request, res: Response) => {
  assertActionSecret(req);
  const body = req.body as ActionBody;
  const { step_run_id, approve } = body.input;
  const callerUserId = getCallerUserId(body);
  if (!callerUserId) throw new HttpError(401, "Missing caller identity");

  const data = await gqlAdmin<{
    step_runs_by_pk: { id: string; workflow_run_id: string; org_id: string; status: string } | null;
  }>(Q_STEP_RUN_BY_PK, { id: step_run_id });
  const stepRun = data.step_runs_by_pk;
  if (!stepRun) throw new HttpError(404, "step_run not found");
  if (stepRun.status !== "paused") {
    throw new HttpError(409, "This step is not awaiting approval");
  }

  // Layer 2b: only an owner/editor *in this run's org* may approve — re-checked
  // fresh here, not cached from whoever originally started the run.
  await requireOrgRole(stepRun.org_id, callerUserId, ["owner", "editor"]);

  if (!approve) {
    await gqlAdmin(M_UPDATE_STEP_RUN, {
      id: step_run_id,
      set: { status: "failed", error: "Rejected by approver", approved_by: callerUserId, approved_at: nowIso(), finished_at: nowIso() },
    });
    await gqlAdmin(M_UPDATE_WORKFLOW_RUN, {
      id: stepRun.workflow_run_id,
      set: { status: "failed", finished_at: nowIso() },
    });
    res.json({ step_run_id, workflow_run_id: stepRun.workflow_run_id, status: "failed" });
    return;
  }

  await gqlAdmin(M_UPDATE_STEP_RUN, {
    id: step_run_id,
    set: { status: "succeeded", approved_by: callerUserId, approved_at: nowIso(), finished_at: nowIso() },
  });
  // Flip the run back to running before re-entering the engine so a concurrent
  // second approve/resume call sees status != 'paused' and no-ops (see runWorkflow's
  // idempotency guard).
  await gqlAdmin(M_UPDATE_WORKFLOW_RUN, { id: stepRun.workflow_run_id, set: { status: "running" } });

  const finalStatus = await runWorkflow(stepRun.workflow_run_id);
  res.json({ step_run_id, workflow_run_id: stepRun.workflow_run_id, status: finalStatus });
});
