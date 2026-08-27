-- Anket: single-question polls. Teachers target assigned students; directors can target the school.
-- Parents answer once per child. Named roster is staff-only; parents may see counts via RPC.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.surveys (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete restrict,
  title                text not null,
  description          text,
  status               text not null default 'draft'
                         check (status in ('draft', 'open', 'closed')),
  results_visibility   text not null default 'staff_only'
                         check (results_visibility in ('staff_only', 'after_vote', 'live')),
  deadline_at          timestamptz,
  created_by           uuid not null references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index surveys_school_created_idx on public.surveys (school_id, created_at desc);
create index surveys_school_status_idx on public.surveys (school_id, status);

create or replace function public.surveys_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function public.surveys_touch_updated_at();

create or replace function public.protect_open_survey_content()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  new.title := old.title;
  new.description := old.description;
  new.results_visibility := old.results_visibility;
  new.deadline_at := old.deadline_at;
  new.school_id := old.school_id;
  new.created_by := old.created_by;

  if new.status = 'draft' then
    new.status := old.status;
  end if;

  return new;
end;
$$;

create trigger surveys_protect_open_content
  before update on public.surveys
  for each row execute function public.protect_open_survey_content();

create table public.survey_options (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references public.surveys (id) on delete cascade,
  label       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index survey_options_survey_id_idx on public.survey_options (survey_id, sort_order);

create or replace function public.protect_survey_options_when_published()
returns trigger
language plpgsql
as $$
declare
  target_survey_id uuid;
begin
  target_survey_id := coalesce(new.survey_id, old.survey_id);

  if exists (
    select 1
    from public.surveys s
    where s.id = target_survey_id
      and s.status <> 'draft'
  ) then
    raise exception 'Yayımlanmış anket seçenekleri değiştirilemez.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger survey_options_protect_when_published
  before insert or update or delete on public.survey_options
  for each row execute function public.protect_survey_options_when_published();

create table public.survey_students (
  survey_id   uuid not null references public.surveys (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (survey_id, student_id)
);

create index survey_students_student_id_idx on public.survey_students (student_id);

create or replace function public.protect_survey_students_when_published()
returns trigger
language plpgsql
as $$
declare
  target_survey_id uuid;
begin
  target_survey_id := coalesce(new.survey_id, old.survey_id);

  if exists (
    select 1
    from public.surveys s
    where s.id = target_survey_id
      and s.status <> 'draft'
  ) then
    raise exception 'Yayımlanmış anket alıcıları değiştirilemez.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger survey_students_protect_when_published
  before insert or update or delete on public.survey_students
  for each row execute function public.protect_survey_students_when_published();

create table public.survey_responses (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references public.surveys (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  parent_id   uuid not null references public.profiles (id) on delete restrict,
  option_id   uuid not null references public.survey_options (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint survey_responses_survey_student_unique unique (survey_id, student_id)
);

create index survey_responses_survey_id_idx on public.survey_responses (survey_id);
create index survey_responses_student_id_idx on public.survey_responses (student_id);

create or replace function public.survey_responses_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger survey_responses_set_updated_at
  before update on public.survey_responses
  for each row execute function public.survey_responses_touch_updated_at();

create or replace function public.protect_survey_response_keys()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.survey_id := old.survey_id;
    new.student_id := old.student_id;
  end if;

  if not exists (
    select 1
    from public.survey_options o
    where o.id = new.option_id
      and o.survey_id = new.survey_id
  ) then
    raise exception 'Seçenek bu ankete ait değil.';
  end if;

  if not exists (
    select 1
    from public.survey_students ss
    where ss.survey_id = new.survey_id
      and ss.student_id = new.student_id
  ) then
    raise exception 'Bu öğrenci ankete dahil değil.';
  end if;

  if not exists (
    select 1
    from public.surveys s
    where s.id = new.survey_id
      and s.status = 'open'
      and (s.deadline_at is null or s.deadline_at > now())
  ) then
    raise exception 'Bu anket için yanıt süresi kapandı.';
  end if;

  return new;
end;
$$;

create trigger survey_responses_protect_keys
  before insert or update on public.survey_responses
  for each row execute function public.protect_survey_response_keys();

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

create or replace function public.survey_visible_to_user(target_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.surveys s
    where s.id = target_survey_id
      and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
      and (
        public.is_director()
        or s.created_by = auth.uid()
        or (
          s.status <> 'draft'
          and exists (
            select 1
            from public.survey_students ss
            join public.student_parents sp on sp.student_id = ss.student_id
            where ss.survey_id = s.id
              and sp.parent_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_staff_manage_survey_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_director() or public.is_teacher_of_student(target_student_id);
$$;

create or replace function public.survey_option_counts(p_survey_id uuid)
returns table (
  option_id uuid,
  vote_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target public.surveys;
begin
  select *
    into target
  from public.surveys s
  where s.id = p_survey_id;

  if target.id is null or not public.survey_visible_to_user(p_survey_id) then
    return;
  end if;

  if not public.is_staff() then
    if target.results_visibility = 'staff_only' then
      return;
    end if;

    if target.results_visibility = 'after_vote'
       and target.status <> 'closed'
       and not exists (
         select 1
         from public.survey_responses r
         join public.student_parents sp on sp.student_id = r.student_id
         where r.survey_id = p_survey_id
           and sp.parent_id = auth.uid()
       ) then
      return;
    end if;
  end if;

  return query
    select o.id, count(r.id)::bigint
    from public.survey_options o
    left join public.survey_responses r
      on r.option_id = o.id
     and r.survey_id = o.survey_id
    where o.survey_id = p_survey_id
    group by o.id
    order by min(o.sort_order);
end;
$$;

revoke all on function public.survey_option_counts(uuid) from public;
grant execute on function public.survey_option_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.surveys enable row level security;
alter table public.survey_options enable row level security;
alter table public.survey_students enable row level security;
alter table public.survey_responses enable row level security;

create policy "Visible surveys can be selected"
  on public.surveys
  for select
  to authenticated
  using (public.survey_visible_to_user(id));

create policy "Staff can insert draft surveys"
  on public.surveys
  for insert
  to authenticated
  with check (
    public.is_staff()
    and created_by = auth.uid()
    and status = 'draft'
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Staff can update own-school surveys"
  on public.surveys
  for update
  to authenticated
  using (
    public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  )
  with check (
    public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  );

create policy "Staff can delete draft surveys"
  on public.surveys
  for delete
  to authenticated
  using (
    public.is_staff()
    and status = 'draft'
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  );

create policy "Visible survey options can be selected"
  on public.survey_options
  for select
  to authenticated
  using (public.survey_visible_to_user(survey_id));

create policy "Staff can insert draft survey options"
  on public.survey_options
  for insert
  to authenticated
  with check (
    public.is_staff()
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'draft'
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (public.is_director() or s.created_by = auth.uid())
    )
  );

create policy "Staff can update draft survey options"
  on public.survey_options
  for update
  to authenticated
  using (
    public.is_staff()
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'draft'
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (public.is_director() or s.created_by = auth.uid())
    )
  )
  with check (
    public.is_staff()
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'draft'
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (public.is_director() or s.created_by = auth.uid())
    )
  );

create policy "Staff can delete draft survey options"
  on public.survey_options
  for delete
  to authenticated
  using (
    public.is_staff()
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'draft'
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (public.is_director() or s.created_by = auth.uid())
    )
  );

create policy "Visible survey students can be selected"
  on public.survey_students
  for select
  to authenticated
  using (
    public.survey_visible_to_user(survey_id)
    and (
      public.is_staff()
      or public.is_parent_of_student(student_id)
    )
  );

create policy "Staff can insert survey students they manage"
  on public.survey_students
  for insert
  to authenticated
  with check (
    public.can_staff_manage_survey_student(student_id)
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and s.status = 'draft'
        and (public.is_director() or s.created_by = auth.uid())
        and exists (
          select 1
          from public.students st
          where st.id = student_id
            and st.school_id = s.school_id
        )
    )
  );

create policy "Staff can delete survey students on drafts"
  on public.survey_students
  for delete
  to authenticated
  using (
    public.can_staff_manage_survey_student(student_id)
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'draft'
        and s.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (public.is_director() or s.created_by = auth.uid())
    )
  );

create policy "Staff can select survey responses"
  on public.survey_responses
  for select
  to authenticated
  using (
    public.is_staff()
    and public.survey_visible_to_user(survey_id)
  );

create policy "Parents can select own children survey responses"
  on public.survey_responses
  for select
  to authenticated
  using (
    public.is_parent_of_student(student_id)
    and public.survey_visible_to_user(survey_id)
  );

create policy "Parents can insert survey responses"
  on public.survey_responses
  for insert
  to authenticated
  with check (
    parent_id = auth.uid()
    and public.is_parent_of_student(student_id)
    and public.survey_visible_to_user(survey_id)
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'open'
        and (s.deadline_at is null or s.deadline_at > now())
    )
    and exists (
      select 1
      from public.survey_students ss
      where ss.survey_id = survey_id
        and ss.student_id = student_id
    )
    and exists (
      select 1
      from public.survey_options o
      where o.id = option_id
        and o.survey_id = survey_id
    )
  );

create policy "Parents can update own children survey responses"
  on public.survey_responses
  for update
  to authenticated
  using (
    public.is_parent_of_student(student_id)
    and public.survey_visible_to_user(survey_id)
  )
  with check (
    parent_id = auth.uid()
    and public.is_parent_of_student(student_id)
    and public.survey_visible_to_user(survey_id)
    and exists (
      select 1
      from public.surveys s
      where s.id = survey_id
        and s.status = 'open'
        and (s.deadline_at is null or s.deadline_at > now())
    )
    and exists (
      select 1
      from public.survey_options o
      where o.id = option_id
        and o.survey_id = survey_id
    )
  );

grant select, insert, update, delete on public.surveys to authenticated;
grant select, insert, update, delete on public.survey_options to authenticated;
grant select, insert, delete on public.survey_students to authenticated;
grant select, insert, update on public.survey_responses to authenticated;

alter table public.surveys replica identity full;
alter table public.survey_responses replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.surveys;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.survey_responses;
exception
  when duplicate_object then null;
end $$;
