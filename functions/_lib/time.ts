// Hasura's timestamptz scalar expects an ISO8601 string, not a SQL literal like "now()".
export function nowIso(): string {
  return new Date().toISOString();
}
