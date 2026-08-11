# Write-up

## Schema reasoning

The core chain is `organizations → org_members → workflows → {workflow_steps,
workflow_triggers} → workflow_runs → step_runs`, plus three tables that exist purely
to make specific step/trigger types real rather than notional: `workflow_outputs`
(where `db_write` actually saves something), `notifications` (an outbox `notify`
writes to, decoupled from the actual send), and `external_events` (the "watched
table" a `database_event` trigger watches).

The one deliberate schema decision worth explaining is denormalizing `org_id` onto
every descendant table (`workflow_steps`, `workflow_triggers`, `workflow_runs`,
`step_runs`, `workflow_outputs`, `notifications`) instead of relying purely on
`workflow_id` → `workflows.org_id` joins. Two reasons: it lets every Hasura
permission on every table be a *one-hop* relationship check (`organization.members`)
instead of a growing chain of joins as the hierarchy gets deeper, and it lets
`step_runs`/`workflow_runs` — which don't have a direct `workflow_id` in the
"how do I check this row's org" sense that matters for permissions — be scoped just
as cheaply as everything else. The risk of denormalization is drift (a row's `org_id`
disagreeing with its parent's), so it's never client-writable: a `BEFORE INSERT`
trigger derives it from the parent, and a `BEFORE UPDATE` trigger locks it against
being changed. That backstop matters because the Action handler writes these tables
with the Hasura admin secret, which bypasses permissions entirely — the trigger is
the thing that's actually unconditional.

`organization_stats` is a plain SQL view (avg run duration + runs this month),
tracked as a Hasura table with a manual object relationship back to `organizations`,
rather than a computed field function — a view keeps the aggregation visible and
testable with plain SQL, and Hasura permissions on it reuse the same
`organization.members` pattern as everything else.

## The two permission layers, and why they're enforced differently

**Layer 1** (org + role scoping) is uniform across every table: one Hasura role
(`user`) plus a row filter that always resolves to "is the caller a member of this
row's org, with an adequate role." It's a pure row-level-security problem, so it
belongs entirely in Hasura's declarative permissions — no code needed, and no way to
forget it on some code path, because it isn't code.

**Layer 2** splits into two enforcement points because it's actually two different
kinds of question:

- *"Can this role create this kind of row?"* (only an owner may add a `db_write` or
  `notify` step, or a `webhook` trigger) is still a row-permission question — it's
  evaluated once, at insert/update time, against the values in that exact row. So it
  stays declarative: one boolean expression per table combining Layer 1's org/role
  check with a `type _nin/_neq [...]` branch, so the *same* permission rule is
  "owner-or-editor" for ordinary types and "owner-only" for the sensitive ones. See
  `workflow_steps`/`workflow_triggers` in `nhost/metadata/`.

- *"Can this role clear this specific paused gate, right now?"* is not a row
  permission at all — it's a state transition (`paused → succeeded/failed`) that
  also has to trigger a side effect (resume execution). A Hasura permission can
  authorize a write; it can't authorize "and then go run the rest of the workflow."
  So `workflow_runs`/`step_runs` simply have **no** insert/update permission for role
  `user` — there is no GraphQL mutation a client can call to touch these tables
  directly, approval included. The only door in is the `approveStep` Action, which
  runs with the admin secret (bypassing row permissions) but re-derives the
  authorization decision itself: load the step_run, confirm it's actually `paused`
  (reject if some other client already resolved it), query `org_members` fresh for
  the caller's *current* role in that run's org, and only then write the row and
  resume. Doing the role check in code instead of leaning on a cached/assumed role
  is what makes it correct if someone's role changed since the run started.

## Approval-gate pause/resume

`runWorkflow(runId)` is written to be safely callable twice for the same run: it
loads the workflow's steps in order and the run's existing `step_runs`, and for each
step, if a terminal (`succeeded`/`skipped`/`failed`) `step_run` already exists it
folds that row's output into the running context and moves on — otherwise it
executes the step fresh. Hitting an `approval_gate` step marks its `step_run` and
the parent `workflow_run` as `paused` and returns immediately; no later steps run.

`approveStep` does the authorization (above), then flips the gate's `step_run` to
`succeeded` (recording `approved_by`/`approved_at`), flips `workflow_run` back to
`running`, and calls `runWorkflow(runId)` again. Because that function re-reads
state from the DB rather than holding anything in memory between calls, resuming
"from the middle" isn't a special code path — it's the same function finding that
every step through the gate is already terminal and continuing from the first one
that isn't. A `run.status === 'paused'` guard at the top of `runWorkflow` also makes
it idempotent against a second concurrent trigger while still paused. Rejecting an
approval instead marks the gate's `step_run` and the run itself `failed` and stops.

Every state change (`step_run`/`workflow_run` status, `approved_by`, output, error)
is written as its own Hasura mutation from the handler, which is what the
`step_runs` subscription (filtered to `workflow_run_id`, org-scoped by the same
Layer 1 permission) picks up live — the frontend never polls for run progress.
