import type { Request, Response } from "express";
import { assertActionSecret, getCallerUserId, wrap, ActionBody } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { HttpError, requireOrgRole } from "../_lib/engine";
import { Q_USER_BY_EMAIL, M_UPSERT_ORG_MEMBER } from "../_lib/queries";

interface MemberInput {
  email: string;
  role: "owner" | "editor" | "viewer";
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
      const userData = await gqlAdmin<{ auth_users: { id: string }[] }>(Q_USER_BY_EMAIL, { email: member.email });
      const user = userData.auth_users[0];
      if (!user) {
        results.push({ email: member.email, success: false, user_id: null, error: "No account with this email has signed up yet" });
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
