import { buildProgressSeries, LGS_SUBJECTS, subjectByCode } from './lgsExam';
import { buildErrorReport } from './examAnalysis';

export const GAP_SUCCESS_THRESHOLD = 50;
export const GAP_MIN_ATTEMPTS = 3;
export const GAP_MIN_EXAMS = 2;
export const PRIORITY_TOP_N = 3;

export const TIER_A_MIN_NET = 70;
export const TIER_C_MAX_NET = 40;
export const RECENT_EXAM_WINDOW = 3;
export const TREND_COMPARE_EXAMS = 4;
export const RELATIVE_GAP_PP = 15;
export const RELATIVE_CLEAR_PP = 5;
export const TREND_TOPIC_DROP_PP = 20;
export const TREND_SUBJECT_NET_DROP = 3;
export const TREND_TOTAL_NET_DROP = 5;
export const CLASS_SUBJECT_NET_GAP = 5;
export const CARELESS_MIN_LIFETIME_RATE = 70;
export const CARELESS_LAST_SESSION_MAX_RATE = 40;

export const FLAG_TYPES = {
  foundation: 'foundation',
  relative: 'relative',
  trend: 'trend',
  class: 'class',
  practice: 'practice',
  attendance: 'attendance',
  careless: 'careless',
};

export const TIER_THRESHOLDS = {
  A: { foundation: 65, practice: 65, atlasOnly: 65 },
  B: { foundation: 50, practice: 55, atlasOnly: 55 },
  C: { foundation: 55, practice: 50, atlasOnly: 50 },
};

const FLAG_TYPE_LABELS = {
  foundation: 'Temel eksik',
  relative: 'Kişisel zayıflık',
  trend: 'Düşüş trendi',
  class: 'Sınıf altı',
  practice: 'Eksik çalışma',
  attendance: 'Devamsızlık',
  careless: 'Dikkatsizlik',
};

const TIER_LABELS = { A: 'Güçlü', B: 'Orta', C: 'Destek' };
const TRAJECTORY_LABELS = { rising: 'Yükselen', flat: 'Durağan', declining: 'Düşen' };

export function normalizeCurriculumText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function mapTopicToCurriculum(topicLabel, units = [], subjectCode = null) {
  const label = String(topicLabel ?? '').trim();
  if (!label || label === '—' || label === 'Diğer') {
    return { unitId: null, unitTitle: null, sectionLabel: null, mapped: false };
  }

  const normalizedLabel = normalizeCurriculumText(label);
  const subjectUnits = subjectCode
    ? units.filter((unit) => {
        const subject = unit.curriculum_subjects ?? unit.subject;
        if (subject?.slug) return subject.slug === subjectCode;
        if (unit.subject_id && subjectCode) {
          const slug = subjectByCode(subjectCode)?.code;
          return unit.subject_slug === slug || unit.subject_code === subjectCode;
        }
        return true;
      })
    : units;

  for (const unit of subjectUnits) {
    for (const section of unit.sections ?? []) {
      const sectionText = typeof section === 'string' ? section : section?.title ?? section?.name;
      if (!sectionText) continue;
      const normalizedSection = normalizeCurriculumText(sectionText);
      if (
        normalizedSection === normalizedLabel ||
        normalizedSection.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedSection)
      ) {
        return {
          unitId: unit.id,
          unitTitle: unit.title,
          sectionLabel: sectionText,
          mapped: true,
        };
      }
    }
  }

  for (const unit of subjectUnits) {
    const normalizedUnit = normalizeCurriculumText(unit.title);
    if (
      normalizedUnit === normalizedLabel ||
      normalizedUnit.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedUnit)
    ) {
      return {
        unitId: unit.id,
        unitTitle: unit.title,
        sectionLabel: null,
        mapped: true,
      };
    }
  }

  return { unitId: null, unitTitle: null, sectionLabel: null, mapped: false, rawLabel: label };
}

