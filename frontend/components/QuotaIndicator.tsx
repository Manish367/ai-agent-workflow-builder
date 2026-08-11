import { useQuery } from "@apollo/client";
import { ORG_STATS } from "@/graphql/queries";

export default function QuotaIndicator({ orgId }: { orgId: string }) {
  const { data, loading } = useQuery(ORG_STATS, { variables: { org_id: orgId }, pollInterval: 15000 });

  if (loading || !data?.organizations_by_pk) return <div className="muted">Loading usage…</div>;

  const org = data.organizations_by_pk;
  const stats = data.organization_stats?.[0];
  const pct = Math.min(100, (org.quota_calls_used / org.quota_calls_allowed) * 100);
  const cls = pct >= 100 ? "exhausted" : pct >= 80 ? "warn" : "";

  return (
    <div>
      <div className="row space-between">
        <span className="muted">
          Usage this period: {org.quota_calls_used} / {org.quota_calls_allowed} calls
        </span>
        {stats && (
          <span className="muted">
            {stats.runs_this_month} runs this month · avg{" "}
            {stats.avg_run_duration_seconds ? `${Math.round(stats.avg_run_duration_seconds)}s` : "—"}
          </span>
        )}
      </div>
      <div className="quota-bar" style={{ marginTop: 6 }}>
        <div className={cls} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
