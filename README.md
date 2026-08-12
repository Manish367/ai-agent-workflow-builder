# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on nhost (Postgres + Hasura + Auth) with a
Next.js frontend. Organizations, role-scoped permissions at two layers, workflow
steps/triggers, and a Hasura Action-driven execution engine with live subscriptions.

**Live app:** https://ai-agent-workflow-builder-xi.vercel.app

> **Environment note:** this was authored without Docker available, so instead of
> local `nhost up` it was applied straight to an **nhost cloud** project — the
> standalone [Hasura CLI](https://hasura.io/docs/latest/hasura-cli/overview/) (no
> Docker needed) for `migrate apply`/`metadata apply`, and nhost's GitHub-connected
> **Deployments** for the Functions. Local `nhost up` (Docker) works too if you
> prefer it — see the alternate path below.

## Architecture

```
nhost/                        nhost project — must be a literal "nhost/" folder at
                               repo root: that's the deploy convention nhost cloud's
                               Deployments step expects (Base Directory = the parent
                               of this folder)
  nhost.toml                   nhost project config
  config.yaml                  Hasura CLI project config (endpoint, directories)
  migrations/default/…         Postgres schema (tables, enums, triggers, view)
  metadata/                    Hasura metadata: tables, relationships, permissions,
                                actions, event triggers, cron trigger
  seeds/default/…              Demo org/member seed for the Final Task scenario
  example-operations.graphql   Reference queries/mutations/subscription
functions/                     Hasura Action / Event Trigger / Cron handlers (TS) —
                                sibling of nhost/, NOT nested inside it
  _lib/engine.ts                Core run executor: quota, retries, pause/resume
  actions/                      triggerWorkflowRun, approveStep, webhookTriggerRun
  events/                       notification outbox sender, database-event starter
  scheduled/                    cron poller for `scheduled` triggers
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
- An [nhost](https://nhost.io) cloud project (free tier) — Postgres/Hasura/Auth/
  Functions all hosted, no Docker needed. (Local `nhost up` via the
  [nhost CLI](https://docs.nhost.io/reference/cli/installation) works too, but that
  CLI requires Docker + WSL2 on Windows.)
- The standalone [Hasura CLI](https://github.com/hasura/graphql-engine/releases) —
  a single binary, no Docker — for applying migrations/metadata directly.
- Optional: a free-tier LLM API key ([Groq](https://console.groq.com),
  [OpenRouter](https://openrouter.ai), or [Gemini](https://ai.google.dev)) — without
  one, `llm_call` steps use a disclosed stub with an artificial delay
- Optional: a Slack [incoming webhook URL](https://api.slack.com/messaging/webhooks)
  — without one, `notify` steps log to the function's console instead of sending

## Setup (nhost cloud — the path this repo was actually built and tested against)

1. **Create an nhost project** at [app.nhost.io](https://app.nhost.io) and note its
   **subdomain** and **region** from the project dashboard.

2. **Point `nhost/config.yaml` at it** — edit the `endpoint:` line to
   `https://<subdomain>.hasura.<region>.nhost.run`.

3. **Apply the schema and metadata** with the Hasura CLI, from the `nhost/` folder
   (that's where `config.yaml` and the `migrations/`/`metadata/`/`seeds/` it points
   at live):
   ```bash
   cd nhost
   hasura migrate apply --database-name default --admin-secret <your admin secret>
   hasura metadata apply --admin-secret <your admin secret>
   ```
   The admin secret's real value is under **Settings → Secrets** in the dashboard
   (write-only in the UI — if you can't reveal it, just overwrite it with your own
   random string via the ⋮ menu, then use that).

4. **Set project environment variables** (**Settings → Environment Variables**).
   Custom variable names can't start with `NHOST_`/`HASURA_`/`AUTH_`/`STORAGE_`/
   `POSTGRES_`, hence the naming below:
   ```
   GRAPHQL_ENDPOINT=https://<subdomain>.hasura.<region>.nhost.run/v1/graphql
   ACTION_SECRET=<random string>
   EVENT_TRIGGER_SECRET=<random string>
   ACTIONS_BASE_URL=https://<subdomain>.functions.<region>.nhost.run/v1
   NOTIFICATION_OUTBOX_WEBHOOK_URL=https://<subdomain>.functions.<region>.nhost.run/v1/events/notification-outbox
   DATABASE_EVENT_WEBHOOK_URL=https://<subdomain>.functions.<region>.nhost.run/v1/events/database-event-trigger
   LLM_PROVIDER=stub
   ```
   `NHOST_ADMIN_SECRET` already exists as a system variable — the functions read
   that directly, no need to duplicate it.

5. **Deploy the Functions** — push this repo to GitHub, then in
   **Settings → Deployments**, "Connect to GitHub", pick the repo, and set
   **Base Directory to `./`** (repo root — nhost's deploy step expects `Base
   Directory/nhost/nhost.toml` plus a sibling `Base Directory/functions/`, which is
   exactly `nhost/` + `functions/` both living at repo root).
   Automatic Deploys will build on every push from here on.

6. **Seed the Final Task demo data** — sign up 5 users through the frontend (step
   8 below) using the emails referenced in
   [`nhost/seeds/default/001_demo_orgs.sql`](nhost/seeds/default/001_demo_orgs.sql)
   (or edit the file to use your own), then apply it from the `nhost/` folder:
   ```bash
   hasura seed apply --database-name default --admin-secret <your admin secret>
   ```

7. **Verify the Action handler is reachable** once deployed:
   ```bash
   curl -X POST https://<subdomain>.functions.<region>.nhost.run/v1/actions/trigger-workflow-run \
     -H "content-type: application/json" -H "x-action-secret: <ACTION_SECRET>" -d '{"input":{}}'
   ```
   A JSON error about a missing `workflow_id` (rather than a 500 "item not found")
   means the function is live.

8. **Run the frontend**
   ```bash
   cd frontend
   npm install
   cp .env.local.example .env.local
   # set NEXT_PUBLIC_NHOST_SUBDOMAIN / NEXT_PUBLIC_NHOST_REGION to your project's
   npm run dev
   ```
   Open http://localhost:3000. For the hosted deliverable, deploy `frontend/` to
   [Vercel](https://vercel.com) (root directory `frontend/`, same two env vars).

### Alternate: local Docker instead of cloud

If you have Docker Desktop (and, on Windows, WSL2) available: `npm install -g nhost`,
then `nhost up` from the repo root applies `nhost/migrations/`/`nhost/metadata/` and
serves `functions/` automatically against a local Postgres+Hasura+Auth stack — no
manual Hasura CLI steps or dashboard env vars needed, `nhost up`'s own output prints
the local functions URL to use for `ACTIONS_BASE_URL` etc.

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
