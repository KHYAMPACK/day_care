import { COMPLETION_STATUSES } from '../../counselorGuidance.js';
import { subjectByCode } from '../../lgsExam';

const MATRIX_SYMBOLS = {
  not_started: '',
  in_progress: '▣',
  done: '✓',
};

const SCHEDULE_DAYS = [
  { id: 1, label: 'PAZARTESİ' },
  { id: 2, label: 'SALI' },
  { id: 3, label: 'ÇARŞAMBA' },
  { id: 4, label: 'PERŞEMBE' },
  { id: 5, label: 'CUMA' },
  { id: 6, label: 'CUMARTESİ' },
];

function displayCount(value) {
  if (value === '' || value == null) return '—';
  return String(value);
}

function completionLabel(value) {
  return COMPLETION_STATUSES.find((item) => item.value === value)?.label ?? '—';
}

function slugify(value) {
  return String(value ?? 'ogrenci')
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * @param {{
 *   student: { full_name?: string, student_number?: string, grade?: number },
 *   weekIndex: number,
 *   weekRangeLabel: string,
 *   academicYear: string,
 *   notes?: string,
 *   questionRows?: object[],
 *   matrixSubjectName?: string,
 *   matrixRows?: object[],
 *   matrixResources?: string[],
 *   matrixCells?: object[],
 *   scheduleSlots?: { start_time: string, end_time: string }[],
 *   scheduleBlocks?: object[],
 *   schoolName?: string,
 * }} input
 */
export function buildGuidancePdfModel(input) {
  const {
    student,
    weekIndex,
    weekRangeLabel,
    academicYear,
    notes = '',
    questionRows = [],
    matrixSubjectName = '',
    matrixRows = [],
    matrixResources = [],
    matrixCells = [],
    scheduleSlots = [],
    scheduleBlocks = [],
    schoolName = '',
  } = input;

  const cellMap = new Map();
  for (const cell of matrixCells) {
    cellMap.set(`${cell.topic_key}::${cell.resource_name}`, cell);
  }

  const questions = (questionRows ?? [])
    .filter((row) => row.subject_code || row.topic_label || row.source_name || row.target_count)
    .map((row, index) => ({
      num: index + 1,
      subject: subjectByCode(row.subject_code)?.label ?? row.subject_code ?? '—',
      topic: row.topic_label?.trim() || '—',
      source: row.source_name?.trim() || '—',
      target: displayCount(row.target_count),
      solved: displayCount(row.solved_count),
      correct: displayCount(row.correct_count),
      wrong: displayCount(row.wrong_count),
      blank: displayCount(row.blank_count),
      status: completionLabel(row.completion_status),
    }));

  const matrix = {
    subjectName: matrixSubjectName || '—',
    resources: matrixResources ?? [],
    rows: (matrixRows ?? []).map((topicRow) => ({
      topicKey: topicRow.topicKey,
      topicLabel: topicRow.topicLabel,
      unitTitle: topicRow.unitTitle ?? '',
      isPriority: Boolean(topicRow.isPriority),
      cells: (matrixResources ?? []).map((resource) => {
        const cell = cellMap.get(`${topicRow.topicKey}::${resource}`);
        const status = cell?.status ?? 'not_started';
        return {
          resource,
          status,
          symbol: MATRIX_SYMBOLS[status] ?? '',
        };
      }),
    })),
  };

  const schedule = {
    days: SCHEDULE_DAYS,
    slots: (scheduleSlots ?? []).map((slot) => ({
      start_time: slot.start_time,
      end_time: slot.end_time,
      days: SCHEDULE_DAYS.map((day) => {
        const block = scheduleBlocks.find(
          (item) =>
            item.day_of_week === day.id &&
            item.start_time === slot.start_time &&
            item.end_time === slot.end_time
        );
        if (!block?.label?.trim()) {
          return { label: '', done: false };
        }
        return {
          label: block.label.trim(),
          done: Boolean(block.is_done),
        };
      }),
    })),
  };

  return {
    header: {
      studentName: student?.full_name ?? 'Öğrenci',
      studentNumber: student?.student_number ?? '',
      grade: student?.grade ?? null,
      weekIndex,
      weekRangeLabel,
      academicYear,
      schoolName,
    },
    notes: notes?.trim() ?? '',
    questions,
    matrix,
    schedule,
    filename: buildGuidancePdfFilename(student?.full_name, weekIndex),
  };
}

export function buildGuidancePdfFilename(studentName, weekIndex) {
  return `rehberlik-${slugify(studentName)}-hafta-${weekIndex}.pdf`;
}
