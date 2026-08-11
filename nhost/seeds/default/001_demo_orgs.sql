-- Demo seed for the Final Task scenario: two orgs, each with an owner/editor/viewer.
--
-- Run this AFTER the four demo users below have signed up once through the frontend
-- (nhost Auth needs to create the auth.users rows itself). Replace the emails if you
-- used different ones. Then apply with:
--
--   hasura seed apply --database-name default
--
-- or paste it into the Hasura Console's SQL tab.

insert into public.organizations (name, quota_calls_allowed)
values ('Org A', 1000), ('Org B', 1000)
on conflict do nothing;

-- Org A
insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'owner'::public.org_role
from public.organizations o, auth.users u
where o.name = 'Org A' and u.email = 'owner-a@example.com'
on conflict (org_id, user_id) do nothing;

insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'editor'::public.org_role
from public.organizations o, auth.users u
where o.name = 'Org A' and u.email = 'editor-a@example.com'
on conflict (org_id, user_id) do nothing;

insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'viewer'::public.org_role
from public.organizations o, auth.users u
where o.name = 'Org A' and u.email = 'viewer-a@example.com'
on conflict (org_id, user_id) do nothing;

-- Org B
insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'owner'::public.org_role
from public.organizations o, auth.users u
where o.name = 'Org B' and u.email = 'owner-b@example.com'
on conflict (org_id, user_id) do nothing;

insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'editor'::public.org_role
from public.organizations o, auth.users u
where o.name = 'Org B' and u.email = 'editor-b@example.com'
on conflict (org_id, user_id) do nothing;
