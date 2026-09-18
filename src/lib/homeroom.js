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

export async function setClassHomeroomTeacher({ schoolId, classId, teacherId }) {
  const { error } = await withSchoolFilter(
    supabase
      .from('classes')
      .update({ homeroom_teacher_id: teacherId || null })
      .eq('id', classId),
    schoolId
  );
  if (error) throw error;
}
