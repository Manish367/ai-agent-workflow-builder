import { useState } from "react";
import { useMutation, useSubscription } from "@apollo/client";
import { STEP_RUN_PROGRESS, APPROVE_STEP } from "@/graphql/queries";

// Live, step-by-step progress for one run — no polling, no refresh. This is the
// subscription the Final Task scenario depends on: it's filtered to a single
// workflow_run_id, and cross-org isolation for it comes for free from the Hasura
// select permission on step_runs (org-scoped) — there is no separate "subscription
// permission" to configure.
export default function RunStatusPanel({ runId, myRole }: { runId: string; myRole?: string }) {
  const { data, loading } = useSubscription(STEP_RUN_PROGRESS, { variables: { workflow_run_id: runId } });
  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  if (loading && !data) return <div className="muted">Connecting to live status…</div>;

  const stepRuns = data?.step_runs ?? [];
  const runStatus = stepRuns[0]?.workflow_run?.status;
  const canApprove = myRole === "owner" || myRole === "editor";

  async function onApprove(stepRunId: string, approve: boolean) {
    setPendingAction(stepRunId + approve);
    try {
      await approveStep({ variables: { step_run_id: stepRunId, approve } });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="card">
      <div className="row space-between">
        <h3>Run status</h3>
        {runStatus && <span className={`badge ${runStatus}`}>{runStatus}</span>}
      </div>
      <div className="step-list" style={{ marginTop: 8 }}>
        {stepRuns.map((sr: any, i: number) => (
          <div key={sr.id} className="step-item" data-type={sr.workflow_step?.type} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="row space-between">
              <strong>
                #{sr.workflow_step?.step_order} {sr.workflow_step?.name || sr.workflow_step?.type} ({sr.workflow_step?.type})
              </strong>
              <span className={`badge ${sr.status}`}>
                {(sr.status === "running" || sr.status === "paused") && <span className="spinner" style={{ width: 10, height: 10 }} />}
                {sr.status}
              </span>
            </div>
            {sr.attempt > 1 && <div className="muted">attempt {sr.attempt}</div>}
            {sr.output && (
              <details>
                <summary className="muted">output</summary>
                <pre>{JSON.stringify(sr.output, null, 2)}</pre>
              </details>
            )}
            {sr.error && <p className="error-text">{sr.error}</p>}

            {sr.status === "paused" && sr.workflow_step?.type === "approval_gate" && (
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Awaiting approval —</span>
                {canApprove ? (
                  <>
                    <button
                      className="primary"
                      disabled={approving && pendingAction === sr.id + "true"}
                      onClick={() => onApprove(sr.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      className="danger"
                      disabled={approving && pendingAction === sr.id + "false"}
                      onClick={() => onApprove(sr.id, false)}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span className="muted">only an owner/editor in this org can approve</span>
                )}
              </div>
            )}
          </div>
        ))}
        {stepRuns.length === 0 && <p className="muted">Waiting for the first step to start…</p>}
      </div>
    </div>
  );
}
