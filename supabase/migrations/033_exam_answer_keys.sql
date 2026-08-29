-- Faz 2: cevap anahtarı, konu ağacı, soru cevapları + exam bildirimleri.
-- Requires 032_lgs_exam_system.sql (exam_sessions + answer_key_id column).

do $$
begin
  if to_regclass('public.exam_sessions') is null then
    raise exception 'exam_sessions tablosu yok. Önce 026_exams.sql veya 032_lgs_exam_system.sql çalıştırın.';
  end if;
end $$;

alter table public.exam_sessions
  add column if not exists answer_key_id uuid;

create table if not exists public.exam_topics (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references public.schools (id) on delete cascade,
  parent_id   uuid references public.exam_topics (id) on delete cascade,
  subject_code text not null,
  title       text not null,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),

  constraint exam_topics_subject_check check (
    subject_code in ('turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce')
  )
);

create index if not exists exam_topics_school_subject_idx
  on public.exam_topics (school_id, subject_code, sort_order);

create table if not exists public.exam_answer_keys (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  session_id  uuid references public.exam_sessions (id) on delete set null,
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.exam_sessions
  drop constraint if exists exam_sessions_answer_key_id_fkey;

alter table public.exam_sessions
  add constraint exam_sessions_answer_key_id_fkey
  foreign key (answer_key_id) references public.exam_answer_keys (id) on delete set null;

create table if not exists public.exam_questions (
  id              uuid primary key default gen_random_uuid(),
  answer_key_id   uuid not null references public.exam_answer_keys (id) on delete cascade,
  question_index  smallint not null,
  subject_code    text not null,
  booklet_a_no    smallint,
  booklet_b_no    smallint,
  correct_choice  text,
  topic_id        uuid references public.exam_topics (id) on delete set null,
  topic_label     text,
  created_at      timestamptz not null default now(),

  constraint exam_questions_unique unique (answer_key_id, question_index),
  constraint exam_questions_subject_check check (
    subject_code in ('turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce')
  ),
  constraint exam_questions_choice_check check (
    correct_choice is null or correct_choice in ('A', 'B', 'C', 'D', 'E')
  )
);

create index if not exists exam_questions_answer_key_idx
  on public.exam_questions (answer_key_id, question_index);

create table if not exists public.exam_student_answers (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.exam_sessions (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  question_id   uuid not null references public.exam_questions (id) on delete cascade,
  choice        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint exam_student_answers_unique unique (session_id, student_id, question_id),
  constraint exam_student_answers_choice_check check (
    choice is null or choice in ('A', 'B', 'C', 'D', 'E')
  )
);

create index if not exists exam_student_answers_session_idx
  on public.exam_student_answers (session_id, student_id);

alter table public.exam_topics enable row level security;
alter table public.exam_answer_keys enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_student_answers enable row level security;

drop policy if exists "School staff manage exam topics" on public.exam_topics;
create policy "School staff manage exam topics"
  on public.exam_topics for all to authenticated
  using (
    school_id is null
    or school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    school_id is null
    or (
      school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
      and public.is_director()
    )
  );

drop policy if exists "Authenticated read exam topics" on public.exam_topics;
create policy "Authenticated read exam topics"
  on public.exam_topics for select to authenticated
  using (true);

drop policy if exists "Staff manage exam answer keys" on public.exam_answer_keys;
create policy "Staff manage exam answer keys"
  on public.exam_answer_keys for all to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_teacher())
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_teacher())
  );

drop policy if exists "Staff manage exam questions" on public.exam_questions;
create policy "Staff manage exam questions"
  on public.exam_questions for all to authenticated
  using (
    exists (
      select 1 from public.exam_answer_keys ak
      join public.profiles p on p.id = auth.uid()
      where ak.id = exam_questions.answer_key_id
        and ak.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  )
  with check (
    exists (
      select 1 from public.exam_answer_keys ak
      join public.profiles p on p.id = auth.uid()
      where ak.id = exam_questions.answer_key_id
        and ak.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Staff manage exam student answers" on public.exam_student_answers;
create policy "Staff manage exam student answers"
  on public.exam_student_answers for all to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_answers.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  )
  with check (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_answers.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Parents read published exam student answers" on public.exam_student_answers;
create policy "Parents read published exam student answers"
  on public.exam_student_answers for select to authenticated
  using (
    public.is_parent_of_student(student_id)
    and exists (
      select 1 from public.exam_sessions es
      where es.id = exam_student_answers.session_id
        and es.published_at is not null
    )
  );

grant select, insert, update, delete on public.exam_topics to authenticated;
grant select, insert, update, delete on public.exam_answer_keys to authenticated;
grant select, insert, update, delete on public.exam_questions to authenticated;
grant select, insert, update, delete on public.exam_student_answers to authenticated;

-- parent_notifications: exam session support
-- Bootstrap from 031 if that migration was skipped.
create table if not exists public.parent_notifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  parent_id     uuid not null references public.profiles (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  kind          text not null default 'weekly_report',
  week_index    int,
  title         text not null,
  body          text not null default '',
  read_at       timestamptz,
  push_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  exam_session_id uuid references public.exam_sessions (id) on delete cascade
);

create index if not exists parent_notifications_parent_unread_idx
  on public.parent_notifications (parent_id, read_at)
  where read_at is null;

create index if not exists parent_notifications_parent_created_idx
  on public.parent_notifications (parent_id, created_at desc);

alter table public.parent_notifications enable row level security;

drop policy if exists "Parents can select own notifications" on public.parent_notifications;
create policy "Parents can select own notifications"
  on public.parent_notifications for select to authenticated
  using (parent_id = auth.uid());

drop policy if exists "Parents can update own notifications" on public.parent_notifications;
create policy "Parents can update own notifications"
  on public.parent_notifications for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

grant select, update on public.parent_notifications to authenticated;

alter table public.parent_notifications
  add column if not exists exam_session_id uuid references public.exam_sessions (id) on delete cascade;

alter table public.parent_notifications
  alter column week_index drop not null;

alter table public.parent_notifications
  drop constraint if exists parent_notifications_kind_week_unique;

create unique index if not exists parent_notifications_weekly_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, week_index)
  where kind = 'weekly_report' and week_index is not null;

create unique index if not exists parent_notifications_exam_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, exam_session_id)
  where kind = 'exam_results_published' and exam_session_id is not null;
