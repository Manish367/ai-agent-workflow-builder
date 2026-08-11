# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on nhost (Postgres + Hasura + Auth) with a
Next.js frontend. Organizations, role-scoped permissions at two layers, workflow
steps/triggers, and a Hasura Action-driven execution engine with live subscriptions.

> **Environment note:** this repo was authored in a sandbox with Node/npm/git but
> **no Docker and no nhost/Hasura CLI available**, so the schema/metadata/handlers
> below have been written carefully and type-checked (`functions/` passes `tsc
> --noEmit`, `frontend/` passes `next build`), but **not run against a live
> Hasura/Postgres instance**. Follow the steps below to stand it up; if something in
> the metadata format needs a small tweak once you point a real Hasura Console at it,
> that's expected — the Console's "Consistency" checker will point at exactly what.

## Architecture

```
nhost/
  migrations/default/…        Postgres schema (tables, enums, triggers, view)
  seeds/default/…              Demo org/member seed for the Final Task scenario
  metadata/                    Hasura metadata: tables, relationships, permissions,
                                actions, event triggers, cron trigger
  nhost.toml                   nhost project config
  example-operations.graphql   Reference queries/mutations/subscription
functions/                     Hasura Action / Event Trigger / Cron handlers (TS)
  _lib/engine.ts               Core run executor: quota, retries, pause/resume
  actions/                     triggerWorkflowRun, approveStep, webhookTriggerRun
  events/                      notification outbox sender, database-event starter
  scheduled/                   cron poller for `scheduled` triggers
frontend/                      Next.js app (Pages Router) — auth, builder, run view
```

## Data model

`organizations` → `org_members` (user_id, org_id, role) → `workflows` →
`workflow_steps` / `workflow_triggers` → `workflow_runs` → `step_runs`. Plus
`workflow_outputs` (db_write target), `notifications` (notify outbox),
`external_events` (the watched table for `database_event` triggers), and a
`organization_stats` view (runs this month + avg run duration) for the required
aggregation. See [`nhost/migrations/default/1755000000000_init_schema/up.sql`](nhost/migrations/default/1755000000000_init_schema/up.sql)
for the full DDL and inline comments explaining the integrity triggers.

## The two permission layers

**Layer 1 (org + role scoping)** is a Hasura row-level permission on every table:
every `select`/`insert`/`update`/`delete` permission filters through an
`organization.members` (or `workflow.organization.members`) relationship checking
`user_id = X-Hasura-User-Id`, with role checks (`role: {_in: [owner, editor]}`) added
for write access. `org_id` is never trusted from client input on child tables — a
`derive_org_from_workflow`/`derive_org_from_run` Postgres trigger fills it from the
parent row server-side, and `lock_org_id` prevents it from being changed afterward.
This is what makes cross-org isolation hold even against a client that guesses a
`workflow_id`/`step_run_id` from another org: there is no relationship path from
"logged in as a member of Org B" to a row scoped to Org A.

**Layer 2 (step-level gating)** has two different enforcement points, matching the
two different kinds of decision:
- *Who can add a sensitive step/trigger* (`db_write`, `notify`, webhook trigger) is
  still a Hasura permission — one boolean expression combining Layer 1 + a
  `type _nin [...]` check, so non-sensitive types are owner-or-editor and sensitive
  ones are owner-only. See [`public_workflow_steps.yaml`](nhost/metadata/databases/default/tables/public_workflow_steps.yaml).
- *Clearing an `approval_gate`* is **not** a database permission — see
  [`functions/actions/approve-step.ts`](functions/actions/approve-step.ts): the
  handler loads the step_run, confirms it's actually `paused`, re-queries
  `org_members` for the caller's *current* role, and only then updates the row and
  resumes execution. `workflow_runs`/`step_runs` have **no** insert/update Hasura
  permission for role `user` at all — the Action (running with the admin secret) is
  the only writer, so there's no way to approve a step by calling a raw mutation.

## The Action handler (`triggerWorkflowRun` → `functions/_lib/engine.ts`)

`startWorkflowRun` → verifies caller role (manual runs only — webhook/scheduled/
database_event runs are pre-authorized by however that trigger row itself required
owner/editor to create) → checks quota → inserts `workflow_run` → calls `runWorkflow`.

`runWorkflow` re-derives everything from the DB every time it's called (fresh run
*or* resume-after-approval look identical to it): walk the workflow's steps in
order, skip any that already have a terminal `step_run`, execute the first one that
doesn't. `llm_call`/`http_request` get one retry (`withRetry`, 2 attempts) with a
short backoff. Hitting `approval_gate` sets the step_run and workflow_run to
`paused` and **returns** — no further steps run until `approveStep` flips the run
back to `running` and calls `runWorkflow` again, which picks up exactly where it
left off (see the `existingByStep` skip logic). `conditional_branch` evaluates
`config.{field,operator,value}` against the previous step's output and records a
`branch: true/false`; any later step can set `config.run_if_branch: true|false` to
only run on a matching branch. Quota is incremented once, when the run reaches a
terminal state, by however many external (`llm_call`/`http_request`) calls it
actually made.

## Prerequisites

