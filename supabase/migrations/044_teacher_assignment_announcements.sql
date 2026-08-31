-- Align parent announcement visibility and teacher contacts with şube-based teacher_assignments.

create or replace function public.parent_can_read_announcement(target public.announcements)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_parents sp
    join public.students s on s.id = sp.student_id
    join public.teacher_assignments ta on ta.class_id = s.class_id
    where sp.parent_id = auth.uid()
      and ta.teacher_id = target.author_id
      and s.class_id is not null
  );
$$;

create or replace function public.get_parent_teacher_contacts()
returns table (
  teacher_id uuid,
  full_name text,
  phone text,
  student_id uuid,
  student_full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    ta.teacher_id,
    p.full_name,
    p.phone,
    s.id as student_id,
    s.full_name as student_full_name
  from public.student_parents sp
  join public.students s on s.id = sp.student_id
  join public.teacher_assignments ta on ta.class_id = s.class_id
  join public.profiles p on p.id = ta.teacher_id
  where sp.parent_id = auth.uid()
    and p.role = 'teacher'
    and s.class_id is not null
    and s.school_id = (
      select pr.school_id
      from public.profiles pr
      where pr.id = auth.uid()
    )
  order by p.full_name, s.full_name;
$$;

revoke all on function public.get_parent_teacher_contacts() from public;
grant execute on function public.get_parent_teacher_contacts() to authenticated;
