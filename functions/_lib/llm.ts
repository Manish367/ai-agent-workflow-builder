import { env } from "./env";

export interface LlmResult {
  text: string;
  provider: string;
  stubbed: boolean;
}

// Real call for Groq / OpenRouter (both speak the OpenAI chat-completions shape) and
// Gemini (its own shape). Falls back to a disclosed stub with an artificial delay
// when no LLM_API_KEY is configured, per the assignment's explicit "stub is fine"
// allowance.
export async function callLlm(prompt: string, config: Record<string, any> = {}): Promise<LlmResult> {
  const provider = env.llmProvider();
  const apiKey = env.llmApiKey();

  if (provider === "stub" || !apiKey) {
    const delayMs = config.stub_delay_ms ?? 1200;
    await new Promise((r) => setTimeout(r, delayMs));
    return {
      text: `[STUBBED LLM RESPONSE — no LLM_API_KEY configured, artificial ${delayMs}ms delay] Echo of prompt: ${prompt.slice(0, 300)}`,
      provider: "stub",
      stubbed: true,
    };
  }

  if (provider === "groq" || provider === "openrouter") {
    const base = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://openrouter.ai/api/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || env.llmModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: config.temperature ?? 0.7,
      }),
    });
    if (!res.ok) throw new Error(`LLM provider ${provider} returned ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: json.choices?.[0]?.message?.content ?? "", provider, stubbed: false };
  }

  if (provider === "gemini") {
    const model = config.model || env.llmModel() || "gemini-1.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error(`LLM provider gemini returned ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    return { text, provider: "gemini", stubbed: false };
  }

  throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
}
