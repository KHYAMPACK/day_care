/**
 * Catalog of optional school modules.
 * Isolation is always school_id on shared tables; flags live in schools.features.
 * Do not import this for gating UI — use schoolFeatures.js / examConfig.js.
 */

export const CORE_TABLES = [
  'schools',
  'profiles',
  'profile_roles',
  'students',
  'student_parents',
  'classes',
  'teacher_assignments',
  'teacher_students',
  'messages',
  'message_templates',
  'announcements',
  'calendar_events',
  'parent_notifications',
  'school_activity_logs',
  'curriculum_subjects',
  'curriculum_units',
];

export const SCHOOL_MODULES = [
  {
    flag: 'atlas_schedule',
    label: 'Flexible 4-slot lesson schedule',
    tables: [
      'lesson_sessions',
      'lesson_attendance',
      'lesson_results',
      'teacher_day_responses',
      'teacher_missed_day_prompts',
      'assessment_types',
    ],
  },
  {
    flag: 'homework_tracking',
    label: 'Homework books and results',
    tables: [
      'homework_books',
      'homework_book_topics',
      'homework_book_tests',
      'homework_book_grants',
      'homework_assignments',
      'homework_assignment_students',
      'homework_assignment_tests',
      'homework_results',
    ],
  },
  {
    flag: 'accounting',
    label: 'Institutional accounting and tuition',
    tables: [
      'accounting_expense_categories',
      'accounting_suppliers',
      'accounting_expenses',
      'accounting_budget_periods',
      'accounting_budget_lines',
      'accounting_student_billing',
      'accounting_tuition_cycles',
    ],
  },
  {
    flag: 'exam_results',
    label: 'Exam sessions and results',
    relatedFlags: [
      'exam_import',
      'exam_detailed_entry',
      'exam_show_common',
      'exam_show_mock',
      'exam_mock_results',
      'exam_common_results',
    ],
    tables: [
      'exam_sessions',
      'exam_student_results',
      'exam_subject_results',
      'exam_session_rankings',
      'exam_topics',
      'exam_answer_keys',
      'exam_questions',
      'exam_student_answers',
    ],
  },
];

export const UNFLAGGED_TABLES = {
  dailyAttendance: ['attendance_sessions', 'attendance_records'],
  counselorGuidance: [
    'counselor_guidance_weeks',
    'counselor_weekly_question_rows',
    'counselor_topic_resource_cells',
    'counselor_study_schedule_blocks',
  ],
  curriculumPacing: [
    'curriculum_week_plans',
    'student_unit_progress',
    'curriculum_week_notes',
  ],
};
