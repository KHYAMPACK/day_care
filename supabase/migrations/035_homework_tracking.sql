-- Homework / kaynak tracking: school book catalog, grants, assignments, parent D/Y/B results.

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------

create table if not exists public.homework_books (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  subject_id    uuid not null references public.curriculum_subjects (id) on delete restrict,
  grade         smallint not null,
  title         text not null,
  isbn          text,
  publisher     text,
  published_on  date,
  edition       text,
  cover_url     text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint homework_books_grade_check check (grade in (5, 6, 7, 8)),
  constraint homework_books_title_check check (char_length(btrim(title)) between 1 and 200)
);

create index if not exists homework_books_school_idx
  on public.homework_books (school_id, grade, title);

create table if not exists public.homework_book_topics (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.homework_books (id) on delete cascade,
  topic_code  text not null,
  topic_name  text not null,
  unit_id     uuid references public.curriculum_units (id) on delete set null,
  sort_order  smallint not null default 0,

  constraint homework_book_topics_code_unique unique (book_id, topic_code)
);

create index if not exists homework_book_topics_book_idx
  on public.homework_book_topics (book_id, sort_order);

create table if not exists public.homework_book_tests (
  id              uuid primary key default gen_random_uuid(),
  topic_id        uuid not null references public.homework_book_topics (id) on delete cascade,
  test_no         smallint,
  test_name       text not null,
  question_count  smallint not null,
  sort_order      smallint not null default 0,

  constraint homework_book_tests_q_check check (question_count > 0 and question_count <= 200)
);

create index if not exists homework_book_tests_topic_idx
  on public.homework_book_tests (topic_id, sort_order);

-- ---------------------------------------------------------------------------
-- Grants (class or individual student, per academic year)
-- ---------------------------------------------------------------------------

create table if not exists public.homework_book_grants (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  book_id         uuid not null references public.homework_books (id) on delete cascade,
  academic_year   text not null,
  class_id        uuid references public.classes (id) on delete cascade,
  student_id      uuid references public.students (id) on delete cascade,
  granted_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint homework_book_grants_target_check check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  ),
  constraint homework_book_grants_year_check check (academic_year ~ '^\d{4}-\d{4}$')
);

create unique index if not exists homework_book_grants_class_unique
  on public.homework_book_grants (book_id, academic_year, class_id)
  where class_id is not null;

create unique index if not exists homework_book_grants_student_unique
  on public.homework_book_grants (book_id, academic_year, student_id)
  where student_id is not null;

create index if not exists homework_book_grants_school_year_idx
  on public.homework_book_grants (school_id, academic_year);

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------

create table if not exists public.homework_assignments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  book_id     uuid not null references public.homework_books (id) on delete restrict,
  subject_id  uuid not null references public.curriculum_subjects (id) on delete restrict,
  class_id    uuid references public.classes (id) on delete set null,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  starts_on   date not null,
  due_on      date not null,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint homework_assignments_dates_check check (due_on >= starts_on)
);

create index if not exists homework_assignments_school_due_idx
  on public.homework_assignments (school_id, due_on desc);

create index if not exists homework_assignments_class_idx
  on public.homework_assignments (class_id, due_on desc);

create table if not exists public.homework_assignment_students (
  assignment_id uuid not null references public.homework_assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  primary key (assignment_id, student_id)
);

create index if not exists homework_assignment_students_student_idx
  on public.homework_assignment_students (student_id);

create table if not exists public.homework_assignment_tests (
  assignment_id uuid not null references public.homework_assignments (id) on delete cascade,
  book_test_id  uuid not null references public.homework_book_tests (id) on delete restrict,
  primary key (assignment_id, book_test_id)
);

-- ---------------------------------------------------------------------------
-- Results (parent-entered; verified_* reserved for later teacher approval)
-- ---------------------------------------------------------------------------

