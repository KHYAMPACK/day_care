-- Align is_director() with app role checks (profile_roles + legacy profiles.role / primary_role).
-- Fixes accounting tuition writes when profile_roles row is missing but profiles.role = director.

insert into public.profile_roles (profile_id, role)
select p.id, 'director'::public.user_role
from public.profiles p
where (p.role = 'director'::public.user_role or p.primary_role = 'director'::public.user_role)
  and not exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = p.id
      and pr.role = 'director'::public.user_role
  )
on conflict (profile_id, role) do nothing;

create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'director'::public.user_role
        or p.primary_role = 'director'::public.user_role
        or exists (
          select 1
          from public.profile_roles pr
          where pr.profile_id = p.id
            and pr.role = 'director'::public.user_role
        )
      )
  );
$$;

grant execute on function public.is_director() to authenticated;

notify pgrst, 'reload schema';
