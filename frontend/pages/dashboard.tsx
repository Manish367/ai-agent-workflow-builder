import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMutation, useQuery } from "@apollo/client";
import { useAuthenticationStatus, useUserData } from "@nhost/react";
import { MY_ORGS, ORG_WORKFLOWS, CREATE_WORKFLOW, SIMULATE_EXTERNAL_EVENT, CREATE_ORGANIZATION } from "@/graphql/queries";
import QuotaIndicator from "@/components/QuotaIndicator";
import MembersPanel from "@/components/MembersPanel";
import OrgOwnerBadge from "@/components/OrgOwnerBadge";
import Shell from "@/components/Shell";

export default function Dashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const user = useUserData();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: orgsData, loading: orgsLoading, refetch: refetchOrgs } = useQuery(MY_ORGS, {
    variables: { user_id: user?.id },
    skip: !user?.id,
  });

  const memberships = orgsData?.org_members ?? [];
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId || memberships.length === 0) return;
    const prefer = router.query.prefer;
    const wantOwner = prefer === "owner";
    const wantMember = prefer === "member";
    const preferred = wantOwner
      ? memberships.find((m: any) => m.role === "owner")
      : wantMember
      ? memberships.find((m: any) => m.role !== "owner")
      : undefined;
    setOrgId((preferred ?? memberships[0]).org_id);
  }, [memberships, orgId, router.query.prefer]);

  const myRole: string | undefined = useMemo(
    () => memberships.find((m: any) => m.org_id === orgId)?.role,
    [memberships, orgId]
  );

  const { data: wfData, loading: wfLoading, refetch } = useQuery(ORG_WORKFLOWS, {
    variables: { org_id: orgId },
    skip: !orgId,
    pollInterval: 10000,
  });

  const [createWorkflow, { loading: creating }] = useMutation(CREATE_WORKFLOW);
  const [simulateEvent, { loading: simulating }] = useMutation(SIMULATE_EXTERNAL_EVENT);
  const [createOrg, { loading: creatingOrg }] = useMutation(CREATE_ORGANIZATION);
  const [newName, setNewName] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !newName.trim()) return;
    const res = await createWorkflow({ variables: { org_id: orgId, name: newName, description: null } });
    setNewName("");
    await refetch();
    const id = res.data?.insert_workflows_one?.id;
    if (id) router.push(`/workflows/${id}`);
  }

  async function onCreateOrg(e: FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    const res = await createOrg({ variables: { name: newOrgName } });
    setNewOrgName("");
    setShowNewOrgForm(false);
    await refetchOrgs();
    const id = res.data?.createOrganization?.org_id;
    if (id) setOrgId(id);
  }

  async function onSimulateEvent() {
    if (!orgId) return;
    await simulateEvent({ variables: { org_id: orgId, payload: { demo: true, at: new Date().toISOString() } } });
    setToast("Inserted into external_events — enabled database_event triggers in this org will start a run.");
  }

  if (authLoading || orgsLoading) {
    return (
      <Shell>
        <div className="row" style={{ marginTop: 60, justifyContent: "center" }}>
          <span className="spinner" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="row space-between">
        <h1>Workflows</h1>
      </div>

      {memberships.length === 0 ? (
        <div className="card">
          <p>You&rsquo;re not a member of any organization yet.</p>
          <p className="muted">Create your own — you&rsquo;ll be its owner — or have an existing owner add you by email.</p>
          <form onSubmit={onCreateOrg} className="row" style={{ marginTop: 12 }}>
            <input
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="primary" type="submit" disabled={creatingOrg || !newOrgName.trim()}>
              {creatingOrg ? <span className="spinner" /> : "+ Create organization"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row space-between" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="row">
                <label className="muted">Organization</label>
                <select value={orgId ?? ""} onChange={(e) => setOrgId(e.target.value)}>
                  {memberships.map((m: any) => (
                    <option key={m.org_id} value={m.org_id}>
                      {m.organization.name}
                    </option>
                  ))}
                </select>
                {myRole && <span className={`badge ${myRole}`}>{myRole}</span>}
                {orgId && <OrgOwnerBadge orgId={orgId} />}
                <button className="ghost" onClick={() => setShowNewOrgForm((v) => !v)}>
                  + New org
                </button>
              </div>
              <button onClick={onSimulateEvent} disabled={simulating} title="Insert a row into external_events to fire database_event triggers">
                {simulating ? <span className="spinner" /> : "⚡ Simulate external event"}
              </button>
            </div>
            {showNewOrgForm && (
              <form onSubmit={onCreateOrg} className="row" style={{ marginTop: 12 }}>
                <input
                  placeholder="Organization name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button className="primary" type="submit" disabled={creatingOrg || !newOrgName.trim()}>
                  {creatingOrg ? <span className="spinner" /> : "Create"}
                </button>
              </form>
            )}
            {orgId && (
              <div style={{ marginTop: 14 }}>
                <QuotaIndicator orgId={orgId} />
              </div>
            )}
            {toast && (
              <p className="muted" style={{ marginTop: 10, animation: "fadeIn 0.2s ease" }}>
                {toast}
              </p>
            )}
          </div>

          {myRole !== "viewer" && (
            <div className="card">
              <form onSubmit={onCreate} className="row">
                <input
                  placeholder="New workflow name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="primary" type="submit" disabled={creating || !newName.trim()}>
                  {creating ? <span className="spinner" /> : "+ Create workflow"}
                </button>
              </form>
            </div>
          )}

          <div className="step-list">
            {wfLoading && <div className="muted">Loading workflows…</div>}
            {wfData?.workflows.map((wf: any, i: number) => {
              const latestRun = wf.runs[0];
              return (
                <Link
                  key={wf.id}
                  href={`/workflows/${wf.id}`}
                  className="workflow-card"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <div className="card" style={{ marginBottom: 0 }}>
                    <div className="row space-between">
                      <div>
                        <strong>{wf.name}</strong>
                        <div className="muted">
                          {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"} · {wf.triggers.length} trigger
                          {wf.triggers.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      {latestRun && <span className={`badge ${latestRun.status}`}>{latestRun.status}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
            {wfData?.workflows.length === 0 && <p className="muted">No workflows yet.</p>}
          </div>

          {myRole === "owner" && orgId && (
            <div style={{ marginTop: 18 }}>
              <MembersPanel orgId={orgId} currentUserId={user?.id} />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