create table if not exists public.homework_results (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  assignment_id   uuid not null references public.homework_assignments (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  book_test_id    uuid not null references public.homework_book_tests (id) on delete restrict,
  correct_count   smallint not null default 0,
  wrong_count     smallint not null default 0,
  blank_count     smallint not null default 0,
  submitted_at    timestamptz not null default now(),
  submitted_by    uuid references public.profiles (id) on delete set null,
  verified_at     timestamptz,
  verified_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint homework_results_unique unique (assignment_id, student_id, book_test_id),
  constraint homework_results_nonneg check (
    correct_count >= 0 and wrong_count >= 0 and blank_count >= 0
  )
);

create index if not exists homework_results_assignment_idx
  on public.homework_results (assignment_id, student_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.homework_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists homework_books_set_updated_at on public.homework_books;
create trigger homework_books_set_updated_at
  before update on public.homework_books
  for each row execute function public.homework_touch_updated_at();

drop trigger if exists homework_assignments_set_updated_at on public.homework_assignments;
create trigger homework_assignments_set_updated_at
  before update on public.homework_assignments
  for each row execute function public.homework_touch_updated_at();

drop trigger if exists homework_results_set_updated_at on public.homework_results;
create trigger homework_results_set_updated_at
  before update on public.homework_results
  for each row execute function public.homework_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.teacher_can_assign_homework(
  target_class_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_director()
    or public.teacher_assigned_to_class_subject(target_class_id, target_subject_id)
    or public.teacher_can_log_atlas_session(target_class_id, target_subject_id);
$$;

create or replace function public.student_has_homework_book(
  target_student_id uuid,
  target_book_id uuid,
  target_year text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.homework_book_grants g
    join public.students s on s.id = target_student_id
    where g.book_id = target_book_id
      and g.academic_year = target_year
      and (
        g.student_id = target_student_id
        or (g.class_id is not null and g.class_id = s.class_id)
      )
  );
$$;

create or replace function public.istanbul_today()
returns date
language sql
stable
as $$
  select (timezone('Europe/Istanbul', now()))::date;
$$;

create or replace function public.parent_can_read_homework_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.homework_assignment_students s
    where s.assignment_id = target_assignment_id
      and public.is_parent_of_student(s.student_id)
  );
$$;

create or replace function public.staff_owns_homework_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.homework_assignments a
    join public.profiles p on p.id = auth.uid()
    where a.id = target_assignment_id
      and a.school_id = p.school_id
      and (public.is_director() or a.created_by = auth.uid())
  );
$$;

-- Enforce book.grade matches subject.grade
create or replace function public.enforce_homework_book()
returns trigger
language plpgsql
as $$
declare
  v_subject_grade smallint;
  v_school uuid;
begin
  select cs.grade into v_subject_grade
  from public.curriculum_subjects cs
  where cs.id = new.subject_id;

  if v_subject_grade is distinct from new.grade then
    raise exception 'Kitap sınıf düzeyi, seçilen ders ile eşleşmelidir.';
  end if;

  select p.school_id into v_school from public.profiles p where p.id = auth.uid();
  if v_school is distinct from new.school_id then
    raise exception 'Bu işlem için yetkiniz bulunmuyor.';
  end if;

  return new;
end;
$$;

drop trigger if exists homework_books_enforce on public.homework_books;
create trigger homework_books_enforce
  before insert or update on public.homework_books
  for each row execute function public.enforce_homework_book();

create or replace function public.enforce_homework_grant()
returns trigger
language plpgsql
as $$
declare
  v_book_school uuid;
begin
  select b.school_id into v_book_school
  from public.homework_books b
  where b.id = new.book_id;

  if v_book_school is distinct from new.school_id then
    raise exception 'Kitap bu okula ait değil.';
  end if;

  return new;
end;
$$;

drop trigger if exists homework_book_grants_enforce on public.homework_book_grants;
create trigger homework_book_grants_enforce
  before insert or update on public.homework_book_grants
  for each row execute function public.enforce_homework_grant();

create or replace function public.enforce_homework_result()
returns trigger
language plpgsql
as $$
declare
  v_q smallint;
  v_starts date;
  v_due date;
  v_school uuid;
begin
  select t.question_count into v_q
  from public.homework_book_tests t
  where t.id = new.book_test_id;

  if v_q is null then
    raise exception 'Test bulunamadı.';
  end if;

  if (new.correct_count + new.wrong_count + new.blank_count) is distinct from v_q then
    raise exception 'Doğru, yanlış ve boş toplamı soru sayısına eşit olmalıdır.';
  end if;

  if not exists (
    select 1 from public.homework_assignment_students s
    where s.assignment_id = new.assignment_id and s.student_id = new.student_id
  ) then
    raise exception 'Bu ödev bu öğrenciye atanmamış.';
  end if;

  if not exists (
    select 1 from public.homework_assignment_tests t
    where t.assignment_id = new.assignment_id and t.book_test_id = new.book_test_id
  ) then
    raise exception 'Bu test ödeve dahil değil.';
  end if;

  select a.starts_on, a.due_on, a.school_id
  into v_starts, v_due, v_school
  from public.homework_assignments a
  where a.id = new.assignment_id;

  new.school_id := v_school;

  if not public.is_staff() then
    if public.istanbul_today() < v_starts then
      raise exception 'Ödev henüz başlamadı.';
    end if;
    if public.istanbul_today() > v_due then
      raise exception 'Teslim tarihi geçtiği için sonuç değiştirilemez.';
    end if;
    if not public.is_parent_of_student(new.student_id) then
      raise exception 'Yalnızca kendi çocuğunuzun sonucunu girebilirsiniz.';
    end if;
    new.submitted_by := auth.uid();
    new.verified_at := null;
    new.verified_by := null;
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

drop trigger if exists homework_results_enforce on public.homework_results;
create trigger homework_results_enforce
  before insert or update on public.homework_results
  for each row execute function public.enforce_homework_result();

-- ---------------------------------------------------------------------------
-- parent_notifications
-- ---------------------------------------------------------------------------

alter table public.parent_notifications
  add column if not exists homework_assignment_id uuid
    references public.homework_assignments (id) on delete cascade;

create unique index if not exists parent_notifications_homework_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, homework_assignment_id)
  where kind = 'homework_assigned' and homework_assignment_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.homework_books enable row level security;
