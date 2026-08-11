export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function executeHttpRequest(config: Record<string, any>): Promise<HttpResult> {
  if (!config.url) throw new Error("http_request step config.url is required");

  const controller = new AbortController();
  const timeoutMs = config.timeout_ms ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(config.url, {
      method: config.method || "GET",
      headers: config.headers || {},
      body: config.body ? JSON.stringify(config.body) : undefined,
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      throw new Error(`http_request to ${config.url} failed with status ${res.status}`);
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, headers, body };
  } finally {
    clearTimeout(timeout);
  }
}
