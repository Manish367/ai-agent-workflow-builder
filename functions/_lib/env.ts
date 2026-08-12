function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  // Custom env var names can't start with NHOST_/HASURA_/AUTH_/STORAGE_/POSTGRES_ on nhost cloud, hence the plain name; admin secret reuses the system-provided NHOST_ADMIN_SECRET.
  hasuraGraphqlUrl: () => required("GRAPHQL_ENDPOINT"),
  hasuraAdminSecret: () => required("NHOST_ADMIN_SECRET"),

  // Lets a handler refuse any request that didn't actually come from this project's own Hasura instance.
  actionSecret: () => process.env.ACTION_SECRET || "",
  eventSecret: () => process.env.EVENT_TRIGGER_SECRET || "",

  // Falls back to a disclosed stub with an artificial delay when LLM_API_KEY is unset.
  llmProvider: () => (process.env.LLM_PROVIDER || "stub") as "groq" | "openrouter" | "gemini" | "stub",
  llmApiKey: () => process.env.LLM_API_KEY || "",
  llmModel: () => process.env.LLM_MODEL || "llama-3.1-8b-instant",

  // Falls back to a console-log stub when unset.
  slackWebhookUrl: () => process.env.SLACK_WEBHOOK_URL || "",
};
