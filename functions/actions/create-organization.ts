import type { Request, Response } from "express";
import { assertActionSecret, getCallerUserId, wrap, ActionBody } from "../_lib/handler";
import { gqlAdmin } from "../_lib/db";
import { HttpError } from "../_lib/engine";
import { M_INSERT_ORGANIZATION, M_UPSERT_ORG_MEMBER } from "../_lib/queries";

// Hasura Action: createOrganization(name: String!) — any signed-up user can call this and becomes the new org's owner. organizations/org_members have no insert permission for role "user" (an org's first owner can't self-authorize through a row permission), so this is the only path onto the platform for someone nobody has invited yet.
export default wrap(async (req: Request, res: Response) => {
  assertActionSecret(req);
  const body = req.body as ActionBody;
  const name = String(body.input.name ?? "").trim();
  const callerUserId = getCallerUserId(body);
  if (!callerUserId) throw new HttpError(401, "Missing caller identity");
  if (!name) throw new HttpError(400, "Organization name is required");

  const org = await gqlAdmin<{ insert_organizations_one: { id: string; name: string } }>(M_INSERT_ORGANIZATION, { name });
  const orgId = org.insert_organizations_one.id;

  await gqlAdmin(M_UPSERT_ORG_MEMBER, { org_id: orgId, user_id: callerUserId, role: "owner" });

  res.json({ org_id: orgId, org_name: org.insert_organizations_one.name });
});
