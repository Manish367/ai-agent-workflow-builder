import { env } from "./env";

export class GraphQLError extends Error {
  constructor(message: string, public errors: unknown) {
    super(message);
  }
}

// Engine writes/reads go through the admin secret since role "user" has no insert/update permission on these tables — engine.ts re-derives every permission decision itself instead.
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
