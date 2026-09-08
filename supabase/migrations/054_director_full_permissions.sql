-- Any staff member with the director role gets full müdür permissions
-- (not only accounts whose primary_role was set to director at creation).

create or replace function public.is_full_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_director();
$$;

create or replace function public.is_assistant_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

grant execute on function public.is_full_director() to authenticated;
grant execute on function public.is_assistant_director() to authenticated;

notify pgrst, 'reload schema';
