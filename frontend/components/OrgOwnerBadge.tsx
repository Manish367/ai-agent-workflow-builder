import { useQuery } from "@apollo/client";
import { ORG_OWNER } from "@/graphql/queries";

// Visible to every role, not just the owner — anyone in the org should be able to see who owns it.
export default function OrgOwnerBadge({ orgId }: { orgId: string }) {
  const { data } = useQuery(ORG_OWNER, { variables: { org_id: orgId } });
  const owner = data?.org_members?.[0]?.user;
  if (!owner) return null;

  return (
    <span className="muted">
      Owner: <strong>{owner.display_name || owner.email}</strong>
    </span>
  );
}
