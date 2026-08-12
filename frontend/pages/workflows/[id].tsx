import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useMutation, useQuery } from "@apollo/client";
import { useAuthenticationStatus, useUserData } from "@nhost/react";
import { WORKFLOW_DETAIL, MY_ROLE_IN_ORG, TRIGGER_RUN, DELETE_STEP, UPDATE_STEP_ORDER, DELETE_TRIGGER } from "@/graphql/queries";
import StepForm from "@/components/StepForm";
import TriggerForm from "@/components/TriggerForm";
import RunStatusPanel from "@/components/RunStatusPanel";
import Shell from "@/components/Shell";

const STEP_ICON: Record<string, string> = {
  llm_call: "🧠",
  http_request: "🌐",
  db_write: "💾",
  notify: "📣",
  conditional_branch: "🔀",
  approval_gate: "🛑",
};

export default function WorkflowPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const user = useUserData();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data, loading, refetch } = useQuery(WORKFLOW_DETAIL, { variables: { id }, skip: !id, pollInterval: 15000 });
  const workflow = data?.workflows_by_pk;

  const { data: roleData } = useQuery(MY_ROLE_IN_ORG, {
    variables: { org_id: workflow?.org_id, user_id: user?.id },
    skip: !workflow?.org_id || !user?.id,
  });
  const myRole: string | undefined = roleData?.org_members?.[0]?.role;

  const [triggerRun, { loading: running, error: runError }] = useMutation(TRIGGER_RUN);
  const [deleteStep] = useMutation(DELETE_STEP);
  const [deleteTrigger] = useMutation(DELETE_TRIGGER);
  const [updateStepOrder] = useMutation(UPDATE_STEP_ORDER);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRunId && workflow?.runs?.[0]) setActiveRunId(workflow.runs[0].id);
  }, [workflow, activeRunId]);

  async function onRun() {
    if (!id) return;
    const res = await triggerRun({ variables: { workflow_id: id } });
    const runId = res.data?.triggerWorkflowRun?.workflow_run_id;
    if (runId) setActiveRunId(runId);
    await refetch();
  }

  // Deleting a step leaves a gap in step_order (e.g. 3, 6, 7) since remaining steps
  // keep their old values -- harmless for execution (which just sorts ascending),
  // but confusing to look at. Renumber everything back to a contiguous 1..N right
  // after a delete. Two passes to avoid colliding with the (workflow_id, step_order)
  // unique constraint: move everything to negative scratch values first, then to
  // their final positions.
  async function renumberSteps(remainingSteps: { id: string }[]) {
    for (let i = 0; i < remainingSteps.length; i++) {
      await updateStepOrder({ variables: { id: remainingSteps[i].id, step_order: -(i + 1) } });
    }
    for (let i = 0; i < remainingSteps.length; i++) {
      await updateStepOrder({ variables: { id: remainingSteps[i].id, step_order: i + 1 } });
    }
  }

  async function onDeleteStep(stepId: string) {
    await deleteStep({ variables: { id: stepId } });
    const remaining = workflow.steps.filter((s: any) => s.id !== stepId);
    await renumberSteps(remaining);
    await refetch();
  }

  async function onDeleteTrigger(triggerId: string) {
    await deleteTrigger({ variables: { id: triggerId } });
    await refetch();
  }

  async function onMoveStep(index: number, direction: -1 | 1) {
    const steps = workflow.steps;
    const other = steps[index + direction];
    const moving = steps[index];
    if (!other) return;
    setReordering(moving.id);
    try {
      await updateStepOrder({ variables: { id: moving.id, step_order: -1 } });
      await updateStepOrder({ variables: { id: other.id, step_order: moving.step_order } });
      await updateStepOrder({ variables: { id: moving.id, step_order: other.step_order } });
      await refetch();
    } finally {
      setReordering(null);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="row" style={{ marginTop: 60, justifyContent: "center" }}>
          <span className="spinner" />
        </div>
      </Shell>
    );
  }

  if (!workflow) {
    // Hasura returns null here (not an error) for a workflow outside your org's
    // membership — this is the cross-org isolation actually working, not a bug.
    return (
      <Shell>
        <Link href="/dashboard" className="muted">
          ← back
        </Link>
        <div className="card" style={{ marginTop: 12 }}>
          <h2>Not found</h2>
          <p className="muted">
            This workflow doesn&rsquo;t exist, or you&rsquo;re not a member of the organization it
            belongs to.
          </p>
        </div>
      </Shell>
    );
  }

  const nextOrder = workflow.steps.length ? Math.max(...workflow.steps.map((s: any) => s.step_order)) + 1 : 1;

  return (
    <Shell>
      <Link href="/dashboard" className="muted">
        ← back
      </Link>
      <div className="row space-between" style={{ marginTop: 8 }}>
        <div>
          <h1>{workflow.name}</h1>
          {workflow.description && <p className="muted">{workflow.description}</p>}
        </div>
        {myRole !== "viewer" && (
          <button className="primary" onClick={onRun} disabled={running}>
            {running ? <span className="spinner" /> : "▶ Run"}
          </button>
        )}
      </div>
      {runError && <p className="error-text">{runError.message}</p>}

      <div className="card">
        <h2>Steps</h2>
        <div className="step-list">
          {workflow.steps.map((s: any, i: number) => (
            <div
              key={s.id}
              className="step-item"
              data-type={s.type}
              style={{ animationDelay: `${i * 40}ms`, opacity: reordering === s.id ? 0.5 : 1 }}
            >
              <div className="row space-between">
                <strong>
                  {STEP_ICON[s.type]} #{s.step_order} {s.name || s.type} <span className="muted">({s.type})</span>
                </strong>
                {myRole !== "viewer" && (
                  <div className="row">
                    <button className="icon-btn" onClick={() => onMoveStep(i, -1)} disabled={i === 0} title="Move up">
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => onMoveStep(i, 1)}
                      disabled={i === workflow.steps.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button className="danger" onClick={() => onDeleteStep(s.id)}>
                      remove
                    </button>
                  </div>
                )}
              </div>
              <pre>{JSON.stringify(s.config, null, 2)}</pre>
            </div>
          ))}
          {workflow.steps.length === 0 && <p className="muted">No steps yet.</p>}
        </div>
      </div>

      {myRole !== "viewer" && (
        <StepForm workflowId={workflow.id} nextOrder={nextOrder} myRole={myRole} onAdded={refetch} />
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Triggers</h2>
        <div className="step-list">
          {workflow.triggers.map((t: any, i: number) => (
            <div key={t.id} className="step-item" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="row space-between">
                <strong>{t.type}</strong>
                <div className="row">
                  <span className="muted">{t.enabled ? "enabled" : "disabled"}</span>
                  {myRole !== "viewer" && (
                    <button className="danger" onClick={() => onDeleteTrigger(t.id)}>
                      remove
                    </button>
                  )}
                </div>
              </div>
              <pre>{JSON.stringify(t.config, null, 2)}</pre>
            </div>
          ))}
          {workflow.triggers.length === 0 && <p className="muted">No triggers yet — manual run always works.</p>}
        </div>
      </div>

      {myRole !== "viewer" && <TriggerForm workflowId={workflow.id} myRole={myRole} onAdded={refetch} />}

      <div style={{ marginTop: 18 }}>
        <h2>Runs</h2>
        <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          {workflow.runs.map((r: any) => (
            <button
              key={r.id}
              onClick={() => setActiveRunId(r.id)}
              style={{
                borderColor: activeRunId === r.id ? "var(--accent-1)" : undefined,
                boxShadow: activeRunId === r.id ? "0 0 0 3px color-mix(in srgb, var(--accent-1) 20%, transparent)" : undefined,
              }}
            >
              {new Date(r.created_at).toLocaleString()} <span className={`badge ${r.status}`}>{r.status}</span>
            </button>
          ))}
          {workflow.runs.length === 0 && <p className="muted">No runs yet.</p>}
        </div>
        {activeRunId && <RunStatusPanel runId={activeRunId} myRole={myRole} />}
      </div>
    </Shell>
  );
}
