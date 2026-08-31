import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  academicWeekIndex,
  formatWeekRangeTr,
  loadCurriculumSubjects,
  plannedUnitForWeek,
} from '../../lib/curriculum';
import { loadCurriculumUnitsWithSections } from '../../lib/studentGapsData';
import { currentAcademicYear } from '../../lib/homework';
import { LGS_SUBJECTS, subjectByCode } from '../../lib/lgsExam';
import { isDemoCounselorStudentId } from '../../lib/studentGapDemoData';
import { flagTypeLabel } from '../../lib/studentGaps';
import {
  COMPLETION_STATUSES,
  copyGuidanceWeekFromPrevious,
  emptyQuestionRow,
  emptyScheduleBlock,
  loadDemoGuidancePack,
  loadGuidanceWeekPack,
  loadTopicResourceMatrix,
  saveDemoGuidancePack,
  saveGuidanceWeekPack,
  upsertTopicResourceCell,
  deleteTopicResourceColumn,
} from '../../lib/counselorGuidance';
import {
  applyQuestionRowCountChange,
  buildQuestionRowWarnings,
  buildQuestionTrackingHints,
  buildScheduleHints,
  buildTopicMatrixRows,
  matrixCellHint,
  parseGuidanceCount,
  rowHasTarget,
  sanitizeQuestionRow,
} from '../../lib/guidanceHints';

const SCHEDULE_DAYS = [
  { id: 1, label: 'PAZARTESİ' },
  { id: 2, label: 'SALI' },
  { id: 3, label: 'ÇARŞAMBA' },
  { id: 4, label: 'PERŞEMBE' },
  { id: 5, label: 'CUMA' },
  { id: 6, label: 'CUMARTESİ' },
];

const MATRIX_STATUS = [
  { value: 'not_started', label: 'Boş', symbol: '' },
  { value: 'in_progress', label: 'Devam', symbol: '▣' },
  { value: 'done', label: 'Tamam', symbol: '✓' },
];

const AUTOSAVE_DELAY_MS = 900;
const SAVED_STATUS_MS = 2500;

const SAVE_STATUS_LABEL = {
  idle: 'Otomatik kayıt açık',
  pending: 'Kaydedilecek…',
  saving: 'Kaydediliyor…',
  saved: 'Kaydedildi',
  error: 'Kaydedilemedi',
};

function slotsFromBlocks(blocks = []) {
  const map = new Map();
  for (const block of blocks) {
    const key = `${block.start_time}|${block.end_time}`;
    if (!map.has(key)) {
      map.set(key, { start_time: block.start_time, end_time: block.end_time });
    }
  }
  const slots = [...map.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!slots.length) {
    return [{ start_time: '13:30', end_time: '14:30' }];
  }
  return slots;
}

