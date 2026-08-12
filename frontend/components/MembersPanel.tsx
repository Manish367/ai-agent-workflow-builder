import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { ORG_MEMBERS, ADD_ORG_MEMBERS, UPDATE_MEMBER_ROLE, REMOVE_MEMBER } from "@/graphql/queries";

const ROLES = ["owner", "editor", "viewer"] as const;

interface PendingMember {
  email: string;
  role: (typeof ROLES)[number];
  checked: boolean;
}

// Owner-only: no self-serve join and no way to browse users outside your own org, so this is the only path onto an org's roster — see functions/actions/add-org-members.ts.
export default function MembersPanel({ orgId, currentUserId }: { orgId: string; currentUserId?: string }) {
  const { data, loading, refetch } = useQuery(ORG_MEMBERS, { variables: { org_id: orgId } });
  const [addMembers, { loading: adding }] = useMutation(ADD_ORG_MEMBERS);
  const [updateRole] = useMutation(UPDATE_MEMBER_ROLE);
  const [removeMember] = useMutation(REMOVE_MEMBER);

  const [emailInput, setEmailInput] = useState("");
  const [defaultRole, setDefaultRole] = useState<(typeof ROLES)[number]>("editor");
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [addResults, setAddResults] = useState<{ email: string; success: boolean; error: string | null }[] | null>(null);

  function onAddToPending(e: FormEvent) {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email || pending.some((p) => p.email === email)) return;
    setPending((prev) => [...prev, { email, role: defaultRole, checked: true }]);
    setEmailInput("");
  }

  function togglePending(email: string) {
    setPending((prev) => prev.map((p) => (p.email === email ? { ...p, checked: !p.checked } : p)));
  }

  function setPendingRole(email: string, role: (typeof ROLES)[number]) {
    setPending((prev) => prev.map((p) => (p.email === email ? { ...p, role } : p)));
  }

  function removePending(email: string) {
    setPending((prev) => prev.filter((p) => p.email !== email));
  }

  async function onSubmitPending() {
    const selected = pending.filter((p) => p.checked);
    if (selected.length === 0) return;
    setAddResults(null);
    const res = await addMembers({
      variables: { org_id: orgId, members: selected.map(({ email, role }) => ({ email, role })) },
    });
    const results = res.data?.addOrgMembers?.results ?? [];
    setAddResults(results);
    const succeededEmails = new Set(results.filter((r: any) => r.success).map((r: any) => r.email));
    setPending((prev) => prev.filter((p) => !succeededEmails.has(p.email)));
    await refetch();
  }

  async function onChangeRole(memberId: string, role: string) {
    await updateRole({ variables: { id: memberId, role } });
    await refetch();
  }

  async function onRemove(memberId: string) {
    await removeMember({ variables: { id: memberId } });
    await refetch();
  }

  return (
    <div className="card">
      <h2>Members</h2>
      {loading && <p className="muted">Loading…</p>}
      <div className="step-list">
        {data?.org_members.map((m: any) => (
          <div key={m.id} className="step-item">
            <div className="row space-between">
              <div>
                <strong>{m.user?.display_name || m.user?.email || m.user_id}</strong>
                <div className="muted">{m.user?.email}</div>
              </div>
              <div className="row">
                <select value={m.role} onChange={(e) => onChangeRole(m.id, e.target.value)} disabled={m.user_id === currentUserId}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button className="danger" onClick={() => onRemove(m.id)} disabled={m.user_id === currentUserId}>
                  remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 16 }}>Add members</h3>
      <p className="muted">They must have already signed up — enter their email, add it to the list below, then submit.</p>
      <form onSubmit={onAddToPending} className="row">
        <input
          type="email"
          placeholder="email@example.com"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as any)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit">+ Add to list</button>
      </form>

      {pending.length > 0 && (
        <div className="step-list" style={{ marginTop: 10 }}>
          {pending.map((p) => (
            <div key={p.email} className="step-item">
              <div className="row space-between">
                <label className="row" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={p.checked} onChange={() => togglePending(p.email)} />
                  {p.email}
                </label>
                <div className="row">
                  <select value={p.role} onChange={(e) => setPendingRole(p.email, e.target.value as any)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button className="danger" onClick={() => removePending(p.email)}>
                    remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button className="primary" onClick={onSubmitPending} disabled={adding || !pending.some((p) => p.checked)}>
            {adding ? <span className="spinner" /> : `Add ${pending.filter((p) => p.checked).length} selected member(s)`}
          </button>
        </div>
      )}

      {addResults && (
        <div style={{ marginTop: 10 }}>
          {addResults.map((r) => (
            <p key={r.email} className={r.success ? "muted" : "error-text"}>
              {r.email}: {r.success ? "added" : r.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
