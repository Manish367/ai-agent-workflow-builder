import type { Request, Response } from "express";
import { assertActionSecret, wrap } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { HttpError, startWorkflowRun } from "../_lib/engine";
import { Q_WORKFLOW_TRIGGER_BY_SECRET } from "../_lib/queries";

// Hasura Action: webhookTriggerRun(workflow_id: uuid!, secret: String!)
// role: public — this is the inbound endpoint external systems call. There is no
// user session here, so authorization is entirely: does a `webhook` type trigger
// exist for this workflow whose stored config.secret matches what was posted?
// (Recall only an owner can attach a webhook trigger in the first place — Layer 2 on
// workflow_triggers — so the secret's existence already implies an authorized org.)
export default wrap(async (req: Request, res: Response) => {
  assertActionSecret(req);
  const { workflow_id, secret } = req.body.input;

  const data = await gqlAdmin<{ workflow_triggers: { id: string; config: { secret?: string } }[] }>(
    Q_WORKFLOW_TRIGGER_BY_SECRET,
    { workflow_id }
  );
  const trigger = data.workflow_triggers[0];
  if (!trigger || !trigger.config?.secret || trigger.config.secret !== secret) {
    throw new HttpError(401, "No matching enabled webhook trigger for this workflow/secret");
  }

  const { runId, status } = await startWorkflowRun({
    workflowId: workflow_id,
    triggerType: "webhook",
    callerUserId: null,
  });

  res.json({ workflow_run_id: runId, status });
});