export function buildStudentTopicAnalysis({ questions, answers, studentId }) {
  const studentAnswers = (answers ?? []).filter((row) => row.student_id === studentId);
  const buckets = new Map();

  for (const row of studentAnswers) {
    const question = row.exam_questions ?? (questions ?? []).find((item) => item.id === row.question_id);
    if (!question) continue;

    const label = question.topic_label ?? 'Diğer';
    const key = `${question.subject_code}::${label}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        subject_code: question.subject_code,
        topicLabel: label,
        attempts: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
      });
    }

    const bucket = buckets.get(key);
    bucket.attempts += 1;
    if (!row.choice) bucket.blank += 1;
    else if (row.choice === question.correct_choice) bucket.correct += 1;
    else bucket.wrong += 1;
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      successRate: bucket.attempts
        ? Math.round((bucket.correct / bucket.attempts) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

export function aggregateTopicStatsAcrossExams(topicRowsBySession = []) {
  const merged = new Map();

  for (const rows of topicRowsBySession) {
    for (const row of rows ?? []) {
      const key = `${row.subject_code}::${row.topicLabel}`;
      const bucket = merged.get(key) ?? {
        subject_code: row.subject_code,
        topicLabel: row.topicLabel,
        attempts: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        examCount: 0,
      };
      bucket.attempts += row.attempts ?? 0;
      bucket.correct += row.correct ?? 0;
      bucket.wrong += row.wrong ?? 0;
      bucket.blank += row.blank ?? 0;
      if (row.attempts > 0) bucket.examCount += 1;
      merged.set(key, bucket);
    }
  }

  return [...merged.values()]
    .map((bucket) => ({
      ...bucket,
      successRate: bucket.attempts
        ? Math.round((bucket.correct / bucket.attempts) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

function topicKey(row) {
  return `${row.subject_code}::${row.topicLabel}`;
}

function roundRate(correct, attempts) {
  return attempts ? Math.round((correct / attempts) * 1000) / 10 : 0;
}

export function aggregateTopicStatsForRecentSessions(sessionTopicRows = [], windowSize = RECENT_EXAM_WINDOW) {
  const recent = (sessionTopicRows ?? []).slice(-windowSize);
  return aggregateTopicStatsAcrossExams(recent.map((entry) => entry.topics ?? entry));
}

export function detectStudentTier(progressSeries = []) {
  const latest = progressSeries[progressSeries.length - 1];
  const latestNet = latest?.totalNet ?? null;
  if (latestNet == null) {
    return { tier: 'B', label: TIER_LABELS.B, latestNet: null };
  }
  if (latestNet >= TIER_A_MIN_NET) {
    return { tier: 'A', label: TIER_LABELS.A, latestNet };
  }
  if (latestNet <= TIER_C_MAX_NET) {
    return { tier: 'C', label: TIER_LABELS.C, latestNet };
  }
  return { tier: 'B', label: TIER_LABELS.B, latestNet };
}

export function detectTrajectory(progressSeries = []) {
  const nets = (progressSeries ?? [])
    .map((row) => Number(row.totalNet))
    .filter((value) => !Number.isNaN(value));
  if (nets.length < 2) return 'flat';
  const recent = nets.slice(-3);
  const prior = nets.slice(-6, -3);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.length
    ? prior.reduce((a, b) => a + b, 0) / prior.length
    : nets.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, nets.length - 1);
  const delta = recentAvg - priorAvg;
  if (delta >= 2) return 'rising';
  if (delta <= -2) return 'declining';
  return 'flat';
}

function computeSubjectTopicAverages(topics = []) {
  const buckets = new Map();
  for (const row of topics) {
    if (!row.subject_code || !(row.attempts ?? 0)) continue;
    const bucket = buckets.get(row.subject_code) ?? { correct: 0, attempts: 0 };
    bucket.correct += row.correct ?? 0;
    bucket.attempts += row.attempts ?? 0;
    buckets.set(row.subject_code, bucket);
  }
  const avgs = {};
  for (const [code, bucket] of buckets) {
    avgs[code] = roundRate(bucket.correct, bucket.attempts);
  }
  return avgs;
}

function buildStudentSubjectNetMap(subjectResults = [], studentId) {
  const bySubject = new Map();
  for (const row of subjectResults ?? []) {
    if (row.student_id !== studentId) continue;
    const code = row.subject_code;
    if (!code) continue;
    const bucket = bySubject.get(code) ?? { nets: [], totalNet: 0, count: 0 };
    const net = Number(row.net);
    if (!Number.isNaN(net)) {
      bucket.nets.push(net);
      bucket.totalNet += net;
      bucket.count += 1;
    }
    bySubject.set(code, bucket);
  }
  const stats = {};
  for (const [code, bucket] of bySubject) {
    stats[code] = {
      avgNet: bucket.count ? Math.round((bucket.totalNet / bucket.count) * 100) / 100 : null,
      latestNet: bucket.nets[bucket.nets.length - 1] ?? null,
      nets: bucket.nets,
    };
  }
  return stats;
}

function buildClassSubjectNetAverages(classSubjectResults = [], studentId) {
  const bySubject = new Map();
  for (const row of classSubjectResults ?? []) {
    if (row.student_id === studentId) continue;
    const code = row.subject_code;
    const net = Number(row.net);
    if (!code || Number.isNaN(net)) continue;
    const bucket = bySubject.get(code) ?? [];
    bucket.push(net);
    bySubject.set(code, bucket);
  }
  const avgs = {};
  for (const [code, nets] of bySubject) {
    avgs[code] = Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100;
  }
  return avgs;
}

function buildSubjectNetSeries(subjectResults = [], studentId) {
  const bySession = new Map();
  for (const row of subjectResults ?? []) {
    if (row.student_id !== studentId) continue;
    const sessionId = row.session_id ?? row.exam_sessions?.id;
    if (!sessionId) continue;
    const heldOn = row.exam_sessions?.held_on ?? '';
    if (!bySession.has(sessionId)) {
      bySession.set(sessionId, { sessionId, heldOn, subjects: {} });
    }
    const net = Number(row.net);
    if (!Number.isNaN(net)) {
      bySession.get(sessionId).subjects[row.subject_code] = net;
    }
  }
  return [...bySession.values()].sort((a, b) => a.heldOn.localeCompare(b.heldOn));
}

function topicSuccessInSession(sessionEntry, subjectCode, topicLabel) {
  const key = `${subjectCode}::${topicLabel}`;
  const row = (sessionEntry?.topics ?? []).find((item) => topicKey(item) === key);
  return row?.successRate ?? null;
}

function computeTopicTrendDrop(sessionTopicRows = [], subjectCode, topicLabel) {
  const rates = (sessionTopicRows ?? [])
    .map((entry) => topicSuccessInSession(entry, subjectCode, topicLabel))
    .filter((value) => value != null);
  if (rates.length < TREND_COMPARE_EXAMS) return null;
  const recent = rates.slice(-2);
  const prior = rates.slice(-4, -2);
  if (recent.length < 2 || prior.length < 2) return null;
  const recentAvg = (recent[0] + recent[1]) / 2;
  const priorAvg = (prior[0] + prior[1]) / 2;
  return Math.round((priorAvg - recentAvg) * 10) / 10;
}

function computeSubjectTrendDrop(subjectNetSeries = [], subjectCode) {
  const nets = subjectNetSeries
    .map((entry) => entry.subjects[subjectCode])
    .filter((value) => value != null);
  if (nets.length < TREND_COMPARE_EXAMS) return null;
  const recent = nets.slice(-2);
  const prior = nets.slice(-4, -2);
  if (recent.length < 2 || prior.length < 2) return null;
  const recentAvg = (recent[0] + recent[1]) / 2;
  const priorAvg = (prior[0] + prior[1]) / 2;
  return Math.round((priorAvg - recentAvg) * 100) / 100;
}

function tierFoundationThreshold(tier) {
  return TIER_THRESHOLDS[tier]?.foundation ?? GAP_SUCCESS_THRESHOLD;
}

function tierPracticeThreshold(tier) {
  return TIER_THRESHOLDS[tier]?.practice ?? GAP_SUCCESS_THRESHOLD;
}

function flagTypeWeight(flagType, tier) {
  const weights = {
    foundation: { A: 0.8, B: 1.2, C: 1.6 },
    relative: { A: 1.5, B: 1.2, C: 0.9 },
    trend: { A: 1.4, B: 1.2, C: 1.0 },
    class: { A: 0.7, B: 1.1, C: 1.4 },
    practice: { A: 1.0, B: 1.1, C: 1.2 },
    attendance: { A: 0.8, B: 1.0, C: 1.3 },
    careless: { A: 1.3, B: 0.9, C: 0.6 },
  };
  return weights[flagType]?.[tier] ?? 1;
}

function buildTopicFlagBase(topic, mapping, atlasRow, missed) {
  return {
    kind: 'topic',
    topicLabel: topic.topicLabel,
    sectionLabel: mapping.sectionLabel,
    unitId: mapping.unitId,
    unitTitle: mapping.unitTitle,
    subject_code: topic.subject_code,
    successRate: topic.successRate,
    attempts: topic.attempts,
    correct: topic.correct,
    wrong: topic.wrong,
    blank: topic.blank,
    examCount: topic.examCount,
    atlasSuccessRate: atlasRow?.successRate ?? null,
    atlasWrong: atlasRow?.wrong ?? null,
    atlasQuestions: atlasRow?.totalQuestions ?? null,
    missedDays: missed?.absentCount ?? 0,
  };
}

function dedupeFlags(flags = []) {
  const merged = new Map();
  for (const flag of flags) {
    const key =
      flag.kind === 'subject'
        ? `subject:${flag.subject_code}:${flag.flagType}`
        : flag.kind === 'attendance'
          ? `attendance:${flag.unitId}`
          : flag.kind === 'practice'
            ? `practice:${flag.unitId}`
            : `topic:${flag.subject_code}:${flag.topicLabel ?? flag.sectionLabel}:${flag.flagType}`;
    const existing = merged.get(key);
    if (!existing || flag.score > existing.score) {
      merged.set(key, {
        ...flag,
        flagTypes: existing ? [...new Set([...existing.flagTypes, flag.flagType])] : [flag.flagType],
      });
    } else if (existing) {
      existing.flagTypes = [...new Set([...existing.flagTypes, flag.flagType])];
    }
  }
  return [...merged.values()].map((row) => ({
    ...row,
    flagType: row.flagTypes?.[0] ?? row.flagType,
  }));
}

export function computeGrowthTarget({ tierInfo, trajectory, progressSeries = [], subjectNetStats = {} }) {
  const latestNet = tierInfo?.latestNet;
  const recent = progressSeries.slice(-3);
  const recentAvg =
    recent.length > 0
      ? Math.round((recent.reduce((sum, row) => sum + (row.totalNet ?? 0), 0) / recent.length) * 100) / 100
      : null;
  const trajectoryLabel = TRAJECTORY_LABELS[trajectory] ?? TRAJECTORY_LABELS.flat;

  if (tierInfo?.tier === 'C') {
    const targetNet = recentAvg != null ? Math.round((recentAvg + 8) * 100) / 100 : null;
    return {
      tier: tierInfo.tier,
      tierLabel: tierInfo.label,
      trajectory,
      trajectoryLabel,
      summary:
        targetNet != null
          ? `Son 3 deneme ortalaması ${recentAvg} net — hedef: ${targetNet} net (+8). En zayıf dersleri sınıf seviyesine yaklaştırın.`
          : 'Temel konu eksiklerini kapatın; devamsızlık telafisi öncelikli.',
    };
  }

  if (tierInfo?.tier === 'A') {
    const peakNet = Math.max(...progressSeries.map((row) => row.totalNet ?? 0), latestNet ?? 0);
    return {
      tier: tierInfo.tier,
      tierLabel: tierInfo.label,
      trajectory,
      trajectoryLabel,
      summary: `Zirve net ${Math.round(peakNet * 100) / 100} — hedef: zirveyi koruyup kişisel zayıf konuları güçlendirmek. ${trajectoryLabel} trend.`,
    };
  }

  const targetNet = recentAvg != null ? Math.round((recentAvg + 5) * 100) / 100 : null;
  const subjectCodes = Object.keys(subjectNetStats);
  const weakest = subjectCodes
    .map((code) => ({ code, avg: subjectNetStats[code]?.avgNet ?? 0 }))
    .sort((a, b) => a.avg - b.avg)[0];
  const weakLabel = weakest ? subjectByCode(weakest.code)?.label ?? weakest.code : null;
  return {
    tier: tierInfo?.tier ?? 'B',
    tierLabel: tierInfo?.label ?? TIER_LABELS.B,
    trajectory,
    trajectoryLabel,
    summary:
      targetNet != null
        ? `Son 3 deneme ortalaması ${recentAvg} net — hedef: ${targetNet} net (+5).${weakLabel ? ` Önce ${weakLabel} dersini dengeleyin.` : ''}`
        : 'Dersler arası dengeyi koruyarak net artışı hedefleyin.',
  };
}

export function rollupDenemeTopicsToUnits(topicRows = [], units = []) {
  const buckets = new Map();

  for (const row of topicRows) {
    const mapping = mapTopicToCurriculum(row.topicLabel, units, row.subject_code);
    const unitKey = mapping.unitId ?? `unmapped:${row.subject_code}:${row.topicLabel}`;
    const bucket = buckets.get(unitKey) ?? {
      unitId: mapping.unitId,
      unitTitle: mapping.unitTitle ?? row.topicLabel,
      subject_code: row.subject_code,
      attempts: 0,
      correct: 0,
      wrong: 0,
      blank: 0,
      topics: [],
    };
    bucket.attempts += row.attempts ?? 0;
    bucket.correct += row.correct ?? 0;
    bucket.wrong += row.wrong ?? 0;
    bucket.blank += row.blank ?? 0;
    bucket.topics.push({
      topicLabel: row.topicLabel,
      sectionLabel: mapping.sectionLabel,
      successRate: row.successRate,
      wrong: row.wrong,
      blank: row.blank,
    });
    buckets.set(unitKey, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      successRate: bucket.attempts
        ? Math.round((bucket.correct / bucket.attempts) * 1000) / 10
        : 0,
      topics: bucket.topics.sort((a, b) => a.successRate - b.successRate),
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

export function buildAtlasUnitStats({ atlasSessions = [], atlasResults = [], studentId, units = [] }) {
  const unitById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit]));
  const buckets = new Map();

  for (const session of atlasSessions ?? []) {
    if (session.lesson_type !== 'practice' || !session.unit_id) continue;
    const unit = unitById[session.unit_id];
    const result = (atlasResults ?? []).find(
      (row) => row.session_id === session.id && row.student_id === studentId
    );
    if (!result) continue;

    const total = session.questions_total ?? 0;
    const wrong = result.wrong_count ?? 0;
    const blank = result.blank_count ?? 0;
    const correct = Math.max(0, total - wrong - blank);
    const key = session.unit_id;

    const bucket = buckets.get(key) ?? {
      unitId: session.unit_id,
      unitTitle: unit?.title ?? 'Ünite',
      subjectId: session.subject_id,
      subject_code: unit?.curriculum_subjects?.slug ?? unit?.subject_slug ?? null,
      subjectLabel: unit?.curriculum_subjects?.name ?? null,
      totalQuestions: 0,
      correct: 0,
      wrong: 0,
      blank: 0,
      sessions: 0,
    };
    bucket.totalQuestions += total;
    bucket.correct += correct;
    bucket.wrong += wrong;
    bucket.blank += blank;
    bucket.sessions += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      successRate: bucket.totalQuestions
        ? Math.round((bucket.correct / bucket.totalQuestions) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

export function isPersistentGap(row, { minExams = GAP_MIN_EXAMS, minAttempts = GAP_MIN_ATTEMPTS, threshold = GAP_SUCCESS_THRESHOLD } = {}) {
  return (
    (row.examCount ?? 1) >= minExams &&
    (row.attempts ?? 0) >= minAttempts &&
    (row.successRate ?? 100) < threshold
  );
}

export function isGapFlag(row) {
  if (!row?.flagType) return isPersistentGap(row);
  return true;
}

export function flagTypeLabel(flagType) {
  return FLAG_TYPE_LABELS[flagType] ?? 'Eksik';
}

export function suggestGapAction({ flagType, topicRow, unitRow, missedUnit, subjectCode }) {
  if (flagType === FLAG_TYPES.attendance || missedUnit) {
    return 'Konu telafisi — öğrenci bu üniteyi sınıfta kaçırmış.';
  }
  if (flagType === FLAG_TYPES.trend) {
    return 'Son denemelerde düşüş var — hedefli tekrar ve benzer soru çözümü yapın.';
  }
  if (flagType === FLAG_TYPES.relative) {
    return 'Bu öğrencinin diğer konularına göre zayıf — kişisel hedefli çalışma planı oluşturun.';
  }
  if (flagType === FLAG_TYPES.class) {
    const label = subjectByCode(subjectCode)?.label ?? 'Ders';
    return `${label} dersinde sınıf ortalamasına yaklaşmak için ek çalışma önerilir.`;
  }
  if (flagType === FLAG_TYPES.practice) {
    return 'Deneme ve sınıf çalışması performansı düşük — ünite tekrarı + Atlas pratiği.';
  }
  if (flagType === FLAG_TYPES.careless) {
    return 'Genel olarak iyi bilinen konuda son denemede kayıp — dikkat ve süre yönetimi çalışın.';
  }
  if (unitRow && unitRow.successRate != null && unitRow.successRate < GAP_SUCCESS_THRESHOLD) {
    return 'Ünite genelinde sınıf çalışması da zayıf — konu tekrarı + soru çözümü.';
  }
  if (topicRow?.sectionLabel) {
    return `${topicRow.sectionLabel} odaklı çalışma önerilir.`;
  }
  if (topicRow?.topicLabel) {
    return `${topicRow.topicLabel} konusuna odaklanın.`;
  }
  return 'Hedefli tekrar ve soru çözümü önerilir.';
}

export function explainGapReason(row) {
  if (row.kind === 'attendance' || row.flagType === FLAG_TYPES.attendance) {
    const unit = row.unitTitle ?? 'Bu ünite';
    return `${unit} konusunu sınıfta ${row.missedDays} gün kaçırdı. Devamsızlık uyarısı 2 ve üzeri gün kaçırmada verilir.`;
  }

  if (row.kind === 'subject') {
    const subjectLabel = subjectByCode(row.subject_code)?.label ?? row.subject_code;
    if (row.flagType === FLAG_TYPES.class) {
      return `${subjectLabel}: öğrenci ders ortalaması ${row.avgNet} net, sınıf ortalaması ${row.classAvgNet} net (fark ${row.gapNet} net).`;
    }
    if (row.flagType === FLAG_TYPES.trend) {
      return `${subjectLabel}: son 2 denemede ders neti ${row.trendDrop} net düştü.`;
    }
    if (row.flagType === FLAG_TYPES.relative) {
      return `${subjectLabel}: en güçlü dersine göre ${row.gapNet} net geride (kişisel denge eksikliği).`;
    }
  }

  const subjectLabel = subjectByCode(row.subject_code)?.label;
  const topic = row.sectionLabel ?? row.topicLabel ?? 'Konu';
  const statsLine =
    row.successRate != null
      ? `${row.examCount ?? 0} denemede ${row.attempts ?? 0} soruda %${row.successRate} başarı.`
      : '';

  const reasonByType = {
    [FLAG_TYPES.foundation]: `${statsLine} Temel eksik: konu eşiğin altında (öğrenci seviyesine göre %${row.thresholdUsed ?? GAP_SUCCESS_THRESHOLD} altı).`,
    [FLAG_TYPES.relative]: `${statsLine} Kişisel zayıflık: öğrencinin ${subjectLabel ?? 'ders'} ortalaması (%${row.subjectAvgRate}) ile arasında ${row.gapPp} puan fark var.`,
    [FLAG_TYPES.trend]: `${statsLine} Düşüş trendi: son 2 denemede başarı ${row.trendDropPp} puan geriledi.`,
    [FLAG_TYPES.practice]: `${row.unitTitle ?? topic}: deneme ünite başarısı %${row.successRate ?? '—'}, Atlas pratiği %${row.atlasSuccessRate ?? '—'}.`,
    [FLAG_TYPES.careless]: `${statsLine} Genel başarı yüksek (%${row.lifetimeRate}) ama son denemede %${row.recentRate} — dikkat kaybı.`,
  };

  const parts = [
    `${subjectLabel ? `${subjectLabel} · ` : ''}${topic}.`,
    reasonByType[row.flagType] ?? statsLine,
  ].filter(Boolean);

  if (row.missedDays) {
    parts.push(`Ek neden: ilgili üniteyi sınıfta ${row.missedDays} gün kaçırdı.`);
  }
  if (
    row.atlasQuestions != null &&
    row.atlasSuccessRate != null &&
    row.atlasSuccessRate < GAP_SUCCESS_THRESHOLD &&
    row.flagType !== FLAG_TYPES.practice
  ) {
    parts.push(
      `Ek neden: sınıf çalışmasında düşük performans (${row.atlasQuestions} soru, %${row.atlasSuccessRate}).`
    );
  }

  return parts.join(' ');
}

export function buildStudentGapProfile({
  studentId,
  aggregatedTopics = [],
  sessionTopicRows = [],
  unitRollup = [],
  atlasUnits = [],
  missedUnitFlags = [],
  units = [],
  subjectResults = [],
  rankings = [],
  classSubjectResults = [],
}) {
  const missedByUnitId = new Map(
    (missedUnitFlags ?? [])
      .filter((row) => row.studentId === studentId)
      .map((row) => [row.unitId, row])
  );

  const studentRankings = (rankings ?? []).filter((row) => row.student_id === studentId);
  const progressSeries = buildProgressSeries(studentRankings);
  const tierInfo = detectStudentTier(progressSeries);
  const trajectory = detectTrajectory(progressSeries);
  const tier = tierInfo.tier;
  const foundationThreshold = tierFoundationThreshold(tier);
  const practiceThreshold = tierPracticeThreshold(tier);

  const sortedSessions = [...(sessionTopicRows ?? [])].sort((a, b) =>
    (a.heldOn ?? '').localeCompare(b.heldOn ?? '')
  );
  const recentTopics = aggregateTopicStatsForRecentSessions(sortedSessions, RECENT_EXAM_WINDOW);
  const subjectAvgRates = computeSubjectTopicAverages(aggregatedTopics);
  const subjectNetStats = buildStudentSubjectNetMap(subjectResults, studentId);
  const classSubjectAvgs = buildClassSubjectNetAverages(classSubjectResults, studentId);
  const subjectNetSeries = buildSubjectNetSeries(subjectResults, studentId);

  const foundationSource = tier === 'A' ? recentTopics : aggregatedTopics;
  const flags = [];

  for (const topic of foundationSource) {
    if ((topic.examCount ?? 0) < GAP_MIN_EXAMS || (topic.attempts ?? 0) < GAP_MIN_ATTEMPTS) continue;
    if ((topic.successRate ?? 100) >= foundationThreshold) continue;

    const mapping = mapTopicToCurriculum(topic.topicLabel, units, topic.subject_code);
    const atlasRow = atlasUnits.find((row) => row.unitId === mapping.unitId);
    const missed = mapping.unitId ? missedByUnitId.get(mapping.unitId) : null;

    flags.push({
      ...buildTopicFlagBase(topic, mapping, atlasRow, missed),
      flagType: FLAG_TYPES.foundation,
      thresholdUsed: foundationThreshold,
      score:
        (100 - topic.successRate) * flagTypeWeight(FLAG_TYPES.foundation, tier) +
        (missed ? 20 : 0) +
        (atlasRow && atlasRow.successRate < practiceThreshold ? 10 : 0),
      suggestedAction: suggestGapAction({
        flagType: FLAG_TYPES.foundation,
        topicRow: { ...topic, sectionLabel: mapping.sectionLabel },
        unitRow: atlasRow,
        missedUnit: missed,
      }),
    });
  }

  const relativeCandidates = tier === 'C' ? aggregatedTopics : [...aggregatedTopics].sort(
    (a, b) => a.successRate - b.successRate
  );
  for (const topic of relativeCandidates) {
    if ((topic.attempts ?? 0) < GAP_MIN_ATTEMPTS) continue;
    const subjectAvg = subjectAvgRates[topic.subject_code];
    if (subjectAvg == null) continue;
    const gapPp = Math.round((subjectAvg - topic.successRate) * 10) / 10;
    if (gapPp < RELATIVE_GAP_PP) continue;
    if (tier === 'A' && topic.successRate >= 60) continue;
    if (tier === 'C' && topic.successRate < foundationThreshold) continue;

    const mapping = mapTopicToCurriculum(topic.topicLabel, units, topic.subject_code);
    const atlasRow = atlasUnits.find((row) => row.unitId === mapping.unitId);
    const missed = mapping.unitId ? missedByUnitId.get(mapping.unitId) : null;

    flags.push({
      ...buildTopicFlagBase(topic, mapping, atlasRow, missed),
      flagType: FLAG_TYPES.relative,
      subjectAvgRate: subjectAvg,
      gapPp,
      score: gapPp * 2 * flagTypeWeight(FLAG_TYPES.relative, tier) + (missed ? 10 : 0),
      suggestedAction: suggestGapAction({
        flagType: FLAG_TYPES.relative,
        topicRow: { ...topic, sectionLabel: mapping.sectionLabel },
      }),
    });
  }

  for (const topic of aggregatedTopics) {
    if ((topic.attempts ?? 0) < GAP_MIN_ATTEMPTS) continue;
    const trendDropPp = computeTopicTrendDrop(sortedSessions, topic.subject_code, topic.topicLabel);
    if (trendDropPp == null || trendDropPp < TREND_TOPIC_DROP_PP) continue;

    const mapping = mapTopicToCurriculum(topic.topicLabel, units, topic.subject_code);
    const atlasRow = atlasUnits.find((row) => row.unitId === mapping.unitId);
    const missed = mapping.unitId ? missedByUnitId.get(mapping.unitId) : null;

    flags.push({
      ...buildTopicFlagBase(topic, mapping, atlasRow, missed),
      flagType: FLAG_TYPES.trend,
      trendDropPp,
      score: trendDropPp * 1.5 * flagTypeWeight(FLAG_TYPES.trend, tier) + (trajectory === 'declining' ? 8 : 0),
      suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.trend }),
    });
  }

  if (trajectory === 'declining' && progressSeries.length >= TREND_COMPARE_EXAMS) {
    const nets = progressSeries.map((row) => row.totalNet ?? 0);
    const recentAvg = (nets[nets.length - 1] + nets[nets.length - 2]) / 2;
    const priorAvg = (nets[nets.length - 3] + nets[nets.length - 4]) / 2;
    const totalDrop = Math.round((priorAvg - recentAvg) * 100) / 100;
    if (totalDrop >= TREND_TOTAL_NET_DROP) {
      flags.push({
        kind: 'subject',
        flagType: FLAG_TYPES.trend,
        subject_code: null,
        topicLabel: null,
        sectionLabel: null,
        unitId: null,
        unitTitle: 'Genel performans',
        successRate: null,
        attempts: 0,
        examCount: progressSeries.length,
        trendDrop: totalDrop,
        score: totalDrop * 3 * flagTypeWeight(FLAG_TYPES.trend, tier),
        suggestedAction: 'Genel net düşüşü var — deneme analizi ve çalışma planı gözden geçirilmeli.',
      });
    }
  }

  for (const def of LGS_SUBJECTS) {
    const stats = subjectNetStats[def.code];
    if (!stats || stats.avgNet == null) continue;
    const classAvg = classSubjectAvgs[def.code];
    if (classAvg != null && tier !== 'A') {
      const gapNet = Math.round((classAvg - stats.avgNet) * 100) / 100;
      if (gapNet >= CLASS_SUBJECT_NET_GAP) {
        flags.push({
          kind: 'subject',
          flagType: FLAG_TYPES.class,
          subject_code: def.code,
          topicLabel: null,
          sectionLabel: null,
          unitId: null,
          unitTitle: def.label,
          successRate: null,
          avgNet: stats.avgNet,
          classAvgNet: classAvg,
          gapNet,
          examCount: stats.count ?? 0,
          score: gapNet * 4 * flagTypeWeight(FLAG_TYPES.class, tier),
          suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.class, subjectCode: def.code }),
        });
      }
    }

    const subjectTrendDrop = computeSubjectTrendDrop(subjectNetSeries, def.code);
    if (subjectTrendDrop != null && subjectTrendDrop >= TREND_SUBJECT_NET_DROP) {
      flags.push({
        kind: 'subject',
        flagType: FLAG_TYPES.trend,
        subject_code: def.code,
        topicLabel: null,
        sectionLabel: null,
        unitId: null,
        unitTitle: def.label,
        successRate: null,
        trendDrop: subjectTrendDrop,
        examCount: stats?.count ?? 0,
        score: subjectTrendDrop * 5 * flagTypeWeight(FLAG_TYPES.trend, tier),
        suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.trend, subjectCode: def.code }),
      });
    }
  }

  if (tier !== 'C') {
    const subjectNets = Object.entries(subjectNetStats)
      .filter(([, value]) => value.avgNet != null)
      .map(([code, value]) => ({ code, avgNet: value.avgNet }));
    if (subjectNets.length >= 2) {
      const best = subjectNets.reduce((a, b) => (a.avgNet > b.avgNet ? a : b));
      for (const entry of subjectNets) {
        if (entry.code === best.code) continue;
        const gapNet = Math.round((best.avgNet - entry.avgNet) * 100) / 100;
        if (gapNet >= 8) {
          flags.push({
            kind: 'subject',
            flagType: FLAG_TYPES.relative,
            subject_code: entry.code,
            topicLabel: null,
            sectionLabel: null,
            unitId: null,
            unitTitle: subjectByCode(entry.code)?.label ?? entry.code,
            successRate: null,
            gapNet,
            examCount: subjectNetStats[entry.code]?.count ?? 0,
            score: gapNet * 3 * flagTypeWeight(FLAG_TYPES.relative, tier),
            suggestedAction: suggestGapAction({
              flagType: FLAG_TYPES.relative,
              subjectCode: entry.code,
            }),
          });
        }
      }
    }
  }

  for (const unit of unitRollup) {
    if (!unit.unitId) continue;
    const atlasRow = atlasUnits.find((row) => row.unitId === unit.unitId);
    const denemeWeak = (unit.successRate ?? 100) < practiceThreshold && (unit.attempts ?? 0) >= GAP_MIN_ATTEMPTS;
    const atlasWeak =
      atlasRow &&
      (atlasRow.totalQuestions ?? 0) >= GAP_MIN_ATTEMPTS &&
      (atlasRow.successRate ?? 100) < practiceThreshold;
    const atlasOnly =
      atlasRow &&
      (atlasRow.sessions ?? 0) >= 2 &&
      (atlasRow.successRate ?? 100) < (TIER_THRESHOLDS[tier]?.atlasOnly ?? practiceThreshold) &&
      !denemeWeak;

    if (!denemeWeak && !atlasOnly) continue;
    if (denemeWeak && !atlasWeak && tier === 'A') continue;

    const missed = missedByUnitId.get(unit.unitId);
    flags.push({
      kind: 'practice',
      flagType: FLAG_TYPES.practice,
      topicLabel: null,
      sectionLabel: null,
      unitId: unit.unitId,
      unitTitle: unit.unitTitle,
      subject_code: unit.subject_code,
      successRate: unit.successRate,
      attempts: unit.attempts,
      examCount: unit.topics?.length ?? 0,
      atlasSuccessRate: atlasRow?.successRate ?? null,
      atlasQuestions: atlasRow?.totalQuestions ?? null,
      missedDays: missed?.absentCount ?? 0,
      score:
        (100 - (unit.successRate ?? 100)) * 0.6 * flagTypeWeight(FLAG_TYPES.practice, tier) +
        (atlasWeak ? 15 : 0),
      suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.practice, unitRow: atlasRow }),
    });
  }

  if (sortedSessions.length >= 1) {
    const lastSession = sortedSessions[sortedSessions.length - 1];
    for (const topic of aggregatedTopics) {
      if ((topic.attempts ?? 0) < GAP_MIN_ATTEMPTS) continue;
      if ((topic.successRate ?? 0) < CARELESS_MIN_LIFETIME_RATE) continue;
      const recentRate = topicSuccessInSession(lastSession, topic.subject_code, topic.topicLabel);
      if (recentRate == null || recentRate > CARELESS_LAST_SESSION_MAX_RATE) continue;
      const lastRow = (lastSession.topics ?? []).find(
        (row) => row.subject_code === topic.subject_code && row.topicLabel === topic.topicLabel
      );
      if ((lastRow?.attempts ?? 0) < 2) continue;

      const mapping = mapTopicToCurriculum(topic.topicLabel, units, topic.subject_code);
      flags.push({
        ...buildTopicFlagBase(topic, mapping, null, null),
        flagType: FLAG_TYPES.careless,
        lifetimeRate: topic.successRate,
        recentRate,
        score: (topic.successRate - recentRate) * flagTypeWeight(FLAG_TYPES.careless, tier),
        suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.careless }),
      });
    }
  }

  for (const flag of missedByUnitId.values()) {
    flags.push({
      kind: 'attendance',
      flagType: FLAG_TYPES.attendance,
      topicLabel: null,
      sectionLabel: null,
      unitId: flag.unitId,
      unitTitle: flag.unitTitle,
      subject_code: null,
      successRate: null,
      attempts: 0,
      examCount: 0,
      missedDays: flag.absentCount,
      score: (30 + flag.absentCount * 5) * flagTypeWeight(FLAG_TYPES.attendance, tier),
      suggestedAction: suggestGapAction({ flagType: FLAG_TYPES.attendance, missedUnit: flag }),
    });
  }

  const deduped = dedupeFlags(flags);
  const enriched = deduped
    .map((row) => ({
      ...row,
      flagTypeLabel: flagTypeLabel(row.flagType),
      flagReason: explainGapReason(row),
    }))
    .sort((a, b) => b.score - a.score);

  const growthTarget = computeGrowthTarget({
    tierInfo,
    trajectory,
    progressSeries,
    subjectNetStats,
  });

  return {
    studentId,
    tier: tierInfo,
    trajectory,
    trajectoryLabel: TRAJECTORY_LABELS[trajectory] ?? TRAJECTORY_LABELS.flat,
    growthTarget,
    priorities: enriched.slice(0, PRIORITY_TOP_N),
    allFlags: enriched,
    allTopics: aggregatedTopics,
    unitRollup,
    atlasUnits,
  };
}

export function groupErrorReportByTopic(errorItems = []) {
  const buckets = new Map();
  for (const item of errorItems) {
    const label = item.topicLabel ?? 'Diğer';
    const bucket = buckets.get(label) ?? { topicLabel: label, wrong: 0, blank: 0, items: [] };
    if (item.status === 'blank') bucket.blank += 1;
    else bucket.wrong += 1;
    bucket.items.push(item);
    buckets.set(label, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.wrong + b.blank - (a.wrong + a.blank));
}

export function buildStudentTopicAnalysisForSessions({ sessions, questionsBySession, answers, studentId }) {
  const rowsBySession = (sessions ?? []).map((session) => {
    const questions = questionsBySession.get(session.id) ?? [];
    const sessionAnswers = (answers ?? []).filter((row) => row.session_id === session.id);
    return buildStudentTopicAnalysis({ questions, answers: sessionAnswers, studentId });
  });
  return aggregateTopicStatsAcrossExams(rowsBySession);
}

export function enrichUnitsWithSubject(units = [], subjects = []) {
  const subjectById = Object.fromEntries(subjects.map((row) => [row.id, row]));
  return units.map((unit) => ({
    ...unit,
    subject_slug: subjectById[unit.subject_id]?.slug ?? null,
    curriculum_subjects: subjectById[unit.subject_id] ?? null,
  }));
}

export { buildErrorReport, LGS_SUBJECTS, subjectByCode };
