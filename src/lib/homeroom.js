import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { CLASS_SELECT } from './curriculum';

export async function loadHomeroomClasses(schoolId, teacherId) {
  if (!teacherId) return [];
  const { data, error } = await withSchoolFilter(
    supabase
      .from('classes')
      .select(CLASS_SELECT)
      .eq('homeroom_teacher_id', teacherId)
      .order('grade')
      .order('name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function setTeacherHomeroomClasses({ schoolId, teacherId, classIds }) {
  const { error: clearError } = await withSchoolFilter(
    supabase.from('classes').update({ homeroom_teacher_id: null }).eq('homeroom_teacher_id', teacherId),
    schoolId
  );
  if (clearError) throw clearError;

  if (!classIds.length) return;

  const { error: setError } = await withSchoolFilter(
    supabase.from('classes').update({ homeroom_teacher_id: teacherId }).in('id', classIds),
    schoolId
  );
  if (setError) throw setError;
}
