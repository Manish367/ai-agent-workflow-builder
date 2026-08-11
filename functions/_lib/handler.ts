import type { Request, Response } from "express";
import { env } from "./env";
import { HttpError } from "./engine";

export interface ActionBody {
  action: { name: string };
  input: Record<string, any>;
  session_variables: Record<string, string>;
}

// Every Action handler request carries this shared secret (configured as a static
// header in nhost/metadata/actions.yaml). It's not user-facing auth — it just stops
// someone from finding the function URL and invoking it directly, skipping Hasura
// (and, more importantly, skipping the audit trail session_variables give us).
export function assertActionSecret(req: Request): void {
  if (req.header("x-action-secret") !== env.actionSecret()) {
    throw new HttpError(401, "Invalid action secret");
  }
}

export function assertEventSecret(req: Request): void {
  if (req.header("x-event-secret") !== env.eventSecret()) {
    throw new HttpError(401, "Invalid event secret");
  }
}

export function getCallerUserId(body: ActionBody): string | null {
  return body.session_variables?.["x-hasura-user-id"] ?? null;
}

export function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err?.message ?? "Internal error";
      if (status >= 500) console.error(err);
      res.status(status).json({ message });
    }
  };
}