alter table public.homework_book_topics enable row level security;
alter table public.homework_book_tests enable row level security;
alter table public.homework_book_grants enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.homework_assignment_students enable row level security;
alter table public.homework_assignment_tests enable row level security;
alter table public.homework_results enable row level security;

-- Books: same-school read; director write
drop policy if exists "School members read homework books" on public.homework_books;
create policy "School members read homework books"
  on public.homework_books for select to authenticated
  using (school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "Directors manage homework books" on public.homework_books;
create policy "Directors manage homework books"
  on public.homework_books for all to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.is_director()
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.is_director()
  );

drop policy if exists "School members read homework topics" on public.homework_book_topics;
create policy "School members read homework topics"
  on public.homework_book_topics for select to authenticated
  using (
    exists (
      select 1 from public.homework_books b
      join public.profiles p on p.id = auth.uid()
      where b.id = homework_book_topics.book_id and b.school_id = p.school_id
    )
  );

drop policy if exists "Directors manage homework topics" on public.homework_book_topics;
create policy "Directors manage homework topics"
  on public.homework_book_topics for all to authenticated
  using (
    exists (
      select 1 from public.homework_books b
      where b.id = homework_book_topics.book_id and public.is_director()
        and b.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.homework_books b
      where b.id = homework_book_topics.book_id and public.is_director()
        and b.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "School members read homework tests" on public.homework_book_tests;
create policy "School members read homework tests"
  on public.homework_book_tests for select to authenticated
  using (
    exists (
      select 1 from public.homework_book_topics t
      join public.homework_books b on b.id = t.book_id
      join public.profiles p on p.id = auth.uid()
      where t.id = homework_book_tests.topic_id and b.school_id = p.school_id
    )
  );

drop policy if exists "Directors manage homework tests" on public.homework_book_tests;
create policy "Directors manage homework tests"
  on public.homework_book_tests for all to authenticated
  using (
    exists (
      select 1 from public.homework_book_topics t
      join public.homework_books b on b.id = t.book_id
      where t.id = homework_book_tests.topic_id and public.is_director()
        and b.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.homework_book_topics t
      join public.homework_books b on b.id = t.book_id
      where t.id = homework_book_tests.topic_id and public.is_director()
        and b.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "School staff read homework grants" on public.homework_book_grants;
create policy "School staff read homework grants"
  on public.homework_book_grants for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_staff() or public.is_parent_of_student(student_id) or public.parent_linked_to_class(class_id))
  );

drop policy if exists "Directors manage homework grants" on public.homework_book_grants;
create policy "Directors manage homework grants"
  on public.homework_book_grants for all to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.is_director()
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.is_director()
  );

drop policy if exists "Read homework assignments" on public.homework_assignments;
create policy "Read homework assignments"
  on public.homework_assignments for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_staff()
      or public.parent_can_read_homework_assignment(id)
    )
  );

drop policy if exists "Staff insert homework assignments" on public.homework_assignments;
create policy "Staff insert homework assignments"
  on public.homework_assignments for insert to authenticated
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and created_by = auth.uid()
    and (public.is_director() or public.is_teacher())
    and (
      class_id is null
      or public.teacher_can_assign_homework(class_id, subject_id)
    )
  );

