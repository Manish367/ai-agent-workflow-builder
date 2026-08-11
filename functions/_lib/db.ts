import { env } from "./env";

export class GraphQLError extends Error {
  constructor(message: string, public errors: unknown) {
    super(message);
  }
}

// All engine writes/reads go through the admin secret. This is intentional: the
// Hasura permissions in nhost/metadata give role "user" read-only access (and only
// within their own org) to workflow_runs/step_runs/notifications/workflow_outputs —
// there is no insert/update permission for those tables for anyone but admin. The
// Action handler is the only writer, and it re-derives every permission decision
// itself (see engine.ts) rather than relying on the bypassed row-level checks.
export async function gqlAdmin<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(env.hasuraGraphqlUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": env.hasuraAdminSecret(),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (json.errors) {
    throw new GraphQLError(json.errors[0]?.message ?? "GraphQL error", json.errors);
  }
  return json.data;
}
