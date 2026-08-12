-- AI Agent Workflow Builder — initial schema. auth.users is managed by nhost Auth.

create extension if not exists pgcrypto;

create type public.org_role as enum ('owner', 'editor', 'viewer');
create type public.step_type as enum ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
create type public.trigger_type as enum ('manual', 'webhook', 'scheduled', 'database_event');
create type public.run_status as enum ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
create type public.step_run_status as enum ('pending', 'running', 'succeeded', 'failed', 'paused', 'skipped');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_calls_allowed integer not null default 1000,
  quota_calls_used integer not null default 0,
  quota_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members(user_id);
create index org_members_org_id_idx on public.org_members(org_id);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflows_org_id_idx on public.workflows(org_id);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  step_order integer not null,
  type public.step_type not null,
  name text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, step_order)
);
create index workflow_steps_workflow_id_idx on public.workflow_steps(workflow_id);
create index workflow_steps_org_id_idx on public.workflow_steps(org_id);

create table public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.trigger_type not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflow_triggers_workflow_id_idx on public.workflow_triggers(workflow_id);
create index workflow_triggers_org_id_idx on public.workflow_triggers(org_id);
create index workflow_triggers_type_idx on public.workflow_triggers(type) where enabled;

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  status public.run_status not null default 'pending',
  trigger_type public.trigger_type not null default 'manual',
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index workflow_runs_workflow_id_idx on public.workflow_runs(workflow_id);
create index workflow_runs_org_id_idx on public.workflow_runs(org_id);
create index workflow_runs_status_idx on public.workflow_runs(status);

create table public.step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  status public.step_run_status not null default 'pending',
  input jsonb,
  output jsonb,
  error text,
  attempt integer not null default 0,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index step_runs_workflow_run_id_idx on public.step_runs(workflow_run_id);
create index step_runs_org_id_idx on public.step_runs(org_id);
create index step_runs_status_idx on public.step_runs(status);

-- db_write steps persist into this table ("saves a result into your own tables")
create table public.workflow_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_run_id uuid not null references public.step_runs(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index workflow_outputs_org_id_idx on public.workflow_outputs(org_id);
create index workflow_outputs_workflow_run_id_idx on public.workflow_outputs(workflow_run_id);

-- notify steps write here; a Hasura Event Trigger on INSERT fires the actual Slack/email send
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_run_id uuid not null references public.step_runs(id) on delete cascade,
  channel text not null default 'slack',
  message text not null,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_org_id_idx on public.notifications(org_id);

-- watched table for the database_event trigger type — a row inserted here fires a Hasura Event Trigger.
create table public.external_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'external',
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);
create index external_events_org_id_idx on public.external_events(org_id);

create view public.organization_stats as
select
  o.id as org_id,
  o.quota_calls_used,
  o.quota_calls_allowed,
  o.quota_period_start,
  count(distinct wr.id) filter (where wr.created_at >= date_trunc('month', now())) as runs_this_month,
  avg(extract(epoch from (wr.finished_at - wr.started_at)))
    filter (where wr.finished_at is not null and wr.started_at is not null) as avg_run_duration_seconds
from public.organizations o
left join public.workflow_runs wr on wr.org_id = o.id
group by o.id;

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflow_steps
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflow_triggers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.step_runs
  for each row execute function public.set_updated_at();

-- org_id is always derived server-side from the parent row, then locked against updates — the backstop under the Hasura permission checks.
create or replace function public.derive_org_from_workflow()
returns trigger as $$
begin
  select org_id into new.org_id from public.workflows where id = new.workflow_id;
  if new.org_id is null then
    raise exception 'invalid workflow_id %', new.workflow_id;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.derive_org_from_run()
returns trigger as $$
begin
  select org_id into new.org_id from public.workflow_runs where id = new.workflow_run_id;
  if new.org_id is null then
    raise exception 'invalid workflow_run_id %', new.workflow_run_id;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.lock_org_id()
returns trigger as $$
begin
  new.org_id = old.org_id;
  return new;
end;
$$ language plpgsql;

create trigger derive_org before insert on public.workflow_steps
  for each row execute function public.derive_org_from_workflow();
create trigger lock_org before update on public.workflow_steps
  for each row execute function public.lock_org_id();

create trigger derive_org before insert on public.workflow_triggers
  for each row execute function public.derive_org_from_workflow();
create trigger lock_org before update on public.workflow_triggers
  for each row execute function public.lock_org_id();

create trigger derive_org before insert on public.workflow_runs
  for each row execute function public.derive_org_from_workflow();

create trigger derive_org before insert on public.step_runs
  for each row execute function public.derive_org_from_run();

create trigger derive_org before insert on public.workflow_outputs
  for each row execute function public.derive_org_from_run();

create trigger derive_org before insert on public.notifications
  for each row execute function public.derive_org_from_run();
