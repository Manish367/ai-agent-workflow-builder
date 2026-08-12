import type { Request, Response } from "express";
import { assertActionSecret, getCallerUserId, wrap, ActionBody } from "../_lib/handler";
import { startWorkflowRun } from "../_lib/engine";

// Hasura Action: triggerWorkflowRun(workflow_id: uuid!) — role: user; the actual owner/editor check happens inside startWorkflowRun, not as a Hasura permission.
export default wrap(async (req: Request, res: Response) => {
  assertActionSecret(req);
  const body = req.body as ActionBody;
  const workflowId = body.input.workflow_id;
  const callerUserId = getCallerUserId(body);

  const { runId, status } = await startWorkflowRun({
    workflowId,
    triggerType: "manual",
    callerUserId,
  });

  res.json({ workflow_run_id: runId, status });
});