drop policy if exists "Staff update own homework assignments" on public.homework_assignments;
create policy "Staff update own homework assignments"
  on public.homework_assignments for update to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  );

drop policy if exists "Staff delete own homework assignments" on public.homework_assignments;
create policy "Staff delete own homework assignments"
  on public.homework_assignments for delete to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  );

drop policy if exists "Read homework assignment students" on public.homework_assignment_students;
create policy "Read homework assignment students"
  on public.homework_assignment_students for select to authenticated
  using (
    public.is_staff()
    or public.is_parent_of_student(student_id)
  );

drop policy if exists "Staff manage homework assignment students" on public.homework_assignment_students;
create policy "Staff manage homework assignment students"
  on public.homework_assignment_students for all to authenticated
  using (public.staff_owns_homework_assignment(assignment_id))
  with check (public.staff_owns_homework_assignment(assignment_id));

drop policy if exists "Read homework assignment tests" on public.homework_assignment_tests;
create policy "Read homework assignment tests"
  on public.homework_assignment_tests for select to authenticated
  using (
    public.is_staff()
    or public.parent_can_read_homework_assignment(assignment_id)
  );

drop policy if exists "Staff manage homework assignment tests" on public.homework_assignment_tests;
create policy "Staff manage homework assignment tests"
  on public.homework_assignment_tests for all to authenticated
  using (public.staff_owns_homework_assignment(assignment_id))
  with check (public.staff_owns_homework_assignment(assignment_id));

drop policy if exists "Read homework results" on public.homework_results;
create policy "Read homework results"
  on public.homework_results for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_staff() or public.is_parent_of_student(student_id))
  );

drop policy if exists "Parents write homework results" on public.homework_results;
create policy "Parents write homework results"
  on public.homework_results for insert to authenticated
  with check (public.is_parent_of_student(student_id));

drop policy if exists "Parents update homework results" on public.homework_results;
create policy "Parents update homework results"
  on public.homework_results for update to authenticated
  using (public.is_parent_of_student(student_id))
  with check (public.is_parent_of_student(student_id));

grant select, insert, update, delete on public.homework_books to authenticated;
grant select, insert, update, delete on public.homework_book_topics to authenticated;
grant select, insert, update, delete on public.homework_book_tests to authenticated;
grant select, insert, update, delete on public.homework_book_grants to authenticated;
grant select, insert, update, delete on public.homework_assignments to authenticated;
grant select, insert, update, delete on public.homework_assignment_students to authenticated;
grant select, insert, update, delete on public.homework_assignment_tests to authenticated;
grant select, insert, update, delete on public.homework_results to authenticated;

grant execute on function public.teacher_can_assign_homework(uuid, uuid) to authenticated;
grant execute on function public.student_has_homework_book(uuid, uuid, text) to authenticated;
grant execute on function public.istanbul_today() to authenticated;
grant execute on function public.parent_can_read_homework_assignment(uuid) to authenticated;
grant execute on function public.staff_owns_homework_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: book covers (optional; skipped if storage is unavailable)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'homework-covers',
      'homework-covers',
      true,
      2097152,
      array['image/png', 'image/jpeg', 'image/webp']
    )
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    execute $p$
      drop policy if exists "Public read homework covers" on storage.objects;
      create policy "Public read homework covers"
        on storage.objects for select to public
        using (bucket_id = 'homework-covers');

      drop policy if exists "Directors upload homework covers" on storage.objects;
      create policy "Directors upload homework covers"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'homework-covers'
          and public.is_director()
          and (storage.foldername(name))[1] = (
            select p.school_id::text from public.profiles p where p.id = auth.uid()
          )
        );

      drop policy if exists "Directors update homework covers" on storage.objects;
      create policy "Directors update homework covers"
        on storage.objects for update to authenticated
        using (
          bucket_id = 'homework-covers'
          and public.is_director()
          and (storage.foldername(name))[1] = (
            select p.school_id::text from public.profiles p where p.id = auth.uid()
          )
        )
        with check (
          bucket_id = 'homework-covers'
          and public.is_director()
        );

      drop policy if exists "Directors delete homework covers" on storage.objects;
      create policy "Directors delete homework covers"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'homework-covers'
          and public.is_director()
          and (storage.foldername(name))[1] = (
            select p.school_id::text from public.profiles p where p.id = auth.uid()
          )
        );
    $p$;
  end if;
exception when others then
  raise notice 'homework-covers storage policies skipped: %', sqlerrm;
end $$;
