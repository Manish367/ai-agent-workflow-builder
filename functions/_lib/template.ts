// Minimal templating so step config can reference the previous step's output, e.g.
// `{ "message": "LLM said: {{previous.text}}" }` or `{ "field": "previous.sentiment" }`.
// Deliberately tiny (dot-path get + string interpolation) — not a general template
// engine, just enough to wire one step's output into the next step's input.

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), { previous: obj });
}

export function interpolate(value: unknown, context: { previous: unknown }): unknown {
  if (typeof value === "string") {
    const match = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (match) return getPath(context.previous, match[1]);
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const resolved = getPath(context.previous, path);
      return resolved === undefined ? "" : String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, context)]));
  }
  return value;
}
