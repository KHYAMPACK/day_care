-- Rehberlikçi also teaches: allow teacher_assignments when profile_roles has teacher,
-- even if legacy profiles.role is counselor. Prefer teacher over counselor for legacy role.

create or replace function public.enforce_teacher_assignment()
returns trigger
language plpgsql
as $$
declare
  v_role public.user_role;
  v_teacher_school uuid;
  v_class_school uuid;
  v_class_grade smallint;
  v_subject_grade smallint;
  v_has_teacher_role boolean;
begin
  select p.role, p.school_id
  into v_role, v_teacher_school
  from public.profiles p
  where p.id = new.teacher_id;

  select exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = new.teacher_id
      and pr.role = 'teacher'
  )
  into v_has_teacher_role;

  if not v_has_teacher_role and v_role is distinct from 'teacher' then
    raise exception 'teacher_id must reference a profile with role ''teacher''';
  end if;

  select c.school_id, c.grade
  into v_class_school, v_class_grade
  from public.classes c
  where c.id = new.class_id;

  select cs.grade
  into v_subject_grade
  from public.curriculum_subjects cs
  where cs.id = new.subject_id;

  if v_teacher_school is distinct from v_class_school then
    raise exception 'Öğretmen ve şube aynı okula ait olmalıdır.';
  end if;

  if v_class_grade is distinct from v_subject_grade then
    raise exception 'Ders, şubenin sınıf düzeyi ile eşleşmelidir.';
  end if;

  return new;
end;
$$;

create or replace function public.sync_profiles_primary_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_primary public.user_role;
begin
  v_profile_id := coalesce(NEW.profile_id, OLD.profile_id);

  select pr.role into v_primary
  from public.profile_roles pr
  where pr.profile_id = v_profile_id
  order by
    case pr.role
      when 'director' then 1
      when 'teacher' then 2
      when 'counselor' then 3
      when 'parent' then 4
      else 5
    end
  limit 1;

  update public.profiles
  set role = coalesce(v_primary, 'parent'::public.user_role)
  where id = v_profile_id;

  return coalesce(NEW, OLD);
end;
$$;

-- Backfill legacy role for teacher+counselor staff (prefer teacher over counselor).
update public.profiles p
set role = 'teacher'::public.user_role
where p.role = 'counselor'::public.user_role
  and exists (
    select 1 from public.profile_roles pr
    where pr.profile_id = p.id and pr.role = 'teacher'
  )
  and not exists (
    select 1 from public.profile_roles pr
    where pr.profile_id = p.id and pr.role = 'director'
  );

notify pgrst, 'reload schema';
