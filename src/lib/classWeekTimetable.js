import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { academicWeekIndex, resolveSubjectForClass } from './curriculum';
import { ATLAS_SLOT_COUNT } from './atlasLessons';
import { TIMETABLE_SUBJECT_DEFS, teacherBranchLabel } from './teacherBranches';

export const TIMETABLE_WEEKDAYS = [
  { id: 1, label: 'Pazartesi', shortLabel: 'Pzt' },
  { id: 2, label: 'Salı', shortLabel: 'Sal' },
  { id: 3, label: 'Çarşamba', shortLabel: 'Çar' },
  { id: 4, label: 'Perşembe', shortLabel: 'Per' },
  { id: 5, label: 'Cuma', shortLabel: 'Cum' },
];

export const TIMETABLE_SELECT =
  'id, school_id, class_id, week_index, weekday, slot_index, subject_slug';

export function isoWeekday(isoDate) {
  const day = new Date(`${isoDate}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export function emptyTimetableGrid() {
  const grid = {};
  for (const day of TIMETABLE_WEEKDAYS) {
    grid[day.id] = {};
    for (let slot = 1; slot <= ATLAS_SLOT_COUNT; slot += 1) {
      grid[day.id][slot] = '';
    }
  }
  return grid;
}

export function rowsToTimetableGrid(rows = []) {
  const grid = emptyTimetableGrid();
  for (const row of rows) {
    if (!grid[row.weekday]) continue;
    grid[row.weekday][row.slot_index] = row.subject_slug ?? '';
  }
  return grid;
}

export function timetableGridToRows(grid) {
  const rows = [];
  for (const day of TIMETABLE_WEEKDAYS) {
    for (let slot = 1; slot <= ATLAS_SLOT_COUNT; slot += 1) {
      const slug = grid?.[day.id]?.[slot];
      if (slug) {
        rows.push({ weekday: day.id, slot_index: slot, subject_slug: slug });
      }
    }
  }
  return rows;
}

export function timetableSubjectsForGrade(grade) {
  const defs = [...TIMETABLE_SUBJECT_DEFS];
  if (grade >= 8) {
    defs.push({ slug: 'din', name: 'Din Kültürü', color: '#1e3a8a', icon: 'book' });
  }
  return defs;
}

export async function loadTimetableForWeek(schoolId, classId, weekIndex) {
  if (!schoolId || !classId || !weekIndex) return [];
  const { data, error } = await withSchoolFilter(
    supabase
      .from('class_week_timetable')
      .select(TIMETABLE_SELECT)
      .eq('class_id', classId)
      .eq('week_index', weekIndex)
      .order('weekday')
      .order('slot_index'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveTimetableWeek({ schoolId, classId, weekIndex, grid }) {
  if (!schoolId || !classId || !weekIndex) {
    throw new Error('Haftalık program kaydı için şube ve hafta gerekli.');
  }

  const { error: deleteError } = await withSchoolFilter(
    supabase
      .from('class_week_timetable')
      .delete()
      .eq('class_id', classId)
      .eq('week_index', weekIndex),
    schoolId
  );
  if (deleteError) throw deleteError;

  const cells = timetableGridToRows(grid);
  if (!cells.length) return [];

  const rows = cells.map((cell) => ({
    school_id: schoolId,
    class_id: classId,
    week_index: weekIndex,
    weekday: cell.weekday,
    slot_index: cell.slot_index,
    subject_slug: cell.subject_slug,
  }));

  const { data, error } = await supabase.from('class_week_timetable').insert(rows).select(TIMETABLE_SELECT);
  if (error) throw error;
  return data ?? [];
}

export async function fillEmptyTimetableSlot({ classId, weekIndex, weekday, slotIndex }) {
  const { data, error } = await supabase.rpc('fill_empty_timetable_slot', {
    p_class_id: classId,
    p_week_index: weekIndex,
    p_weekday: weekday,
    p_slot_index: slotIndex,
  });
  if (error) throw error;
  return data;
}

export async function copyTimetableFromPreviousWeek({ schoolId, classId, weekIndex }) {
  if (weekIndex <= 1) {
    throw new Error('İlk haftanın kopyalanacak önceki programı yok.');
  }
  const previous = await loadTimetableForWeek(schoolId, classId, weekIndex - 1);
  const grid = rowsToTimetableGrid(previous);
  return saveTimetableWeek({ schoolId, classId, weekIndex, grid });
}

export function subjectSlugFromTimetableRows(rows, weekday, slotIndex) {
  const match = (rows ?? []).find(
    (row) => row.weekday === weekday && row.slot_index === slotIndex
  );
  return match?.subject_slug ?? null;
}

export function resolveTimetableSubject({ rows, sessionDate, slotIndex, subjects, classGrade }) {
  if (!sessionDate || !slotIndex) return { subjectSlug: null, subject: null };
  const weekday = isoWeekday(sessionDate);
  const subjectSlug = subjectSlugFromTimetableRows(rows, weekday, slotIndex);
  const subject = resolveSubjectForClass(subjects, subjectSlug, classGrade);
  return { subjectSlug, subject };
}

export function timetableWeekIndexForDate(isoDate) {
  return academicWeekIndex(isoDate);
}

export function formatTimetableSubject(slug) {
  if (slug === 'din') return 'Din Kültürü';
  return teacherBranchLabel(slug);
}
