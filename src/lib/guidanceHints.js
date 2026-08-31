import { LGS_SUBJECTS, subjectByCode } from './lgsExam';
import { flagTypeLabel } from './studentGaps';

const TIER_TARGET_QUESTIONS = { A: 40, B: 60, C: 80 };

const DAY_SUGGESTIONS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function suggestedTargetCount(tier = 'B') {
  return TIER_TARGET_QUESTIONS[tier] ?? TIER_TARGET_QUESTIONS.B;
}

export function buildQuestionTrackingHints({ gapProfile, atlasUnits = [], exams = [], weekIndex = null }) {
  const tier = gapProfile?.tier?.tier ?? 'B';
  const targetDefault = suggestedTargetCount(tier);
  const hints = [];

  for (const priority of gapProfile?.priorities ?? []) {
    if (priority.kind === 'attendance') continue;
    hints.push({
      subject_code: priority.subject_code ?? '',
      topic_label: priority.sectionLabel ?? priority.topicLabel ?? priority.unitTitle ?? '',
      source_name: '',
      target_count: targetDefault,
      reason: `${flagTypeLabel(priority.flagType)} — ${priority.suggestedAction ?? ''}`.trim(),
      flagType: priority.flagType,
    });
  }

  const atlasHint = buildAtlasWeekHint(atlasUnits, weekIndex);
  if (atlasHint) {
    hints.push({
      subject_code: atlasHint.subject_code,
      topic_label: atlasHint.topic_label,
      source_name: 'Atlas sınıf çalışması',
      target_count: '',
      solved_count: atlasHint.solved_count,
      correct_count: atlasHint.correct_count,
      wrong_count: atlasHint.wrong_count,
      blank_count: atlasHint.blank_count,
      reason: `Bu hafta okulda ${atlasHint.solved_count} soru çözüldü (Atlas).`,
      readOnlyActuals: true,
    });
  }

  const examHint = buildExamWeekHint(exams, weekIndex);
  if (examHint) {
    hints.push({
      subject_code: examHint.subject_code,
      topic_label: examHint.topic_label,
      source_name: examHint.source_name,
      target_count: '',
      solved_count: examHint.solved_count,
      correct_count: examHint.correct_count,
      wrong_count: examHint.wrong_count,
      blank_count: examHint.blank_count,
      reason: examHint.reason,
      readOnlyActuals: true,
    });
  }

  return hints;
}

function buildAtlasWeekHint(atlasUnits, weekIndex) {
  if (!atlasUnits?.length) return null;
  const weakest = [...atlasUnits].sort((a, b) => (a.successRate ?? 100) - (b.successRate ?? 100))[0];
  if (!weakest) return null;
  const total = weakest.totalQuestions ?? 0;
  const wrong = weakest.wrong ?? 0;
  const blank = weakest.blank ?? 0;
  const correct = Math.max(0, total - wrong - blank);
  return {
    subject_code: weakest.subject_code ?? '',
    topic_label: weakest.unitTitle ?? 'Ünite',
    solved_count: total,
    correct_count: correct,
    wrong_count: wrong,
    blank_count: blank,
    weekIndex,
  };
}

function buildExamWeekHint(exams, weekIndex) {
  if (!exams?.length || weekIndex == null) return null;
  const latest = exams[exams.length - 1];
  const weakTopic = [...(latest?.topicRows ?? [])].sort(
    (a, b) => (a.successRate ?? 100) - (b.successRate ?? 100)
  )[0];
  if (!weakTopic || !(weakTopic.attempts ?? 0)) return null;
  return {
    subject_code: weakTopic.subject_code,
    topic_label: weakTopic.topicLabel,
    source_name: latest.session?.title ?? 'Son deneme',
    solved_count: weakTopic.attempts,
    correct_count: weakTopic.correct,
    wrong_count: weakTopic.wrong,
    blank_count: weakTopic.blank,
    reason: `Son denemede ${weakTopic.topicLabel}: ${weakTopic.correct}D ${weakTopic.wrong}Y ${weakTopic.blank}B.`,
  };
}

