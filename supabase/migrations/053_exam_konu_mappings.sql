-- Deneme konu etiketleri → müfredat ünite/section eşlemesi (okul bazlı alias tablosu).

create table if not exists public.exam_konu_mappings (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete cascade,
  grade            smallint not null,
  subject_code     text not null,
  label_normalized text not null,
  label_display    text not null,
  unit_id          uuid references public.curriculum_units (id) on delete set null,
  section_label    text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint exam_konu_mappings_grade_check check (grade between 5 and 8),
  constraint exam_konu_mappings_subject_check check (
    subject_code in ('turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce')
  ),
  constraint exam_konu_mappings_unique unique (school_id, grade, subject_code, label_normalized)
);

create index if not exists exam_konu_mappings_school_grade_subject_idx
  on public.exam_konu_mappings (school_id, grade, subject_code);

alter table public.exam_konu_mappings enable row level security;

drop policy if exists "School staff read exam konu mappings" on public.exam_konu_mappings;
create policy "School staff read exam konu mappings"
  on public.exam_konu_mappings for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors and counselors manage exam konu mappings" on public.exam_konu_mappings;
create policy "Directors and counselors manage exam konu mappings"
  on public.exam_konu_mappings for all to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_counselor())
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_counselor())
  );

grant select, insert, update, delete on public.exam_konu_mappings to authenticated;
