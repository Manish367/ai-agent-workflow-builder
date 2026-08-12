import { FormEvent, useState } from "react";
import { useMutation } from "@apollo/client";
import { ADD_TRIGGER } from "@/graphql/queries";

const TRIGGER_TYPES = ["manual", "webhook", "scheduled", "database_event"] as const;

function randomSecret(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CONFIG_PLACEHOLDERS: Record<string, () => string> = {
  manual: () => "{}",
  webhook: () => JSON.stringify({ secret: randomSecret() }, null, 2),
  scheduled: () => JSON.stringify({ cron: "*/10 * * * *" }, null, 2),
  database_event: () => JSON.stringify({ watched_table: "external_events" }, null, 2),
};

// webhook triggers are owner-only — enforced server-side.
export default function TriggerForm({
  workflowId,
  myRole,
  onAdded,
}: {
  workflowId: string;
  myRole?: string;
  onAdded: () => void;
}) {
  const [type, setType] = useState<(typeof TRIGGER_TYPES)[number]>("manual");
  const [configText, setConfigText] = useState(CONFIG_PLACEHOLDERS.manual());
  const [addTrigger, { loading, error }] = useMutation(ADD_TRIGGER);
  const [formError, setFormError] = useState<string | null>(null);

  const isSensitive = type === "webhook";
  const canAdd = myRole === "owner" || (myRole === "editor" && !isSensitive);

  function onTypeChange(t: (typeof TRIGGER_TYPES)[number]) {
    setType(t);
    setConfigText(CONFIG_PLACEHOLDERS[t]());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    let config: unknown;
    try {
      config = JSON.parse(configText || "{}");
    } catch {
      setFormError("Config must be valid JSON");
      return;
    }
    await addTrigger({ variables: { workflow_id: workflowId, type, config } });
    onAdded();
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ marginBottom: 0 }}>
      <h3>Add trigger</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={type} onChange={(e) => onTypeChange(e.target.value as any)}>
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
              {t === "webhook" && "  (owner only)"}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        rows={3}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      {type === "webhook" && (
        <p className="muted">
          Call <code>POST /api/rest or GraphQL mutation webhookTriggerRun(workflow_id, secret)</code> with this secret
          to start a run without a user session.
        </p>
      )}
      {!canAdd && <p className="error-text">Only an owner can add a webhook trigger.</p>}
      <button className="primary" type="submit" disabled={loading || !canAdd}>
        {loading ? "Adding…" : "Add trigger"}
      </button>
      {formError && <p className="error-text">{formError}</p>}
      {error && <p className="error-text">{error.message}</p>}
    </form>
  );
}
