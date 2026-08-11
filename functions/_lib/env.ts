function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  // Hasura GraphQL endpoint + admin secret: the engine talks to Hasura as admin,
  // which is what lets it write workflow_runs/step_runs even though those tables
  // have no insert/update permission for role "user" (see nhost/metadata).
  // Custom env var names can't start with NHOST_/HASURA_/AUTH_/STORAGE_/POSTGRES_ on
  // nhost cloud, so the endpoint uses a plain name; the admin secret reuses the
  // system-provided NHOST_ADMIN_SECRET (same value, already injected — no custom var needed).
  hasuraGraphqlUrl: () => required("GRAPHQL_ENDPOINT"),
  hasuraAdminSecret: () => required("NHOST_ADMIN_SECRET"),

  // Shared secrets Hasura sends back to us, so a handler can refuse any request
  // that didn't actually come from our own Hasura instance.
  actionSecret: () => process.env.ACTION_SECRET || "",
  eventSecret: () => process.env.EVENT_TRIGGER_SECRET || "",

  // LLM provider. If LLM_API_KEY is unset, llm_call steps fall back to a stubbed
  // response with a disclosed artificial delay (see _lib/llm.ts) — this is explicitly
  // allowed by the assignment when a free-tier key isn't available.
  llmProvider: () => (process.env.LLM_PROVIDER || "stub") as "groq" | "openrouter" | "gemini" | "stub",
  llmApiKey: () => process.env.LLM_API_KEY || "",
  llmModel: () => process.env.LLM_MODEL || "llama-3.1-8b-instant",

  // Slack incoming webhook for the `notify` step's outbox handler. If unset, the
  // notification is logged to the console instead of actually sent (also disclosed).
  slackWebhookUrl: () => process.env.SLACK_WEBHOOK_URL || "",
};
