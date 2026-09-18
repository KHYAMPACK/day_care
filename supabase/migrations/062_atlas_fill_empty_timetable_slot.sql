-- Atlas: let a teacher fill an EMPTY weekly-schedule cell with her own branş when she
-- takes attendance for a slot the director/counselor never scheduled. save_atlas_lesson_attendance
-- already lets a teacher log any class/subject she's authorized for (it never reads
-- class_week_timetable at all) — the only gate stopping this today was client-side
-- (TeacherAtlasLessons.jsx refusing to submit when the timetable cell was blank). This RPC
-- lets the client persist that gap-fill so the weekly schedule catches up with reality,
-- while staying director/counselor-write-only for any cell that's already populated —
-- a mismatch (teacher logs a different subject than what's already scheduled) is handled
-- purely client-side and never touches this table, so the original plan stays visible.

create or replace function public.fill_empty_timetable_slot(
  p_class_id uuid,
  p_week_index integer,
  p_weekday smallint,
  p_slot_index smallint
)
returns public.class_week_timetable
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school_id uuid;
  v_caller_school uuid;
  v_subject_slug text;
  v_subject_id uuid;
  v_row public.class_week_timetable;
begin
  if p_weekday is null or p_weekday < 1 or p_weekday > 5 then
    raise exception 'Gün Pazartesi-Cuma arasında olmalı.';
  end if;

  if p_slot_index is null or p_slot_index < 1 or p_slot_index > 4 then
    raise exception 'Ders saati 1-4 arasında olmalı.';
  end if;

  if p_week_index is null then
    raise exception 'Hafta bilgisi gerekli.';
  end if;

  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null then
    raise exception 'Şube bulunamadı.';
  end if;

  select p.school_id, p.subject_slug into v_caller_school, v_subject_slug
  from public.profiles p
  where p.id = auth.uid();

  if v_caller_school is distinct from v_school_id then
    raise exception 'Bu işlem için yetkiniz bulunmuyor.';
  end if;

  if v_subject_slug is null then
    raise exception 'Branşınız tanımlı değil, program otomatik doldurulamıyor.';
  end if;

  v_subject_id := public.resolve_subject_for_class(v_subject_slug, p_class_id);
  if v_subject_id is null then
    raise exception 'Branşınız bu şubenin sınıf düzeyine uymuyor.';
  end if;

  if not public.is_director() and not public.teacher_teaches_class_subject(p_class_id, v_subject_id) then
    raise exception 'Bu şube için yetkiniz yok.';
  end if;

  insert into public.class_week_timetable (
    school_id, class_id, week_index, weekday, slot_index, subject_slug
  )
  values (
    v_school_id, p_class_id, p_week_index, p_weekday, p_slot_index, v_subject_slug
  )
  on conflict (school_id, class_id, week_index, weekday, slot_index) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Bu ders saati az önce dolduruldu. Program yenileniyor.';
  end if;

  return v_row;
end;
$$;

grant execute on function public.fill_empty_timetable_slot to authenticated;

notify pgrst, 'reload schema';
