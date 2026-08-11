// Hasura's timestamptz scalar expects an ISO8601 string over GraphQL — it does NOT
// evaluate SQL literals like "now()" passed as a string. Compute the timestamp in JS
// instead, once, at the moment we're about to send it.
export function nowIso(): string {
  return new Date().toISOString();
}
