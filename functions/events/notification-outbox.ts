import type { Request, Response } from "express";
import { assertEventSecret, wrap } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { M_MARK_NOTIFICATION_SENT } from "../_lib/queries";
import { env } from "../_lib/env";
import { nowIso } from "../_lib/time";

// Hasura Event Trigger webhook, fires on INSERT into `notifications`. This is the
// `notify` step type's actual side effect — the engine only ever inserts the row
// (see functions/_lib/engine.ts executeStep case "notify"); this decoupled handler
// is what really posts to Slack (or logs a disclosed stub if no webhook is set).
export default wrap(async (req: Request, res: Response) => {
  assertEventSecret(req);
  const row = req.body.event.data.new as { id: string; channel: string; message: string };

  const webhookUrl = env.slackWebhookUrl();
  if (webhookUrl && row.channel === "slack") {
    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: row.message }),
    });
    if (!slackRes.ok) throw new Error(`Slack webhook returned ${slackRes.status}`);
  } else {
    console.log(`[notify stub — no SLACK_WEBHOOK_URL set] channel=${row.channel} message=${row.message}`);
  }

  await gqlAdmin(M_MARK_NOTIFICATION_SENT, { id: row.id, sent_at: nowIso() });
  res.json({ success: true });
});