function parseTimeMinutes(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTimeMinutes(totalMinutes) {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeTimeValue(raw, fallback = '13:30') {
  return formatTimeMinutes(parseTimeMinutes(raw) ?? parseTimeMinutes(fallback) ?? 810);
}

function slotDurationMinutes(slot) {
  const start = parseTimeMinutes(slot.start_time);
  const end = parseTimeMinutes(slot.end_time);
  if (start == null || end == null) return 60;
  const duration = end - start;
  return duration > 0 ? duration : 60;
}

function nextSlotAfter(previousSlot) {
  const lastEnd = parseTimeMinutes(previousSlot?.end_time) ?? parseTimeMinutes('14:30');
  const duration = slotDurationMinutes(previousSlot);
  const start = lastEnd ?? 870;
  return {
    start_time: formatTimeMinutes(start),
    end_time: formatTimeMinutes(start + duration),
  };
}

function XlSheet({
  number,
  title,
  subtitle,
  children,
  legend = null,
  variant = 'sky',
  onExportPdf,
  exportingPdf = false,
}) {
  function handlePdfClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onExportPdf?.();
  }

  return (
    <details className={`xl-sheet xl-sheet--${variant} xl-sheet--collapsible`}>
      <summary className="xl-sheet__summary">
        <span className="xl-sheet__chevron" aria-hidden="true" />
        <div className="xl-sheet__banner">
          <span className="xl-sheet__number">Çizelge {number}</span>
          <h3 className="xl-sheet__title">{title}</h3>
        </div>
        {onExportPdf ? (
          <button
            type="button"
            className="demo-btn demo-btn--ghost xl-sheet__pdf-btn"
            disabled={exportingPdf}
            onClick={handlePdfClick}
          >
            {exportingPdf ? 'PDF…' : 'PDF indir'}
          </button>
        ) : null}
      </summary>
      <div className="xl-sheet__inner">
        {subtitle ? <p className="xl-sheet__subtitle">{subtitle}</p> : null}
        {legend ? <div className="xl-sheet__legend">{legend}</div> : null}
        <div className="xl-sheet__body">{children}</div>
      </div>
    </details>
  );
}

function XlHintBox({ title, hints, onAdd, addLabel = 'Tabloya ekle' }) {
  if (!hints?.length) return null;
  return (
    <details className="xl-hint-box">
      <summary>{title} ({hints.length} öneri — tıklayınca açılır)</summary>
      <ul className="xl-hint-box__list">
        {hints.map((hint, index) => (
          <li key={index}>
            <span>{hint.reason ?? hint.label ?? hint.topic_label}</span>
            <button type="button" className="xl-hint-box__btn" onClick={() => onAdd(hint, index)}>
              {addLabel}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function CounselorGuidancePanel({ dossier, schoolId }) {
  const { profile, school } = useAuth();
  const student = dossier?.student;
  const gapProfile = dossier?.gapProfile;
  const isDemo = isDemoCounselorStudentId(student?.id);

  const [weekIndex, setWeekIndex] = useState(() => Math.max(1, academicWeekIndex()));
  const [academicYear] = useState(() => currentAcademicYear());
  const [notes, setNotes] = useState('');
  const [questionRows, setQuestionRows] = useState([]);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [scheduleSlots, setScheduleSlots] = useState([{ start_time: '13:30', end_time: '14:30' }]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [error, setError] = useState(null);

  const skipAutosaveRef = useRef(true);
  const autosaveTimerRef = useRef(null);
  const savedFadeTimerRef = useRef(null);
  const saveRequestIdRef = useRef(0);

  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [matrixSubjectId, setMatrixSubjectId] = useState('');
  const [matrixCells, setMatrixCells] = useState([]);
  const [matrixResources, setMatrixResources] = useState([]);
  const [newResourceName, setNewResourceName] = useState('');
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(null);

  const demoStorageKey = student?.id ? `guidance-demo-${student.id}` : null;

  const weekOptions = useMemo(() => {
    const current = Math.max(1, academicWeekIndex());
    return Array.from({ length: current }, (_, index) => index + 1);
  }, []);

  const questionHints = useMemo(
    () =>
      buildQuestionTrackingHints({
        gapProfile,
        atlasUnits: dossier?.atlasUnits,
        exams: dossier?.exams,
        weekIndex,
      }),
    [gapProfile, dossier?.atlasUnits, dossier?.exams, weekIndex]
  );

  const scheduleHints = useMemo(() => {
    const gradeSubjects = subjects.filter((s) => s.grade === student?.grade);
    const firstSubject = gradeSubjects[0];
    const planned = firstSubject
      ? plannedUnitForWeek({
          units: units.filter((u) => u.subject_id === firstSubject.id),
          weekIndex,
        })
      : null;
    return buildScheduleHints({ gapProfile, plannedUnit: planned });
  }, [gapProfile, student?.grade, subjects, units, weekIndex]);

  const rowWarnings = useMemo(() => buildQuestionRowWarnings(questionRows), [questionRows]);

  const matrixSubject = subjects.find((row) => row.id === matrixSubjectId);

  const matrixRows = useMemo(
    () =>
      buildTopicMatrixRows({
        units,
        subjectId: matrixSubjectId,
        subjectSlug: matrixSubject?.slug ?? LGS_SUBJECTS[0]?.code,
        grade: student?.grade,
        gapProfile,
      }),
    [units, matrixSubjectId, matrixSubject?.slug, student?.grade, gapProfile]
  );

  const cellMap = useMemo(() => {
    const map = new Map();
    for (const cell of matrixCells) {
      map.set(`${cell.topic_key}::${cell.resource_name}`, cell);
    }
    return map;
  }, [matrixCells]);

  const loadWeekData = useCallback(async () => {
    if (!student?.id) return;
    skipAutosaveRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setLoading(true);
    setError(null);
    setSaveStatus('idle');
    try {
      if (isDemo && demoStorageKey) {
        const pack =
          loadDemoGuidancePack(demoStorageKey) ??
          ({ notes: '', questionRows: [], scheduleBlocks: [] });
        setNotes(pack.notes ?? '');
        setQuestionRows(
          (pack.questionRows?.length ? pack.questionRows : [emptyQuestionRow()]).map(sanitizeQuestionRow)
        );
        const blocks = pack.scheduleBlocks?.length ? pack.scheduleBlocks : [];
        setScheduleBlocks(blocks.length ? blocks : [emptyScheduleBlock()]);
        setScheduleSlots(slotsFromBlocks(blocks));
        return;
      }

      if (!schoolId) return;
      const pack = await loadGuidanceWeekPack({
        schoolId,
        studentId: student.id,
        weekIndex,
        academicYear,
      });
      setNotes(pack.week?.notes ?? '');
      setQuestionRows(
        (pack.questionRows.length ? pack.questionRows : [emptyQuestionRow()]).map(sanitizeQuestionRow)
      );
      const blocks = pack.scheduleBlocks.length ? pack.scheduleBlocks : [emptyScheduleBlock()];
      setScheduleBlocks(blocks);
      setScheduleSlots(slotsFromBlocks(blocks));
    } catch (loadError) {
      setError(loadError.message ?? 'Rehberlik planı yüklenemedi.');
    } finally {
      setLoading(false);
      window.setTimeout(() => {
        skipAutosaveRef.current = false;
      }, 0);
    }
  }, [student?.id, isDemo, demoStorageKey, schoolId, weekIndex, academicYear]);

  const loadMatrixData = useCallback(async () => {
    if (!student?.id || !matrixSubjectId) return;
    setMatrixLoading(true);
    try {
      if (isDemo && demoStorageKey) {
        const pack = loadDemoGuidancePack(demoStorageKey);
        const demoCells = (pack?.matrixCells ?? []).filter((c) => c.subject_id === matrixSubjectId);
        setMatrixCells(demoCells);
        setMatrixResources([...new Set(demoCells.map((c) => c.resource_name))]);
        return;
      }
      const cells = await loadTopicResourceMatrix({
        studentId: student.id,
        subjectId: matrixSubjectId,
      });
      setMatrixCells(cells);
      setMatrixResources([...new Set(cells.map((c) => c.resource_name))]);
    } catch (loadError) {
      setError(loadError.message ?? 'Matris yüklenemedi.');
    } finally {
      setMatrixLoading(false);
    }
  }, [student?.id, matrixSubjectId, isDemo, demoStorageKey]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subjectRows, unitRows] = await Promise.all([
          loadCurriculumSubjects(),
          loadCurriculumUnitsWithSections(),
        ]);
        if (cancelled) return;
        setSubjects(subjectRows);
        setUnits(unitRows);
        const gradeSubjects = subjectRows.filter((row) => row.grade === student?.grade);
        const lgsMatch = gradeSubjects.find((row) =>
          LGS_SUBJECTS.some((def) => def.code === row.slug)
        );
        setMatrixSubjectId(lgsMatch?.id ?? gradeSubjects[0]?.id ?? '');
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student?.grade]);

  useEffect(() => {
    loadMatrixData();
  }, [loadMatrixData]);

  const persistWeekPack = useCallback(async () => {
    if (!student?.id) return;
    if (!isDemo && !schoolId) return;

    const requestId = ++saveRequestIdRef.current;
    setSaveStatus('saving');
    setError(null);

    try {
      if (isDemo && demoStorageKey) {
        const existing = loadDemoGuidancePack(demoStorageKey) ?? {};
        saveDemoGuidancePack(demoStorageKey, {
          ...existing,
          notes,
          questionRows,
          scheduleBlocks,
        });
      } else {
        await saveGuidanceWeekPack({
          schoolId,
          studentId: student.id,
          weekIndex,
          academicYear,
          notes,
          questionRows,
          scheduleBlocks,
          updatedBy: profile?.id ?? null,
        });
      }

      if (requestId !== saveRequestIdRef.current) return;

      setSaveStatus('saved');
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
      savedFadeTimerRef.current = window.setTimeout(() => {
        setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
      }, SAVED_STATUS_MS);
    } catch (saveError) {
      if (requestId !== saveRequestIdRef.current) return;
      setSaveStatus('error');
      setError(saveError.message ?? 'Kaydedilemedi.');
    }
  }, [
    student?.id,
    isDemo,
    demoStorageKey,
    schoolId,
    weekIndex,
    academicYear,
    notes,
    questionRows,
    scheduleBlocks,
    profile?.id,
  ]);

  useEffect(() => {
    if (skipAutosaveRef.current || loading || !student?.id) return;
    if (!isDemo && !schoolId) return;

    setSaveStatus((current) => (current === 'saving' ? current : 'pending'));

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistWeekPack();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    notes,
    questionRows,
    scheduleBlocks,
    loading,
    student?.id,
    isDemo,
    schoolId,
    persistWeekPack,
  ]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
    },
    []
  );

  async function handleCopyPreviousWeek() {
    if (weekIndex <= 1) return;
    skipAutosaveRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaveStatus('saving');
    try {
      if (isDemo && demoStorageKey) {
        setError('Örnek veride kopyalama sınırlı.');
        setSaveStatus('idle');
        return;
      }
      await copyGuidanceWeekFromPrevious({
        schoolId,
        studentId: student.id,
        weekIndex,
        academicYear,
        updatedBy: profile?.id ?? null,
      });
      await loadWeekData();
      setSaveStatus('saved');
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
      savedFadeTimerRef.current = window.setTimeout(() => {
        setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
      }, SAVED_STATUS_MS);
    } catch (copyError) {
      setSaveStatus('error');
      setError(copyError.message ?? 'Kopyalanamadı.');
      skipAutosaveRef.current = false;
    }
  }

  function findScheduleBlock(slot, dayId) {
    return scheduleBlocks.find(
      (b) =>
        b.day_of_week === dayId &&
        b.start_time === slot.start_time &&
        b.end_time === slot.end_time
    );
  }

  function updateScheduleCell(slot, dayId, patch) {
    setScheduleBlocks((prev) => {
      const idx = prev.findIndex(
        (b) =>
          b.day_of_week === dayId &&
          b.start_time === slot.start_time &&
          b.end_time === slot.end_time
      );
      const existing = idx >= 0 ? prev[idx] : null;
      const merged = {
        ...emptyScheduleBlock(),
        ...existing,
        day_of_week: dayId,
        start_time: slot.start_time,
        end_time: slot.end_time,
        ...patch,
      };
      const empty = !merged.label?.trim() && !merged.is_done;
      if (empty) {
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      }
      if (idx >= 0) {
        return prev.map((row, i) => (i === idx ? merged : row));
      }
      return [...prev, merged];
    });
  }

  function updateScheduleSlotDraft(slotIndex, field, value) {
    setScheduleSlots((rows) =>
      rows.map((row, i) => (i === slotIndex ? { ...row, [field]: value } : row))
    );
  }

  function commitScheduleSlotTime(slotIndex, field) {
    const slot = scheduleSlots[slotIndex];
    if (!slot) return;
    const normalized = normalizeTimeValue(
      slot[field],
      field === 'start_time' ? '13:30' : slot.start_time
    );
    if (normalized === slot[field]) return;

    const old = { ...slot };
    const next = { ...slot, [field]: normalized };
    if (field === 'start_time') {
      const startMins = parseTimeMinutes(normalized);
      const endMins = parseTimeMinutes(slot.end_time);
      if (startMins != null && (endMins == null || endMins <= startMins)) {
        next.end_time = formatTimeMinutes(startMins + slotDurationMinutes(slot));
      }
    } else {
      const startMins = parseTimeMinutes(next.start_time);
      const endMins = parseTimeMinutes(normalized);
      if (startMins != null && endMins != null && endMins <= startMins) {
        next.end_time = formatTimeMinutes(startMins + 60);
      }
    }

    setScheduleSlots((rows) => rows.map((row, i) => (i === slotIndex ? next : row)));
    setScheduleBlocks((prev) =>
      prev.map((block) => {
        if (block.start_time !== old.start_time || block.end_time !== old.end_time) {
          return block;
        }
        return {
          ...block,
          start_time: next.start_time,
          end_time: next.end_time,
        };
      })
    );
  }

  function addScheduleSlotRow() {
    setScheduleSlots((rows) => [...rows, nextSlotAfter(rows[rows.length - 1])]);
  }

  async function handleMatrixCellChange(topicRow, resourceName, nextStatus) {
    if (!student?.id || !matrixSubjectId) return;
    try {
      if (isDemo && demoStorageKey) {
        const existing = loadDemoGuidancePack(demoStorageKey) ?? {};
        const others = (existing.matrixCells ?? matrixCells).filter(
          (c) =>
            !(
              c.subject_id === matrixSubjectId &&
              c.topic_key === topicRow.topicKey &&
              c.resource_name === resourceName
            )
        );
        const updated = [
          ...others,
          {
            subject_id: matrixSubjectId,
            topic_key: topicRow.topicKey,
            topic_label: topicRow.topicLabel,
            resource_name: resourceName,
            status: nextStatus,
          },
        ];
        setMatrixCells(updated.filter((c) => c.subject_id === matrixSubjectId));
        saveDemoGuidancePack(demoStorageKey, { ...existing, matrixCells: updated });
        setSaveStatus('saved');
        if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
        savedFadeTimerRef.current = window.setTimeout(() => {
          setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
        }, SAVED_STATUS_MS);
        return;
      }
      setSaveStatus('saving');
      const cell = await upsertTopicResourceCell({
        schoolId,
        studentId: student.id,
        subjectId: matrixSubjectId,
        topicKey: topicRow.topicKey,
        topicLabel: topicRow.topicLabel,
        resourceName,
        status: nextStatus,
        updatedBy: profile?.id ?? null,
      });
      setMatrixCells((current) => {
        const filtered = current.filter(
          (row) => !(row.topic_key === cell.topic_key && row.resource_name === cell.resource_name)
        );
        return [...filtered, cell];
      });
      setSaveStatus('saved');
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
      savedFadeTimerRef.current = window.setTimeout(() => {
        setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
      }, SAVED_STATUS_MS);
    } catch (cellError) {
      setSaveStatus('error');
      setError(cellError.message ?? 'Hücre güncellenemedi.');
    }
  }

  function updateQuestionRow(index, patch) {
    setQuestionRows((rows) => rows.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateQuestionRowCount(index, field, rawValue) {
    setQuestionRows((rows) =>
      rows.map((item, i) =>
        i === index ? applyQuestionRowCountChange(item, field, rawValue) : item
      )
    );
  }

  async function handleExportPdf(sheet = 'all') {
    if (!student?.id) return;
    setExportingPdf(sheet);
    setError(null);
    try {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        await persistWeekPack();
      } else if (saveStatus === 'pending') {
        await persistWeekPack();
      }

      const { buildGuidancePdfModel, buildGuidancePdfFilename, buildGuidanceSheetPdfFilename } =
        await import('../../lib/counselorGuidance/pdf/buildGuidancePdfModel.js');
      const { downloadGuidancePdf } = await import('../../lib/counselorGuidance/pdf/downloadGuidancePdf.js');

      const model = buildGuidancePdfModel({
        student,
        weekIndex,
        weekRangeLabel: formatWeekRangeTr(weekIndex),
        academicYear,
        notes,
        questionRows,
        matrixSubjectName: matrixSubject?.name ?? '',
        matrixRows,
        matrixResources,
        matrixCells,
        scheduleSlots,
        scheduleBlocks,
        schoolName: school?.name ?? '',
      });

      model.filename =
        sheet === 'all'
          ? buildGuidancePdfFilename(student.full_name, weekIndex)
          : buildGuidanceSheetPdfFilename(student.full_name, weekIndex, sheet);

      await downloadGuidancePdf(model, sheet);
    } catch (exportError) {
      setError(exportError.message ?? 'PDF oluşturulamadı.');
    } finally {
      setExportingPdf(null);
    }
  }

  function cycleResourceStatus(current) {
    const order = MATRIX_STATUS.map((s) => s.value);
    const index = order.indexOf(current ?? 'not_started');
    return order[(index + 1) % order.length];
  }

  if (!student) {
    return <p className="dash-hint">Öğrenci seçilmedi.</p>;
  }

  return (
    <div className="xl-workbook">
      <header className="xl-workbook__toolbar">
        <div className="xl-workbook__meta">
          <label htmlFor="guidance-week-select">
            <strong>Hafta:</strong>
          </label>
          <select
            id="guidance-week-select"
            className="xl-workbook__select"
            value={weekIndex}
            onChange={(event) => setWeekIndex(Number(event.target.value))}
          >
            {weekOptions.map((week) => (
              <option key={week} value={week}>
                {week}. hafta ({formatWeekRangeTr(week)})
              </option>
            ))}
          </select>
          <span className="xl-workbook__meta-sep">|</span>
          <span>
            <strong>Öğrenci:</strong> {student.full_name}
          </span>
          <span className="xl-workbook__meta-sep">|</span>
          <span
            className={`xl-workbook__save-status xl-workbook__save-status--${saveStatus}`}
            aria-live="polite"
          >
            {SAVE_STATUS_LABEL[saveStatus] ?? SAVE_STATUS_LABEL.idle}
          </span>
        </div>
        <div className="xl-workbook__actions">
          <button
            type="button"
            className="demo-btn demo-btn--ghost"
            disabled={Boolean(exportingPdf) || loading}
            onClick={() => handleExportPdf('all')}
          >
            {exportingPdf === 'all' ? 'PDF hazırlanıyor…' : 'Tümünü PDF indir'}
          </button>
          <button
            type="button"
            className="demo-btn demo-btn--ghost"
            disabled={saveStatus === 'saving' || Boolean(exportingPdf)}
            onClick={handleCopyPreviousWeek}
          >
            Önceki haftayı kopyala
          </button>
        </div>
      </header>

      {error ? <p className="xl-workbook__error">{error}</p> : null}
      {loading ? <p className="dash-hint">Yükleniyor…</p> : null}

      {/* Çizelge 1 — Soru Takip */}
      <XlSheet
        number={1}
        variant="sky"
        title="SORU TAKİP"
        onExportPdf={() => handleExportPdf('questions')}
        exportingPdf={exportingPdf === 'questions'}
        subtitle="Her satır = bir ders/konu hedefi. Rehber hedef soru sayısını yazar; öğrenci/veli çözülen ve D/Y/B girer."
        legend={
          <>
            <span>
              <strong>Ders / Konu / Kaynak:</strong> ne çalışılacak
            </span>
            <span>
              <strong>Çözülecek:</strong> hedef soru sayısı
            </span>
            <span>
              <strong>Önce hedef:</strong> çözülecek soru girilmeden diğer alanlar kilitli
            </span>
            <span>
              <strong>Çözülen ≤ hedef;</strong> D+Y+B ≤ çözülen
            </span>
          </>
        }
      >
        <XlHintBox
          title="Atlas önerileri (eksik analizinden)"
          hints={questionHints}
          onAdd={(hint) =>
            setQuestionRows((rows) => [
              ...rows,
              sanitizeQuestionRow({
                ...emptyQuestionRow(rows.length),
                subject_code: hint.subject_code ?? '',
                topic_label: hint.topic_label ?? '',
                source_name: hint.source_name ?? '',
                target_count: hint.target_count ?? '',
                solved_count: hint.readOnlyActuals ? hint.solved_count ?? '' : '',
                correct_count: hint.readOnlyActuals ? hint.correct_count ?? '' : '',
                wrong_count: hint.readOnlyActuals ? hint.wrong_count ?? '' : '',
                blank_count: hint.readOnlyActuals ? hint.blank_count ?? '' : '',
                completion_status: hint.readOnlyActuals ? 'partial' : 'not_done',
              }),
            ])
          }
        />

        {rowWarnings.length ? (
          <div className="xl-workbook__warn">
            {rowWarnings.map((w, i) => (
              <p key={i}>
                {w.topic}: {w.message}
              </p>
            ))}
          </div>
        ) : null}

        <div className="xl-table-wrap">
          <table className="xl-table">
            <thead>
              <tr>
                <th className="xl-table__row-num">#</th>
                <th>DERS</th>
                <th>KONU</th>
                <th>SORU KAYNAĞI</th>
                <th className="xl-table__num">ÇÖZÜLECEK SORU</th>
                <th className="xl-table__num">ÇÖZÜLEN SORU</th>
                <th className="xl-table__num">DOĞRU</th>
                <th className="xl-table__num">YANLIŞ</th>
                <th className="xl-table__num">BOŞ</th>
                <th>DURUM</th>
                <th className="xl-table__action" />
              </tr>
            </thead>
            <tbody>
              {questionRows.map((row, index) => {
                const targetSet = rowHasTarget(row);
                const targetMax = parseGuidanceCount(row.target_count);
                const solvedMax = parseGuidanceCount(row.solved_count);
                const actualsLocked = !targetSet;
                const dybLocked = actualsLocked || solvedMax == null || solvedMax <= 0;
                const correct = parseGuidanceCount(row.correct_count) ?? 0;
                const wrong = parseGuidanceCount(row.wrong_count) ?? 0;
                const blank = parseGuidanceCount(row.blank_count) ?? 0;

                return (
                <tr key={row.id ?? `q-${index}`}>
                  <td className="xl-table__row-num">{index + 1}</td>
                  <td>
                    <select
                      className="xl-cell"
                      value={row.subject_code ?? ''}
                      onChange={(e) => updateQuestionRow(index, { subject_code: e.target.value })}
                    >
                      <option value="">Seçin</option>
                      {LGS_SUBJECTS.map((def) => (
                        <option key={def.code} value={def.code}>
                          {def.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="xl-cell"
                      value={row.topic_label ?? ''}
                      placeholder="Örn. Paragraf"
                      onChange={(e) => updateQuestionRow(index, { topic_label: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="xl-cell"
                      value={row.source_name ?? ''}
                      placeholder="Örn. 3D YAYINLARI"
                      onChange={(e) => updateQuestionRow(index, { source_name: e.target.value })}
                    />
                  </td>
                  <td className="xl-table__num">
                    <input
                      type="number"
                      min="1"
                      className="xl-cell xl-cell--num"
                      value={row.target_count ?? ''}
                      placeholder="Hedef"
                      onChange={(e) => updateQuestionRowCount(index, 'target_count', e.target.value)}
                    />
                  </td>
                  <td className="xl-table__num">
                    <input
                      type="number"
                      min="0"
                      max={targetMax ?? undefined}
                      className={`xl-cell xl-cell--num${actualsLocked ? ' xl-cell--locked' : ''}`}
                      value={row.solved_count ?? ''}
                      disabled={actualsLocked}
                      title={actualsLocked ? 'Önce çözülecek soru sayısını girin' : undefined}
                      placeholder={actualsLocked ? '—' : '0'}
                      onChange={(e) => updateQuestionRowCount(index, 'solved_count', e.target.value)}
                    />
                  </td>
                  <td className="xl-table__num">
                    <input
                      type="number"
                      min="0"
                      max={solvedMax ?? undefined}
                      className={`xl-cell xl-cell--num${dybLocked ? ' xl-cell--locked' : ''}`}
                      value={row.correct_count ?? ''}
                      disabled={dybLocked}
                      title={
                        actualsLocked
                          ? 'Önce çözülecek soru sayısını girin'
                          : dybLocked
                            ? 'Önce çözülen soru sayısını girin'
                            : undefined
                      }
                      placeholder={dybLocked ? '—' : '0'}
                      onChange={(e) => updateQuestionRowCount(index, 'correct_count', e.target.value)}
                    />
                  </td>
                  <td className="xl-table__num">
                    <input
                      type="number"
                      min="0"
                      max={solvedMax != null ? Math.max(0, solvedMax - correct - blank) : undefined}
                      className={`xl-cell xl-cell--num${dybLocked ? ' xl-cell--locked' : ''}`}
                      value={row.wrong_count ?? ''}
                      disabled={dybLocked}
                      title={
                        actualsLocked
                          ? 'Önce çözülecek soru sayısını girin'
                          : dybLocked
                            ? 'Önce çözülen soru sayısını girin'
                            : undefined
                      }
                      placeholder={dybLocked ? '—' : '0'}
                      onChange={(e) => updateQuestionRowCount(index, 'wrong_count', e.target.value)}
                    />
                  </td>
                  <td className="xl-table__num">
                    <input
                      type="number"
                      min="0"
                      max={solvedMax != null ? Math.max(0, solvedMax - correct - wrong) : undefined}
                      className={`xl-cell xl-cell--num${dybLocked ? ' xl-cell--locked' : ''}`}
                      value={row.blank_count ?? ''}
                      disabled={dybLocked}
                      title={
                        actualsLocked
                          ? 'Önce çözülecek soru sayısını girin'
                          : dybLocked
                            ? 'Önce çözülen soru sayısını girin'
                            : undefined
                      }
                      placeholder={dybLocked ? '—' : '0'}
                      onChange={(e) => updateQuestionRowCount(index, 'blank_count', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className={`xl-cell${actualsLocked ? ' xl-cell--locked' : ''}`}
                      value={row.completion_status ?? 'not_done'}
                      disabled={actualsLocked}
                      title={actualsLocked ? 'Önce çözülecek soru sayısını girin' : undefined}
                      onChange={(e) => updateQuestionRow(index, { completion_status: e.target.value })}
                    >
                      {COMPLETION_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="xl-table__action">
                    <button
                      type="button"
                      className="xl-table__del"
                      onClick={() => setQuestionRows((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="demo-btn"
          onClick={() => setQuestionRows((rows) => [...rows, emptyQuestionRow(rows.length)])}
        >
          + Satır ekle
        </button>
        <label className="xl-notes">
          <strong>Hafta notu (rehber):</strong>
          <textarea
            className="xl-cell xl-notes__area"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bu hafta için genel not…"
          />
        </label>
      </XlSheet>

      {/* Çizelge 2 — Konu / Kaynak */}
      <XlSheet
        number={2}
        variant="lavender"
        title="KONU / KAYNAK TAKİP"
        onExportPdf={() => handleExportPdf('matrix')}
        exportingPdf={exportingPdf === 'matrix'}
        subtitle="Satırlar = müfredat konuları. Sütunlar = soru bankası / kaynak kitap. Hücreye tıklayarak durumu değiştirin."
        legend={
          <>
            {MATRIX_STATUS.map((s) => (
              <span key={s.value}>
                <strong>{s.label}:</strong> {s.symbol || 'boş hücre'}
              </span>
            ))}
            <span>
              <strong>Turuncu satır:</strong> Atlas eksik analizi öncelikli konu
            </span>
          </>
        }
      >
        <div className="xl-matrix-bar">
          <label>
            <strong>Ders:</strong>
            <select
              className="xl-workbook__select"
              value={matrixSubjectId}
              onChange={(e) => setMatrixSubjectId(e.target.value)}
            >
              {subjects
                .filter((row) => row.grade === student.grade)
                .filter((row) => LGS_SUBJECTS.some((def) => def.code === row.slug))
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="xl-matrix-bar__add">
            <strong>Yeni kaynak sütunu:</strong>
            <input
              className="xl-cell"
              placeholder="NARTEST SB"
              value={newResourceName}
              onChange={(e) => setNewResourceName(e.target.value)}
            />
            <button
              type="button"
              className="demo-btn"
              onClick={() => {
                const name = newResourceName.trim();
                if (!name || matrixResources.includes(name)) return;
                setMatrixResources((list) => [...list, name]);
                setNewResourceName('');
              }}
            >
              Sütun ekle
            </button>
          </label>
        </div>

        {matrixLoading ? <p className="dash-hint">Yükleniyor…</p> : null}

        {!matrixResources.length ? (
          <p className="xl-sheet__empty">
            Henüz kaynak sütunu yok. Yukarıdan yayınevi / soru bankası adı ekleyin (ör. NARTEST SB).
          </p>
        ) : (
          <div className="xl-table-wrap">
            <table className="xl-table xl-table--matrix">
              <thead>
                <tr>
                  <th className="xl-table__corner">KONU ↓ / KAYNAK →</th>
                  {matrixResources.map((resource) => (
                    <th key={resource} className="xl-table__resource">
                      <span>{resource}</span>
                      <button
                        type="button"
                        className="xl-table__del-col"
                        onClick={async () => {
                          if (!student?.id || !matrixSubjectId) return;
                          try {
                            if (!isDemo) {
                              await deleteTopicResourceColumn({
                                studentId: student.id,
                                subjectId: matrixSubjectId,
                                resourceName: resource,
                              });
                            } else if (demoStorageKey) {
                              const existing = loadDemoGuidancePack(demoStorageKey) ?? {};
                              const updated = (existing.matrixCells ?? []).filter(
                                (c) =>
                                  !(c.subject_id === matrixSubjectId && c.resource_name === resource)
                              );
                              saveDemoGuidancePack(demoStorageKey, {
                                ...existing,
                                matrixCells: updated,
                              });
                            }
                            setMatrixResources((list) => list.filter((item) => item !== resource));
                            setMatrixCells((cells) =>
                              cells.filter((c) => c.resource_name !== resource)
                            );
                          } catch (err) {
                            setError(err.message);
                          }
                        }}
                      >
                        ×
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((topicRow) => (
                  <tr
                    key={topicRow.topicKey}
                    className={topicRow.isPriority ? 'xl-table__row--priority' : ''}
                  >
                    <th className="xl-table__topic">
                      <div>{topicRow.topicLabel}</div>
                      {topicRow.unitTitle ? (
                        <small>{topicRow.unitTitle}</small>
                      ) : null}
                      {topicRow.successRate != null ? (
                        <small>Deneme: %{topicRow.successRate}</small>
                      ) : null}
                      {topicRow.isPriority && topicRow.flagType ? (
                        <small className="xl-table__flag">{flagTypeLabel(topicRow.flagType)}</small>
                      ) : null}
                    </th>
                    {matrixResources.map((resource) => {
                      const cell = cellMap.get(`${topicRow.topicKey}::${resource}`);
                      const status = cell?.status ?? 'not_started';
                      const meta = MATRIX_STATUS.find((s) => s.value === status);
                      return (
                        <td key={resource} className="xl-table__matrix-cell">
                          <button
                            type="button"
                            className={`xl-matrix-cell xl-matrix-cell--${status}`}
                            title={matrixCellHint(
                              topicRow,
                              dossier?.atlasUnits,
                              gapProfile?.unitRollup
                            )}
                            onClick={() =>
                              handleMatrixCellChange(
                                topicRow,
                                resource,
                                cycleResourceStatus(status)
                              )
                            }
                          >
                            {meta?.symbol}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </XlSheet>

      {/* Çizelge 3 — Haftalık Program */}
      <XlSheet
        number={3}
        variant="mint"
        title="HAFTALIK ÇALIŞMA PROGRAMI"
        onExportPdf={() => handleExportPdf('schedule')}
        exportingPdf={exportingPdf === 'schedule'}
        subtitle="Satırlar = saat aralığı (ör. 13:30–14:30). Sütunlar = günler. Her hücreye o saatte yapılacak işi yazın; kutucuk = tamamlandı."
      >
        <XlHintBox
          title="Atlas önerileri (program satırı)"
          hints={scheduleHints}
          addLabel="Programa ekle"
          onAdd={(hint) => {
            const slotKey = `${hint.start_time}|${hint.end_time}`;
            setScheduleSlots((slots) => {
              if (slots.some((s) => `${s.start_time}|${s.end_time}` === slotKey)) return slots;
              return [...slots, { start_time: hint.start_time, end_time: hint.end_time }].sort(
                (a, b) => a.start_time.localeCompare(b.start_time)
              );
            });
            updateScheduleCell(
              { start_time: hint.start_time, end_time: hint.end_time },
              hint.day_of_week,
              { label: hint.label, subject_code: hint.subject_code ?? '' }
            );
          }}
        />

        <div className="xl-table-wrap">
          <table className="xl-table xl-table--schedule">
            <thead>
              <tr>
                <th className="xl-table__time-col">SAAT ARALIĞI</th>
                {SCHEDULE_DAYS.map((day) => (
                  <th key={day.id}>{day.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scheduleSlots.map((slot, slotIndex) => (
                <tr key={`${slot.start_time}-${slot.end_time}-${slotIndex}`}>
                  <th className="xl-table__time-col">
                    <div className="xl-time-range">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="xl-cell xl-cell--time"
                        value={slot.start_time}
                        placeholder="13:30"
                        aria-label="Başlangıç saati"
                        onChange={(e) =>
                          updateScheduleSlotDraft(slotIndex, 'start_time', e.target.value)
                        }
                        onBlur={() => commitScheduleSlotTime(slotIndex, 'start_time')}
                      />
                      <span className="xl-table__time-sep">–</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="xl-cell xl-cell--time"
                        value={slot.end_time}
                        placeholder="14:30"
                        aria-label="Bitiş saati"
                        onChange={(e) =>
                          updateScheduleSlotDraft(slotIndex, 'end_time', e.target.value)
                        }
                        onBlur={() => commitScheduleSlotTime(slotIndex, 'end_time')}
                      />
                    </div>
                  </th>
                  {SCHEDULE_DAYS.map((day) => {
                    const block = findScheduleBlock(slot, day.id);
                    return (
                      <td key={day.id} className="xl-table__schedule-cell">
                        <input
                          className="xl-cell"
                          placeholder="Ne çalışılacak?"
                          value={block?.label ?? ''}
                          onChange={(e) =>
                            updateScheduleCell(slot, day.id, { label: e.target.value })
                          }
                        />
                        <label className="xl-schedule-check">
                          <input
                            type="checkbox"
                            checked={Boolean(block?.is_done)}
                            onChange={(e) =>
                              updateScheduleCell(slot, day.id, { is_done: e.target.checked })
                            }
                          />
                          Tamam
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="xl-schedule-actions">
          <button type="button" className="xl-workbook__btn" onClick={addScheduleSlotRow}>
            + Saat satırı ekle
          </button>
          <button
            type="button"
            className="demo-btn"
            onClick={() => setScheduleSlots([{ start_time: '13:30', end_time: '14:30' }])}
          >
            Satırları sıfırla
          </button>
        </div>
      </XlSheet>
    </div>
  );
}
