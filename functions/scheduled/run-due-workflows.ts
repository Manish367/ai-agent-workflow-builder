import type { Request, Response } from "express";
import parser from "cron-parser";
import { assertEventSecret, wrap } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { startWorkflowRun } from "../_lib/engine";
import { Q_SCHEDULED_TRIGGERS, M_UPDATE_TRIGGER_CONFIG } from "../_lib/queries";

// Hasura Cron Trigger webhook (nhost/metadata/cron_triggers.yaml), polled every 5
// minutes. That fixed cadence is just polling resolution — each `scheduled`
// workflow_triggers row carries its own cron expression in config.cron, and this
// only starts a run for the ones actually due since config.last_run_at.
export default wrap(async (_req: Request, res: Response) => {
  assertEventSecret(_req);

  const data = await gqlAdmin<{ workflow_triggers: { id: string; workflow_id: string; config: Record<string, any> }[] }>(
    Q_SCHEDULED_TRIGGERS
  );

  const now = new Date();
  const started: string[] = [];

  for (const trigger of data.workflow_triggers) {
    const cronExpr: string | undefined = trigger.config?.cron;
    if (!cronExpr) continue;

    const lastRunAt = trigger.config?.last_run_at ? new Date(trigger.config.last_run_at) : new Date(0);
    let dueTime: Date;
    try {
      dueTime = parser.parseExpression(cronExpr, { currentDate: lastRunAt }).next().toDate();
    } catch (err) {
      console.error(`workflow_trigger ${trigger.id} has an invalid cron expression "${cronExpr}"`, err);
      continue;
    }

    if (dueTime > now) continue;

    try {
      const { runId } = await startWorkflowRun({ workflowId: trigger.workflow_id, triggerType: "scheduled", callerUserId: null });
      started.push(runId);
      await gqlAdmin(M_UPDATE_TRIGGER_CONFIG, {
        id: trigger.id,
        config: { ...trigger.config, last_run_at: now.toISOString() },
      });
    } catch (err) {
      console.error(`scheduled workflow_trigger ${trigger.id} failed to start a run:`, err);
    }
  }

  res.json({ success: true, started });
});
