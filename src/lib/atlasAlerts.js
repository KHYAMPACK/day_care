import { supabase } from './supabase';
import { istanbulDateIso } from './calendar';
import { isAtlasLiveLoggingOpen } from './atlasLessons';

export async function ensureMissedDayPrompts(promptDate = istanbulDateIso()) {
  if (isAtlasLiveLoggingOpen()) return;
  const { error } = await supabase.rpc('generate_atlas_missed_day_prompts', {
    p_prompt_date: promptDate,
  });
  if (error) throw error;
}

export async function loadPendingMissedDayPrompt(teacherId, promptDate = istanbulDateIso()) {
  const { data, error } = await supabase
    .from('atlas_teacher_missed_day_prompts')
    .select('id, prompt_date, empty_slots, status')
    .eq('teacher_id', teacherId)
    .eq('prompt_date', promptDate)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadAllPendingMissedDayPrompts(teacherId) {
  const { data, error } = await supabase
    .from('atlas_teacher_missed_day_prompts')
    .select('id, prompt_date, empty_slots, status')
    .eq('teacher_id', teacherId)
    .eq('status', 'pending')
    .order('prompt_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function resolveMissedDayPromptForDate(teacherId, promptDate) {
  const { error } = await supabase
    .from('atlas_teacher_missed_day_prompts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('prompt_date', promptDate)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function resolveMissedDayPrompt(promptId) {
  const { error } = await supabase
    .from('atlas_teacher_missed_day_prompts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', promptId);
  if (error) throw error;
}

export async function saveTeacherWasAbsent(responseDate) {
  const { error } = await supabase.rpc('save_atlas_teacher_day_response', {
    p_response_date: responseDate,
  });
  if (error) throw error;
}

export async function loadIncompleteActivities(teacherId) {
  const { data, error } = await supabase
    .from('atlas_lesson_sessions')
    .select(
      'id, class_id, subject_id, slot_index, session_date, activity_completed_at, classes ( grade, name ), curriculum_subjects ( name )'
    )
    .eq('taken_by', teacherId)
    .is('activity_completed_at', null)
    .order('session_date', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export function formatEmptySlotsList(emptySlots) {
  return (emptySlots ?? [])
    .map((slot) => `${slot.class_label ?? 'Sınıf'} (${slot.slot_index}. ders)`)
    .join(', ');
}
