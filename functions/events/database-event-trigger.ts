import type { Request, Response } from "express";
import { assertEventSecret, wrap } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { startWorkflowRun } from "../_lib/engine";
import { Q_DATABASE_EVENT_TRIGGERS, M_MARK_EXTERNAL_EVENT_PROCESSED } from "../_lib/queries";

// Hasura Event Trigger webhook, fires on INSERT into `external_events` — the
// `database_event` workflow-trigger type. A row landing in this "watched table"
// (from a real external system, or the demo UI's "simulate external event" button)
// auto-starts every enabled database_event trigger in the same org.
export default wrap(async (req: Request, res: Response) => {
  assertEventSecret(req);
  const row = req.body.event.data.new as { id: string; org_id: string };

  const data = await gqlAdmin<{ workflow_triggers: { id: string; workflow_id: string; config: Record<string, any> }[] }>(
    Q_DATABASE_EVENT_TRIGGERS,
    { org_id: row.org_id }
  );

  const triggers = data.workflow_triggers.filter(
    (t) => !t.config?.watched_table || t.config.watched_table === "external_events"
  );

  const results = await Promise.allSettled(
    triggers.map((t) => startWorkflowRun({ workflowId: t.workflow_id, triggerType: "database_event", callerUserId: null }))
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`database_event trigger ${triggers[i].id} failed to start a run:`, r.reason);
  });

  await gqlAdmin(M_MARK_EXTERNAL_EVENT_PROCESSED, { id: row.id });
  res.json({ success: true, started: results.filter((r) => r.status === "fulfilled").length });
});
