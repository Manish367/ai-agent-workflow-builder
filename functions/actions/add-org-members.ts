import type { Request, Response } from "express";
import { assertActionSecret, getCallerUserId, wrap, ActionBody } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { HttpError, requireOrgRole } from "../_lib/engine";
import { Q_USER_BY_EMAIL, M_UPSERT_ORG_MEMBER, Q_ORG_MEMBER_ROLE } from "../_lib/queries";

interface MemberInput {
  email: string;
  role: "editor" | "viewer";
}

interface MemberResult {
  email: string;
  success: boolean;
  user_id: string | null;
  error: string | null;
}

// Hasura Action: addOrgMembers(org_id: uuid!, members: [OrgMemberInput!]!) — owner-only; there is no self-serve join, and no way to browse users outside your own org, so this is the only path onto an org's roster.
export default wrap(async (req: Request, res: Response) => {
  assertActionSecret(req);
  const body = req.body as ActionBody;
  const { org_id, members } = body.input as { org_id: string; members: MemberInput[] };
  const callerUserId = getCallerUserId(body);
  if (!callerUserId) throw new HttpError(401, "Missing caller identity");

  await requireOrgRole(org_id, callerUserId, ["owner"]);

  const results: MemberResult[] = [];
  for (const member of members) {
    try {
      if (member.role !== "editor" && member.role !== "viewer") {
        results.push({ email: member.email, success: false, user_id: null, error: "Role must be editor or viewer — owner can only be set once, at org creation" });
        continue;
      }

      const userData = await gqlAdmin<{ auth_users: { id: string }[] }>(Q_USER_BY_EMAIL, { email: member.email });
      const user = userData.auth_users[0];
      if (!user) {
        results.push({ email: member.email, success: false, user_id: null, error: "No account with this email has signed up yet" });
        continue;
      }

      // The upsert below would otherwise silently overwrite an existing owner's role.
      const roleData = await gqlAdmin<{ org_members: { role: string }[] }>(Q_ORG_MEMBER_ROLE, { org_id, user_id: user.id });
      if (roleData.org_members[0]?.role === "owner") {
        results.push({ email: member.email, success: false, user_id: user.id, error: "This person is the org's owner — their role can't be changed here" });
        continue;
      }

      await gqlAdmin(M_UPSERT_ORG_MEMBER, { org_id, user_id: user.id, role: member.role });
      results.push({ email: member.email, success: true, user_id: user.id, error: null });
    } catch (err: any) {
      results.push({ email: member.email, success: false, user_id: null, error: String(err?.message ?? err) });
    }
  }

  res.json({ results });
});
