-- Role-based tenant isolation for Supabase/PostgreSQL.
-- Run after confirming profiles.id and every organization_id column use compatible values.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.current_organization_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id::text
  from public.profiles as p
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_organization_id() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_organization_id() to authenticated;

-- RLS is defense in depth; the API also supplies organization_id predicates.
alter table public.members enable row level security;
alter table public.members force row level security;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;

 drop policy if exists members_same_organization_select on public.members;
 drop policy if exists members_admin_insert on public.members;
 drop policy if exists members_admin_update on public.members;
 drop policy if exists members_admin_delete on public.members;

create policy members_same_organization_select
on public.members for select to authenticated
using (organization_id::text = public.current_organization_id());

create policy members_admin_insert
on public.members for insert to authenticated
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy members_admin_update
on public.members for update to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
)
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy members_admin_delete
on public.members for delete to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

 drop policy if exists tasks_same_organization_select on public.tasks;
 drop policy if exists tasks_admin_insert on public.tasks;
 drop policy if exists tasks_admin_update on public.tasks;
 drop policy if exists tasks_admin_delete on public.tasks;

create policy tasks_same_organization_select
on public.tasks for select to authenticated
using (organization_id::text = public.current_organization_id());

create policy tasks_admin_insert
on public.tasks for insert to authenticated
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy tasks_admin_update
on public.tasks for update to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
)
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy tasks_admin_delete
on public.tasks for delete to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

 drop policy if exists events_same_organization_select on public.events;
 drop policy if exists events_admin_insert on public.events;
 drop policy if exists events_admin_update on public.events;
 drop policy if exists events_admin_delete on public.events;

create policy events_same_organization_select
on public.events for select to authenticated
using (organization_id::text = public.current_organization_id());

create policy events_admin_insert
on public.events for insert to authenticated
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy events_admin_update
on public.events for update to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
)
with check (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);

create policy events_admin_delete
on public.events for delete to authenticated
using (
  public.current_user_role() = 'admin'
  and organization_id::text = public.current_organization_id()
);
