-- Atlas: no şube atama. Every teacher in the school can reach every class.
-- Also lets two teachers of the same branş (e.g. two matematik) share 8-A.

-- ---------------------------------------------------------------------------
-- Enable Atlas for Atlas VIP (created without the flag, so Şube Atama stayed visible)
-- ---------------------------------------------------------------------------

update public.schools
set features = coalesce(features, '{}'::jsonb) || '{"atlas_schedule": true}'::jsonb
where name ilike '%Atlas VIP%';

-- Co-teachers: one class × subject may have more than one teacher.
alter table public.teacher_assignments
  drop constraint if exists teacher_assignments_class_subject_unique;

-- Rehberlik teachers keep role 'counselor' as primary; they still hold teacher in profile_roles.
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

-- Atlas: any teacher in the school can see every şube (no assignment row required).
create or replace function public.teacher_assigned_to_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.classes c on c.id = target_class_id
    where p.id = auth.uid()
      and public.is_teacher()
      and p.school_id = c.school_id
      and (
        public.school_has_atlas_schedule(p.school_id)
        or p.subject_slug is not null
        or exists (
          select 1
          from public.teacher_assignments ta
          where ta.class_id = target_class_id
            and ta.teacher_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.is_teacher_of_class_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.classes c on c.id = s.class_id
    join public.profiles p on p.id = auth.uid()
    where s.id = target_student_id
      and public.is_teacher()
      and p.school_id = c.school_id
      and (
        public.school_has_atlas_schedule(p.school_id)
        or p.subject_slug is not null
        or exists (
          select 1
          from public.teacher_assignments ta
          where ta.class_id = s.class_id
            and ta.teacher_id = auth.uid()
        )
      )
  );
$$;

notify pgrst, 'reload schema';