- Node.js 18+, npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local
  Hasura/Postgres via the nhost CLI) **or** an [nhost](https://nhost.io) cloud
  project
- The [nhost CLI](https://docs.nhost.io/reference/cli/installation)
- Optional: a free-tier LLM API key ([Groq](https://console.groq.com),
  [OpenRouter](https://openrouter.ai), or [Gemini](https://ai.google.dev)) — without
  one, `llm_call` steps use a disclosed stub with an artificial delay
- Optional: a Slack [incoming webhook URL](https://api.slack.com/messaging/webhooks)
  — without one, `notify` steps log to the function's console instead of sending

## Setup

1. **Start the backend**
   ```bash
   npm install -g nhost
   cd nhost
   nhost up
   ```
   This starts local Postgres + Hasura + Auth and applies the migrations in
   `nhost/migrations/`. Then apply metadata:
   ```bash
   nhost hasura metadata apply
   ```
   (or open the Hasura Console nhost prints and use "Metadata → Apply" / import the
   `nhost/metadata` folder.)

2. **Configure project secrets** (local: a `.env.development` file at the `nhost/`
   project root; cloud: `nhost secrets create` or the dashboard's Environment Variables
   panel). These are read by *Hasura*, which forwards them to your webhook URLs and
   also needs `HASURA_GRAPHQL_ADMIN_SECRET`/`HASURA_GRAPHQL_DATABASE_URL` for itself
   (the CLI sets those two automatically for local dev):
   ```
   ACTION_SECRET=<random string>
   EVENT_TRIGGER_SECRET=<random string>
   ACTIONS_BASE_URL=<url nhost prints for your functions — see `nhost up` output>
   NOTIFICATION_OUTBOX_WEBHOOK_URL=${ACTIONS_BASE_URL}/events/notification-outbox
   DATABASE_EVENT_WEBHOOK_URL=${ACTIONS_BASE_URL}/events/database-event-trigger
   ```

3. **Configure the functions themselves** — copy `functions/.env.example` to
   `functions/.env` and fill in `HASURA_GRAPHQL_URL`, `HASURA_GRAPHQL_ADMIN_SECRET`,
   the same `ACTION_SECRET`/`EVENT_TRIGGER_SECRET` as step 2, and optionally
   `LLM_PROVIDER`/`LLM_API_KEY`/`SLACK_WEBHOOK_URL`. The nhost CLI serves
   `functions/` automatically as part of `nhost up`.

4. **Seed the Final Task demo data** — sign up 5 users through the frontend (see
   step 6) using the emails referenced in
   [`nhost/seeds/default/001_demo_orgs.sql`](nhost/seeds/default/001_demo_orgs.sql)
   (or edit the file to use your own), then apply it:
   ```bash
   nhost hasura seed apply --database-name default
   ```

5. **Run the frontend**
   ```bash
   cd frontend
   npm install
   cp .env.local.example .env.local   # defaults to subdomain "local", no edits needed
   npm run dev
   ```
   Open http://localhost:3000.

6. **Deploying**: push this repo to GitHub, connect it to
   [nhost cloud](https://nhost.io) (Postgres/Hasura/Auth/Functions) and
   [Vercel](https://vercel.com) (root directory `frontend/`, env vars
   `NEXT_PUBLIC_NHOST_SUBDOMAIN`/`NEXT_PUBLIC_NHOST_REGION` from your nhost project).

## Demonstrating the Final Task scenario

1. Sign up the 5 demo users (or your own), run the seed (step 4 above) to create
   **Org A** (owner/editor/viewer) and **Org B** (owner/editor).
2. As Org A's owner, build a workflow: an `llm_call` step (prompt referencing
   `{{previous...}}` if chained), an `http_request` step, and a `conditional_branch`
   step with `config.field` pointing at the `llm_call` step's output field (e.g.
   `"field": "text", "operator": "contains", "value": "..."`) — give a later step
   `config.run_if_branch: true/false` to see the branch actually change behavior.
   Add an `approval_gate` step. Add a `webhook` trigger (owner-only — copy its
   generated secret) and/or a `database_event` trigger.
3. Start it once with the **Run** button (manual), and once via the webhook trigger
   — `mutation { webhookTriggerRun(workflow_id: "...", secret: "...") { ... } }`
   from any GraphQL client, or via "Simulate external event" in the dashboard for
   `database_event`.
4. Watch the run panel live-update with no refresh; when it hits the
   `approval_gate` it shows `paused` with Approve/Reject — approve as the owner or
   editor and watch it resume.
5. Log out, log in as an Org B user, and confirm the dashboard shows none of Org A's
   workflows, and that pasting an Org A `workflow_id`/`step_run_id` directly into a
   GraphQL query returns nothing (the row-level filter, not a 403, is the proof —
   there's no error to leak that the row exists).

## What's stubbed / simplified

- `llm_call` and `notify` fall back to disclosed stubs (artificial delay / console
  log) when `LLM_API_KEY`/`SLACK_WEBHOOK_URL` aren't set — real calls otherwise.
- Org creation is via the seed script / Hasura Console admin access for this demo,
  not a self-serve "create organization" flow (out of scope for the assignment's
  permission model, which assumes existing orgs).
- `conditional_branch` uses a small, explicit condition schema
  (`field`/`operator`/`value`) rather than an expression language.
