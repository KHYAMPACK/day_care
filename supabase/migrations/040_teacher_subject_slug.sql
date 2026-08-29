-- Teacher branş by subject slug (multi-grade): matematik teacher can teach 5–8.
-- Run after 039.

-- ---------------------------------------------------------------------------
-- Profile subject_slug
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists subject_slug text;

create index if not exists profiles_subject_slug_idx on public.profiles (subject_slug);

update public.profiles p
set subject_slug = cs.slug
from public.curriculum_subjects cs
where p.subject_id = cs.id
  and p.role = 'teacher'
  and p.subject_slug is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.teacher_subject_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.subject_slug
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.resolve_subject_for_class(
  p_slug text,
  p_class_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cs.id
  from public.classes c
  join public.curriculum_subjects cs
    on cs.grade = c.grade
   and cs.slug = p_slug
  where c.id = p_class_id
  limit 1;
$$;

create or replace function public.teacher_teaches_class_subject(
  target_class_id uuid,
  target_subject_id uuid
)
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
    join public.curriculum_subjects cs on cs.id = target_subject_id
    where p.id = auth.uid()
      and public.is_teacher()
      and p.school_id = c.school_id
      and c.grade = cs.grade
      and (
        (p.subject_slug is not null and p.subject_slug = cs.slug)
        or (p.subject_slug is null and p.subject_id = target_subject_id)
        or exists (
          select 1
          from public.teacher_assignments ta
          where ta.teacher_id = auth.uid()
            and ta.class_id = target_class_id
            and ta.subject_id = target_subject_id
        )
      )
  );
$$;

create or replace function public.teacher_can_log_atlas_session(
  target_class_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.teacher_teaches_class_subject(target_class_id, target_subject_id);
$$;

create or replace function public.teacher_assigned_to_class_subject(
  target_class_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.teacher_teaches_class_subject(target_class_id, target_subject_id);
$$;

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
        p.subject_slug is not null
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
        p.subject_slug is not null
        or exists (
          select 1
          from public.teacher_assignments ta
          where ta.class_id = s.class_id
            and ta.teacher_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.teacher_can_write_unit_progress(
  target_student_id uuid,
  target_unit_id uuid
)
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
    join public.curriculum_units cu on cu.id = target_unit_id
    join public.curriculum_subjects cs on cs.id = cu.subject_id
    where s.id = target_student_id
      and public.is_teacher()
      and p.school_id = c.school_id
      and c.grade = cs.grade
      and (
        (p.subject_slug is not null and p.subject_slug = cs.slug)
        or exists (
          select 1
          from public.teacher_assignments ta
          where ta.class_id = s.class_id
            and ta.teacher_id = auth.uid()
            and ta.subject_id = cu.subject_id
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Missed-day prompts: all school classes when teacher has subject_slug
-- ---------------------------------------------------------------------------

create or replace function public.generate_atlas_missed_day_prompts(p_prompt_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher record;
  v_empty jsonb;
  v_count integer := 0;
  v_has_sessions boolean;
  v_class record;
  v_slot smallint;
  v_class_label text;
begin
  for v_teacher in
    select p.id as teacher_id, p.school_id, p.subject_slug, p.subject_id
    from public.profiles p
    join public.schools s on s.id = p.school_id
    where public.school_has_atlas_schedule(p.school_id)
      and p.role = 'teacher'
      and (p.subject_slug is not null or p.subject_id is not null)
  loop
    if exists (
      select 1 from public.atlas_teacher_day_responses r
      where r.teacher_id = v_teacher.teacher_id
        and r.response_date = p_prompt_date
    ) then
      continue;
    end if;

    select exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.taken_by = v_teacher.teacher_id
        and sess.session_date = p_prompt_date
    ) into v_has_sessions;

    if v_has_sessions then
      continue;
    end if;

    v_empty := '[]'::jsonb;

    for v_class in
      select c.id as class_id, c.grade, c.name
      from public.classes c
      where c.school_id = v_teacher.school_id
        and (
          v_teacher.subject_slug is not null
          or c.grade = (
            select cs.grade
            from public.curriculum_subjects cs
            where cs.id = v_teacher.subject_id
          )
        )
      order by c.grade, c.name
    loop
      v_class_label := v_class.grade::text || '-' || v_class.name;
      for v_slot in 1..4 loop
        if not exists (
          select 1 from public.atlas_lesson_sessions s
          where s.class_id = v_class.class_id
            and s.session_date = p_prompt_date
            and s.slot_index = v_slot
        ) then
          v_empty := v_empty || jsonb_build_array(
            jsonb_build_object(
              'class_id', v_class.class_id,
              'slot_index', v_slot,
              'class_label', v_class_label
            )
          );
        end if;
      end loop;
    end loop;

    if jsonb_array_length(v_empty) = 0 then
      continue;
    end if;

    insert into public.atlas_teacher_missed_day_prompts (
      school_id, teacher_id, prompt_date, empty_slots, status
    )
    values (v_teacher.school_id, v_teacher.teacher_id, p_prompt_date, v_empty, 'pending')
    on conflict (teacher_id, prompt_date)
    do update set
      empty_slots = excluded.empty_slots,
      status = case
        when atlas_teacher_missed_day_prompts.status = 'resolved' then 'resolved'
        else 'pending'
      end
    where atlas_teacher_missed_day_prompts.status = 'pending';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.teacher_subject_slug to authenticated;
grant execute on function public.resolve_subject_for_class to authenticated;
grant execute on function public.teacher_teaches_class_subject to authenticated;
