import { FormEvent, useState } from "react";
import { useMutation } from "@apollo/client";
import { ADD_STEP } from "@/graphql/queries";

const STEP_TYPES = ["llm_call", "http_request", "db_write", "notify", "conditional_branch", "approval_gate"] as const;

const CONFIG_PLACEHOLDERS: Record<string, string> = {
  llm_call: '{\n  "prompt": "Summarize: {{previous.text}}"\n}',
  http_request: '{\n  "url": "https://api.example.com/endpoint",\n  "method": "GET"\n}',
  db_write: '{\n  "data": { "note": "{{previous.text}}" }\n}',
  notify: '{\n  "channel": "slack",\n  "message": "Run finished: {{previous.text}}"\n}',
  conditional_branch: '{\n  "field": "text",\n  "operator": "contains",\n  "value": "urgent"\n}',
  approval_gate: "{}",
};

// Sensitive types (db_write / notify) are owner-only — enforced server-side by the
// Layer 2 Hasura permission on workflow_steps, this UI just avoids offering an
// insert that would be rejected.
export default function StepForm({
  workflowId,
  nextOrder,
  myRole,
  onAdded,
}: {
  workflowId: string;
  nextOrder: number;
  myRole?: string;
  onAdded: () => void;
}) {
  const [type, setType] = useState<(typeof STEP_TYPES)[number]>("llm_call");
  const [name, setName] = useState("");
  const [configText, setConfigText] = useState(CONFIG_PLACEHOLDERS.llm_call);
  const [addStep, { loading, error }] = useMutation(ADD_STEP);
  const [formError, setFormError] = useState<string | null>(null);

  const isSensitive = type === "db_write" || type === "notify";
  const canAdd = myRole === "owner" || (myRole === "editor" && !isSensitive);

  function onTypeChange(t: (typeof STEP_TYPES)[number]) {
    setType(t);
    setConfigText(CONFIG_PLACEHOLDERS[t]);
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
    await addStep({
      variables: { workflow_id: workflowId, step_order: nextOrder, type, name: name || type, config },
    });
    setName("");
    onAdded();
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ marginBottom: 0 }}>
      <h3>Add step</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={type} onChange={(e) => onTypeChange(e.target.value as any)}>
          {STEP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
              {(t === "db_write" || t === "notify") && "  (owner only)"}
            </option>
          ))}
        </select>
        <input placeholder="Step name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      </div>
      <textarea
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        rows={4}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      <p className="muted" style={{ marginTop: 4 }}>
        Any step's config can add <code>&quot;run_if_branch&quot;: true</code> (or <code>false</code>) to only run when
        the most recent conditional_branch matched.
      </p>
      {!canAdd && (
        <p className="error-text">
          {isSensitive ? "Only an owner can add a db_write or notify step." : "Viewers cannot edit workflows."}
        </p>
      )}
      <button className="primary" type="submit" disabled={loading || !canAdd}>
        {loading ? "Adding…" : "Add step"}
      </button>
      {formError && <p className="error-text">{formError}</p>}
      {error && <p className="error-text">{error.message}</p>}
    </form>
  );
}