export function buildTopicMatrixRows({ units = [], subjectId, subjectSlug, grade, gapProfile }) {
  const gradeUnits = (units ?? []).filter((unit) => {
    const subject = unit.curriculum_subjects;
    if (subjectId && unit.subject_id !== subjectId) return false;
    if (subjectSlug && subject?.slug !== subjectSlug) return false;
    if (grade != null && subject?.grade !== grade) return false;
    return true;
  });

  const priorityKeys = new Set(
    (gapProfile?.priorities ?? [])
      .map((row) => `${row.subject_code}::${row.topicLabel ?? row.sectionLabel ?? ''}`)
      .filter(Boolean)
  );

  const topicMap = new Map();

  for (const unit of gradeUnits) {
    for (const section of unit.sections ?? []) {
      const label = typeof section === 'string' ? section : section?.title ?? section?.name;
      if (!label) continue;
      const key = `${unit.id}::${label}`;
      const subjectCode = unit.curriculum_subjects?.slug ?? unit.subject_slug;
      const isPriority = [...priorityKeys].some(
        (item) => item.startsWith(`${subjectCode}::`) && item.includes(label)
      );
      const topicStat = (gapProfile?.allTopics ?? []).find(
        (row) => row.subject_code === subjectCode && row.topicLabel === label
      );
      topicMap.set(key, {
        topicKey: key,
        topicLabel: label,
        unitTitle: unit.title,
        subjectId: unit.subject_id,
        subject_code: subjectCode,
        isPriority,
        successRate: topicStat?.successRate ?? null,
        flagType: gapProfile?.priorities?.find(
          (p) => p.topicLabel === label || p.sectionLabel === label
        )?.flagType,
      });
    }
  }

  for (const topic of gapProfile?.allTopics ?? []) {
    const key = `topic::${topic.subject_code}::${topic.topicLabel}`;
    if (topicMap.has(key)) continue;
    const subjectUnit = gradeUnits.find(
      (u) => (u.curriculum_subjects?.slug ?? u.subject_slug) === topic.subject_code
    );
    if (!subjectUnit && subjectSlug && topic.subject_code !== subjectSlug) continue;
    topicMap.set(key, {
      topicKey: key,
      topicLabel: topic.topicLabel,
      unitTitle: null,
      subjectId: subjectUnit?.subject_id ?? subjectId,
      subject_code: topic.subject_code,
      isPriority: priorityKeys.has(`${topic.subject_code}::${topic.topicLabel}`),
      successRate: topic.successRate,
      flagType: gapProfile?.priorities?.find((p) => p.topicLabel === topic.topicLabel)?.flagType,
    });
  }

  return [...topicMap.values()].sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    return (a.successRate ?? 101) - (b.successRate ?? 101);
  });
}

export function buildScheduleHints({ gapProfile, plannedUnit = null }) {
  const hints = [];
  const tier = gapProfile?.tier?.label ?? 'Öğrenci';

  (gapProfile?.priorities ?? []).slice(0, 5).forEach((priority, index) => {
    if (priority.kind === 'attendance') {
      hints.push({
        day_of_week: (index % 5) + 1,
        dayLabel: DAY_SUGGESTIONS[index % DAY_SUGGESTIONS.length],
        start_time: `${13 + index}:00`,
        end_time: `${14 + index}:00`,
        label: `${priority.unitTitle ?? 'Ünite'} telafisi`,
        subject_code: priority.subject_code ?? '',
        reason: priority.flagReason,
      });
      return;
    }

    const subjectLabel = subjectByCode(priority.subject_code)?.label ?? priority.subject_code ?? '';
    const topic = priority.sectionLabel ?? priority.topicLabel ?? priority.unitTitle ?? 'Konu';
    hints.push({
      day_of_week: (index % 5) + 1,
      dayLabel: DAY_SUGGESTIONS[index % DAY_SUGGESTIONS.length],
      start_time: `${13 + (index % 3)}:30`,
      end_time: `${14 + (index % 3)}:30`,
      label: `${subjectLabel} · ${topic} tekrar`,
      subject_code: priority.subject_code ?? '',
      reason: `${tier} — ${flagTypeLabel(priority.flagType)}`,
    });
  });

  if (plannedUnit?.unit?.title) {
    hints.push({
      day_of_week: 1,
      dayLabel: 'Pazartesi',
      start_time: '15:00',
      end_time: '16:00',
      label: `Sınıf müfredatı: ${plannedUnit.unit.title}`,
      subject_code:
        plannedUnit.unit.curriculum_subjects?.slug ?? plannedUnit.unit.subject_slug ?? '',
      reason: 'Bu hafta sınıfta işlenen ünite ile hizalayın.',
    });
  }

  return hints;
}

