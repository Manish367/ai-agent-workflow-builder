import type { Request, Response } from "express";
import { env } from "./env";
import { HttpError } from "./engine";

export interface ActionBody {
  action: { name: string };
  input: Record<string, any>;
  session_variables: Record<string, string>;
}

// Not user-facing auth — just stops someone from invoking the function URL directly, bypassing Hasura and its session_variables audit trail.
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
