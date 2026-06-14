-- Admin push lookup: bypass RLS safely via SECURITY DEFINER functions.
-- Parent feed uses student_parents as the parent user; admin push was blocked by RLS
-- even when rows exist, causing "no student_parents rows" in the console.

create or replace function public.get_push_subscriptions_for_students(target_student_ids uuid[])
returns table (
  parent_id uuid,
  student_id uuid,
  subscription jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.parent_id,
    sp.student_id,
    p.web_push_subscription as subscription
  from public.student_parents sp
  join public.profiles p on p.id = sp.parent_id
  where sp.student_id = any(target_student_ids)
    and public.is_admin()
    and p.web_push_subscription is not null;
$$;

create or replace function public.get_push_subscriptions_for_group(target_group_id uuid)
returns table (
  parent_id uuid,
  student_id uuid,
  subscription jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.parent_id,
    sp.student_id,
    p.web_push_subscription as subscription
  from public.student_groups sg
  join public.student_parents sp on sp.student_id = sg.student_id
  join public.profiles p on p.id = sp.parent_id
  where sg.group_id = target_group_id
    and public.is_admin()
    and p.web_push_subscription is not null;
$$;

revoke all on function public.get_push_subscriptions_for_students(uuid[]) from public;
revoke all on function public.get_push_subscriptions_for_group(uuid) from public;

grant execute on function public.get_push_subscriptions_for_students(uuid[]) to authenticated;
grant execute on function public.get_push_subscriptions_for_group(uuid) to authenticated;