export function buildQuestionRowWarnings(questionRows = []) {
  const warnings = [];

  for (const row of questionRows ?? []) {
    const label = row.topic_label || row.subject_code || 'Satır';
    const target = parseGuidanceCount(row.target_count);
    const solved = parseGuidanceCount(row.solved_count);
    const correct = parseGuidanceCount(row.correct_count) ?? 0;
    const wrong = parseGuidanceCount(row.wrong_count) ?? 0;
    const blank = parseGuidanceCount(row.blank_count) ?? 0;

    if (target && solved != null && solved > target) {
      warnings.push({
        topic: label,
        message: `Çözülen (${solved}) hedeften (${target}) fazla olamaz.`,
      });
    }

    if (solved != null && solved > 0 && correct + wrong + blank > solved) {
      warnings.push({
        topic: label,
        message: 'Doğru + yanlış + boş, çözülen soru sayısını geçemez.',
      });
    }

    if (target && solved != null) {
      const ratio = solved / target;
      if (ratio >= 0.8 && row.completion_status !== 'done') {
        warnings.push({
          topic: label,
          message: 'Hedefin %80+ tamamlandı ama durum "Yapıldı" değil — kontrol edin.',
        });
      }
    }
  }

  return warnings;
}

export function parseGuidanceCount(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.floor(n);
}

export function rowHasTarget(row) {
  const target = parseGuidanceCount(row?.target_count);
  return target != null && target > 0;
}

function formatGuidanceCount(value) {
  return value == null ? '' : String(value);
}

function clampDybToSolved(row, solved) {
  if (solved == null || solved <= 0) {
    return { correct_count: '', wrong_count: '', blank_count: '' };
  }

  let correct = parseGuidanceCount(row.correct_count) ?? 0;
  let wrong = parseGuidanceCount(row.wrong_count) ?? 0;
  let blank = parseGuidanceCount(row.blank_count) ?? 0;

  correct = Math.min(correct, solved);
  wrong = Math.min(wrong, solved);
  blank = Math.min(blank, solved);

  while (correct + wrong + blank > solved) {
    if (blank > 0) blank -= 1;
    else if (wrong > 0) wrong -= 1;
    else if (correct > 0) correct -= 1;
    else break;
  }

  return {
    correct_count:
      row.correct_count === '' && correct === 0 ? '' : formatGuidanceCount(correct),
    wrong_count: row.wrong_count === '' && wrong === 0 ? '' : formatGuidanceCount(wrong),
    blank_count: row.blank_count === '' && blank === 0 ? '' : formatGuidanceCount(blank),
  };
}

