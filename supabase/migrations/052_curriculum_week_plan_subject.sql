-- One ünite per ders per hafta (school-scoped week plan)

alter table public.curriculum_week_plans
  add column if not exists subject_id uuid references public.curriculum_subjects (id) on delete cascade;

update public.curriculum_week_plans p
set subject_id = u.subject_id
from public.curriculum_units u
where u.id = p.unit_id
  and p.subject_id is null;

-- Keep a single row per (school, grade, week, subject)
with ranked as (
  select
    p.id,
    row_number() over (
      partition by p.school_id, p.grade, p.week_index, coalesce(p.subject_id, u.subject_id)
      order by p.created_at desc
    ) as rn
  from public.curriculum_week_plans p
  join public.curriculum_units u on u.id = p.unit_id
)
delete from public.curriculum_week_plans
where id in (select id from ranked where rn > 1);

alter table public.curriculum_week_plans
  alter column subject_id set not null;

alter table public.curriculum_week_plans
  drop constraint if exists curriculum_week_plans_unique;

alter table public.curriculum_week_plans
  add constraint curriculum_week_plans_subject_week_unique
  unique (school_id, grade, week_index, subject_id);

create index if not exists curriculum_week_plans_subject_idx
  on public.curriculum_week_plans (school_id, grade, subject_id, week_index);

drop policy if exists "Directors can update week plans" on public.curriculum_week_plans;
create policy "Directors can update week plans"
  on public.curriculum_week_plans
  for update
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

grant update on public.curriculum_week_plans to authenticated;