export function applyQuestionRowCountChange(row, field, rawValue) {
  if (field === 'target_count') {
    if (rawValue === '') {
      return {
        ...row,
        target_count: '',
        solved_count: '',
        correct_count: '',
        wrong_count: '',
        blank_count: '',
        completion_status: 'not_done',
      };
    }

    const newTarget = parseGuidanceCount(rawValue);
    if (newTarget == null) {
      return { ...row, target_count: rawValue };
    }

    if (newTarget <= 0) {
      return {
        ...row,
        target_count: formatGuidanceCount(newTarget),
        solved_count: '',
        correct_count: '',
        wrong_count: '',
        blank_count: '',
        completion_status: 'not_done',
      };
    }

    let next = { ...row, target_count: formatGuidanceCount(newTarget) };
    const solved = parseGuidanceCount(next.solved_count);
    if (solved != null && solved > newTarget) {
      next.solved_count = formatGuidanceCount(newTarget);
    }
    const solvedAfter = parseGuidanceCount(next.solved_count);
    return { ...next, ...clampDybToSolved(next, solvedAfter) };
  }

  if (!rowHasTarget(row)) return row;

  const target = parseGuidanceCount(row.target_count);

  if (field === 'solved_count') {
    if (rawValue === '') {
      return {
        ...row,
        solved_count: '',
        correct_count: '',
        wrong_count: '',
        blank_count: '',
      };
    }

    const parsed = parseGuidanceCount(rawValue);
    if (parsed == null) return { ...row, solved_count: rawValue };

    const capped = Math.min(parsed, target);
    const next = { ...row, solved_count: formatGuidanceCount(capped) };
    return { ...next, ...clampDybToSolved(next, capped) };
  }

  const solved = parseGuidanceCount(row.solved_count);
  if (solved == null || solved <= 0) {
    return { ...row, [field]: '' };
  }

  if (rawValue === '') {
    return { ...row, [field]: '' };
  }

  const parsed = parseGuidanceCount(rawValue);
  if (parsed == null) return { ...row, [field]: rawValue };

  const correct = parseGuidanceCount(row.correct_count) ?? 0;
  const wrong = parseGuidanceCount(row.wrong_count) ?? 0;
  const blank = parseGuidanceCount(row.blank_count) ?? 0;

  if (field === 'correct_count') {
    const maxCorrect = Math.max(0, solved - wrong - blank);
    return {
      ...row,
      correct_count: formatGuidanceCount(Math.min(parsed, maxCorrect)),
    };
  }

  if (field === 'wrong_count') {
    const maxWrong = Math.max(0, solved - correct - blank);
    return {
      ...row,
      wrong_count: formatGuidanceCount(Math.min(parsed, maxWrong)),
    };
  }

  if (field === 'blank_count') {
    const maxBlank = Math.max(0, solved - correct - wrong);
    return {
      ...row,
      blank_count: formatGuidanceCount(Math.min(parsed, maxBlank)),
    };
  }

  return row;
}

export function sanitizeQuestionRow(row) {
  if (!rowHasTarget(row)) {
    return {
      ...row,
      solved_count: '',
      correct_count: '',
      wrong_count: '',
      blank_count: '',
      completion_status: 'not_done',
    };
  }

  let next = applyQuestionRowCountChange(
    row,
    'target_count',
    String(parseGuidanceCount(row.target_count))
  );
  const solved = parseGuidanceCount(row.solved_count);
  if (solved == null) {
    return { ...next, solved_count: '', correct_count: '', wrong_count: '', blank_count: '' };
  }

  next = applyQuestionRowCountChange(next, 'solved_count', String(solved));
  for (const field of ['correct_count', 'wrong_count', 'blank_count']) {
    const value = parseGuidanceCount(row[field]);
    if (value != null) {
      next = applyQuestionRowCountChange(next, field, String(value));
    }
  }
  return next;
}

export function matrixCellHint(topicRow, atlasUnits = [], unitRollup = []) {
  const parts = [];
  if (topicRow.successRate != null) {
    parts.push(`Deneme başarısı: %${topicRow.successRate}`);
  }
  const unitMatch = (unitRollup ?? []).find((row) =>
    (row.topics ?? []).some((t) => t.topicLabel === topicRow.topicLabel)
  );
  if (unitMatch) {
    parts.push(`Ünite deneme: %${unitMatch.successRate}`);
  }
  const atlasMatch = (atlasUnits ?? []).find((row) => row.unitTitle === topicRow.unitTitle);
  if (atlasMatch) {
    parts.push(`Atlas: %${atlasMatch.successRate}`);
  }
  if (topicRow.flagType) {
    parts.push(flagTypeLabel(topicRow.flagType));
  }
  return parts.join(' · ');
}

export { LGS_SUBJECTS, subjectByCode };
