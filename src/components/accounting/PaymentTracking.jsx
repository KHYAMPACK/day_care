import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso } from '../../lib/calendar';
import {
  computeCycleForDate,
  ensureCurrentCycle,
  formatCurrency,
  formatTuitionDueDate,
  formatTuitionPeriodTr,
  loadSchoolStudents,
  loadStudentBilling,
  loadTuitionCycles,
  markCyclePaid,
  saveStudentBilling,
  TUITION_STATUS_LABELS,
  isTuitionSchemaMissing,
  tuitionSchemaMissingError,
} from '../../lib/tuitionBilling';
import { getDemoStudentBilling, getDemoTuitionCycles, isTuitionEmpty } from '../../lib/accountingDemoData';
import { formatClassLabel } from '../../lib/curriculum';
import { InlineError } from '../dashboardUi';
import { AnimatedCard } from '../ui/AnimatedCard';
import { AsyncActionDialog } from '../ui/AsyncActionDialog';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { recordSchoolActivity } from '../../lib/activityLog';

function statusChipClass(status) {
  if (status === 'paid') return 'tuition-chip--mint';
  if (status === 'overdue') return 'tuition-chip--peach';
  return 'tuition-chip--sky';
}

function matchesPersonSearch(query, ...fields) {
  const normalized = query.trim().toLocaleLowerCase('tr');
  if (!normalized) return true;
  return fields.some((field) =>
    String(field ?? '')
      .toLocaleLowerCase('tr')
      .includes(normalized)
  );
}

function getStudentClassLabel(student) {
  const klass = student.classes;
  if (!klass) return '';
  return formatClassLabel(klass.grade, klass.name);
}

function getCycleClassLabel(row) {
  const klass = row.students?.classes;
  if (!klass) return '';
  return formatClassLabel(klass.grade, klass.name);
}

function historyGroupSortRank(periods) {
  return periods.some((period) => period.status === 'pending' || period.status === 'overdue') ? 0 : 1;
}

function getHistorySummaryBadges(periods) {
  const overdue = periods.filter((period) => period.status === 'overdue').length;
  const pending = periods.filter((period) => period.status === 'pending').length;
  const paid = periods.filter((period) => period.status === 'paid').length;
  const badges = [];

  if (overdue > 0) badges.push({ status: 'overdue', label: `${overdue} gecikmiş` });
  if (pending > 0) badges.push({ status: 'pending', label: `${pending} bekliyor` });
  if (badges.length === 0 && paid > 0 && paid === periods.length) {
    badges.push({ status: 'paid', label: TUITION_STATUS_LABELS.paid });
  }

  return badges.slice(0, 3);
}

function hasSavedBilling(billingRow, draft) {
  if (!billingRow?.id) return false;
  const amount = Number(draft?.monthly_amount ?? billingRow.monthly_amount);
  return Number.isFinite(amount) && amount > 0 && Boolean(draft?.billing_start_date ?? billingRow.billing_start_date);
}

function isBillingDraftValid(draft) {
  const amount = Number(draft?.monthly_amount);
  return Boolean(draft?.billing_start_date) && Number.isFinite(amount) && amount > 0;
}

function getBillingDraftErrors(draft) {
  const errors = {};
  if (!draft?.billing_start_date) {
    errors.billing_start_date = 'Kayıt tarihi gerekli.';
  }
  const rawAmount = String(draft?.monthly_amount ?? '').trim();
  if (!rawAmount) {
    errors.monthly_amount = 'Aylık tutar gerekli.';
  } else {
    const amount = Number(draft.monthly_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.monthly_amount = 'Geçerli bir tutar girin.';
    }
  }
  return errors;
}

function draftIsDirty(draft, billingRow) {
  if (!billingRow?.id) {
    return Boolean(String(draft?.monthly_amount ?? '').trim() && draft?.billing_start_date);
  }
  return (
    String(draft?.monthly_amount ?? '') !== String(billingRow.monthly_amount ?? '') ||
    (draft?.billing_start_date ?? '') !== (billingRow.billing_start_date ?? '')
  );
}

function TuitionStudentCard({
  student,
  draft,
  billingRow,
  preview,
  currentCycle,
  planSaved,
  canMarkPaid,
  isDemo,
  schemaMissing,
  onSave,
  onMarkPaid,
}) {
  const [fieldErrors, setFieldErrors] = useState({});
  const dirty = draftIsDirty(draft, billingRow);
  const saveReady = isBillingDraftValid(draft);
  const awaitingPayment = planSaved && canMarkPaid && !dirty;

  function handleFieldChange(patch) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) {
        delete next[key];
      }
      return next;
    });
    draft.onChange(patch);
  }

  function handleSaveClick() {
    const errors = getBillingDraftErrors(draft);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSave();
  }

  return (
    <article
      className={`tuition-student-card${awaitingPayment ? ' tuition-student-card--awaiting-payment' : ''}${
        currentCycle?.status === 'paid' ? ' tuition-student-card--paid' : ''
      }`}
    >
      <div className="tuition-student-card__head">
        <strong className="tuition-student-card__name">{student.full_name}</strong>
        {currentCycle ? (
          <span className={`tuition-chip ${statusChipClass(currentCycle.status)}`}>
            {TUITION_STATUS_LABELS[currentCycle.status]}
          </span>
        ) : planSaved ? (
          <span className="dash-hint">Dönem oluşturuluyor…</span>
        ) : (
          <span className="accounting-table__meta">Plan kaydedilmedi</span>
        )}
      </div>

      <div className="tuition-student-card__fields">
        <label className="dash-label">
          Kayıt tarihi
          <input
            className={`dash-input${fieldErrors.billing_start_date ? ' dash-input--invalid' : ''}`}
            type="date"
            value={draft.billing_start_date ?? ''}
            onChange={(event) => handleFieldChange({ billing_start_date: event.target.value })}
            aria-invalid={Boolean(fieldErrors.billing_start_date)}
          />
          {fieldErrors.billing_start_date ? (
            <p className="dash-field-error">{fieldErrors.billing_start_date}</p>
          ) : null}
        </label>
        <label className="dash-label">
          Aylık tutar (₺)
          <input
            className={`dash-input${fieldErrors.monthly_amount ? ' dash-input--invalid' : ''}`}
            type="number"
            min="0.01"
            step="0.01"
            value={draft.monthly_amount}
            onChange={(event) => handleFieldChange({ monthly_amount: event.target.value })}
            aria-invalid={Boolean(fieldErrors.monthly_amount)}
          />
          {fieldErrors.monthly_amount ? (
            <p className="dash-field-error">{fieldErrors.monthly_amount}</p>
          ) : null}
        </label>
      </div>

      <div className="tuition-student-card__period">
        {preview ? (
          <>
            <span>{formatTuitionPeriodTr(preview.periodStart, preview.periodEnd)}</span>
            <span className="accounting-table__meta">
              Vade: {formatTuitionDueDate(preview.dueDate)}
              {currentCycle ? ` · ${formatCurrency(currentCycle.amount)}` : ''}
            </span>
          </>
        ) : (
          <span className="accounting-table__meta">Kayıt tarihi ve tutar girin</span>
        )}
      </div>

      <div className="tuition-student-card__actions">
        {(dirty || !planSaved) && !isDemo && !schemaMissing ? (
          <button type="button" className="demo-btn demo-btn--ghost" onClick={handleSaveClick}>
            Kaydet
          </button>
        ) : null}

        {canMarkPaid ? (
          <button
            type="button"
            className={`tuition-pay-btn${awaitingPayment ? ' tuition-pay-btn--prominent' : ''}`}
            onClick={onMarkPaid}
          >
            <span className="tuition-pay-btn__label">Ödendi</span>
            {currentCycle ? (
              <span className="tuition-pay-btn__amount">{formatCurrency(currentCycle.amount)}</span>
            ) : null}
          </button>
        ) : null}

        {!planSaved && !isDemo && !Object.keys(fieldErrors).length ? (
          <p className="accounting-table__meta tuition-student-card__hint">
            {saveReady ? 'Kaydet ile planı oluşturun' : 'Kayıt tarihi ve aylık tutarı girip Kaydet\'e basın'}
          </p>
        ) : null}

        {awaitingPayment ? (
          <p className="accounting-table__meta tuition-student-card__hint tuition-student-card__hint--success">
            Plan kaydedildi — ödeme alındığında işaretleyin
          </p>
        ) : null}
      </div>
    </article>
  );
}

function TuitionHistoryStudentGroup({ group }) {
  const { studentName, classLabel, periods } = group;
  const allPaid = periods.every((period) => period.status === 'paid');
  const badges = getHistorySummaryBadges(periods);

  return (
    <li>
      <details
        className={`tuition-history-student${allPaid ? ' tuition-history-student--all-paid' : ''}`}
      >
        <summary className="tuition-history-student__summary">
          <span className="tuition-history-student__chevron" aria-hidden="true" />
          <span className="tuition-history-student__summary-main">
            <strong className="tuition-history-student__name">{studentName}</strong>
            <span className="accounting-table__meta tuition-history-student__meta">
              {classLabel ? `${classLabel} · ` : ''}
              {periods.length} dönem
            </span>
          </span>
          <span className="tuition-history-student__badges">
            {badges.map((badge) => (
              <span key={badge.label} className={`tuition-chip ${statusChipClass(badge.status)}`}>
                {badge.label}
              </span>
            ))}
          </span>
        </summary>

        <ul className="tuition-history-student__periods">
          {periods.map((row) => (
            <li key={row.id} className="tuition-history-item tuition-history-item--readonly">
              <div className="tuition-history-item__main">
                <strong>{formatTuitionPeriodTr(row.period_start, row.period_end)}</strong>
                <span className="accounting-table__meta">
                  Vade: {formatTuitionDueDate(row.due_date)} · {formatCurrency(row.amount)}
                </span>
              </div>
              <div className="tuition-history-item__aside">
                <span className={`tuition-chip ${statusChipClass(row.status)}`}>
                  {TUITION_STATUS_LABELS[row.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export default function PaymentTracking({ schoolId, profile, isDemo: parentDemo, onRefresh }) {
  const today = istanbulDateIso();
  const { asyncAction, closeAsyncAction, runAsyncAction, showAsyncError } = useAsyncAction();
  const [students, setStudents] = useState([]);
  const [billing, setBilling] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  const [drafts, setDrafts] = useState({});

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const studentRows = await loadSchoolStudents(schoolId);
      setStudents(studentRows);

      let billingRows = [];
      try {
        billingRows = await loadStudentBilling(schoolId);
        setSchemaMissing(false);
      } catch (loadError) {
        if (isTuitionSchemaMissing(loadError)) {
          setSchemaMissing(true);
          setIsDemo(false);
          setBilling([]);
          setCycles([]);
          setDrafts(
            Object.fromEntries(
              studentRows.map((student) => [
                student.id,
                {
                  monthly_amount: '',
                  billing_start_date: today,
                  is_active: true,
                },
              ])
            )
          );
          setError(tuitionSchemaMissingError());
          return;
        }
        throw loadError;
      }

      if (isTuitionEmpty({ billing: billingRows }) && studentRows.length === 0) {
        setIsDemo(true);
        setBilling(getDemoStudentBilling());
        setCycles(getDemoTuitionCycles());
        setDrafts({});
        return;
      }

      setIsDemo(false);
      setBilling(billingRows);

      const activeBilling = billingRows.filter((row) => row.is_active);
      await Promise.all(
        activeBilling.map((row) => ensureCurrentCycle(schoolId, row, today))
      );

      const cycleRows = await loadTuitionCycles(schoolId).catch((loadError) => {
        if (isTuitionSchemaMissing(loadError)) throw tuitionSchemaMissingError();
        throw loadError;
      });
      setCycles(cycleRows);

      const nextDrafts = {};
      for (const student of studentRows) {
        const existing = billingRows.find((row) => row.student_id === student.id);
        nextDrafts[student.id] = {
          id: existing?.id,
          monthly_amount: existing?.monthly_amount ?? '',
          billing_start_date: existing?.billing_start_date ?? today,
          is_active: existing?.is_active !== false,
        };
      }
      setDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, today]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const billingByStudent = useMemo(
    () => Object.fromEntries(billing.map((row) => [row.student_id, row])),
    [billing]
  );

  const currentCycleByStudent = useMemo(() => {
    const map = new Map();
    for (const row of cycles) {
      const existing = map.get(row.student_id);
      if (!existing || row.due_date > existing.due_date) {
        map.set(row.student_id, row);
      }
    }
    return map;
  }, [cycles]);

  const sortedStudents = useMemo(() => {
    function paymentSortRank(studentId) {
      const cycle = currentCycleByStudent.get(studentId);
      if (cycle?.status === 'paid') return 2;

      const billingRow = billingByStudent[studentId];
      const draft = drafts[studentId] ?? {};
      if (hasSavedBilling(billingRow, draft)) return 0;

      return 1;
    }

    return [...students].sort((a, b) => {
      const rankDiff = paymentSortRank(a.id) - paymentSortRank(b.id);
      if (rankDiff !== 0) return rankDiff;
      return a.full_name.localeCompare(b.full_name, 'tr');
    });
  }, [students, currentCycleByStudent, billingByStudent, drafts]);

  const visibleStudents = useMemo(() => {
    return sortedStudents.filter((student) =>
      matchesPersonSearch(studentSearchQuery, student.full_name, getStudentClassLabel(student))
    );
  }, [sortedStudents, studentSearchQuery]);

  const filteredCycles = useMemo(() => {
    const rows = [...cycles];
    if (!statusFilter) return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [cycles, statusFilter]);

  const visibleCycles = useMemo(() => {
    return filteredCycles.filter((row) =>
      matchesPersonSearch(studentSearchQuery, row.students?.full_name ?? '')
    );
  }, [filteredCycles, studentSearchQuery]);

  const historyGroups = useMemo(() => {
    const groupsMap = new Map();

    for (const row of visibleCycles) {
      const studentId = row.student_id ?? row.students?.id ?? row.students?.full_name ?? 'unknown';
      const existing = groupsMap.get(studentId);

      if (existing) {
        existing.periods.push(row);
        continue;
      }

      groupsMap.set(studentId, {
        studentId,
        studentName: row.students?.full_name ?? 'Öğrenci',
        classLabel: getCycleClassLabel(row),
        periods: [row],
      });
    }

    return [...groupsMap.values()]
      .map((group) => ({
        ...group,
        periods: [...group.periods].sort((a, b) => b.due_date.localeCompare(a.due_date)),
      }))
      .sort((a, b) => {
        const rankDiff = historyGroupSortRank(a.periods) - historyGroupSortRank(b.periods);
        if (rankDiff !== 0) return rankDiff;
        return a.studentName.localeCompare(b.studentName, 'tr');
      });
  }, [visibleCycles]);

  const hasActiveSearch = Boolean(studentSearchQuery.trim());

  function updateDraft(studentId, patch) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], ...patch },
    }));
  }

  function requestSaveBilling(student) {
    if (schemaMissing) {
      setError(tuitionSchemaMissingError());
      return;
    }
    if (isDemo || parentDemo) {
      setError(new Error('Demo modunda kayıt yapılamaz.'));
      return;
    }

    const draft = drafts[student.id] ?? {};
    const name = student.full_name;

    if (!draft.billing_start_date) {
      showAsyncError({
        title: 'Ödeme planı kaydedilemedi',
        message: 'Kayıt tarihi gerekli.',
      });
      return;
    }

    const amount = Number(draft.monthly_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showAsyncError({
        title: 'Ödeme planı kaydedilemedi',
        message: 'Geçerli bir aylık tutar girin.',
      });
      return;
    }

    runAsyncAction({
      title: 'Ödeme planı kaydet',
      loadingLabel: 'Kaydediliyor…',
      successMessage: `${name} için ödeme planı kaydedildi.`,
      skipConfirm: true,
      runFn: async () => {
        const saved = await saveStudentBilling(schoolId, {
          id: draft.id,
          student_id: student.id,
          monthly_amount: draft.monthly_amount,
          billing_start_date: draft.billing_start_date,
          is_active: draft.is_active,
        });
        if (saved.is_active) {
          await ensureCurrentCycle(schoolId, saved, today);
        }
        return saved;
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'accounting',
          action: 'saved',
          summary: `${name} için ödeme planı kaydedildi`,
        });
        await refresh();
        await onRefresh?.();
      },
    });
  }

  function requestMarkPaid(cycle, studentName) {
    if (isDemo || parentDemo || !cycle) return;

    runAsyncAction({
      title: 'Ödeme alındı',
      message: `${studentName} için ${formatCurrency(cycle.amount)} tutarındaki ödeme alındı olarak işaretlensin mi? Veliye bildirim gönderilmez.`,
      confirmLabel: 'Ödendi',
      loadingLabel: 'Kaydediliyor…',
      successMessage: `${studentName} için ödeme alındı olarak işaretlendi. Veli uygulamada durumu görebilir; bildirim gönderilmedi.`,
      runFn: () => markCyclePaid(schoolId, cycle.id, profile?.id),
      onSuccess: () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'accounting',
          action: 'marked_paid',
          summary: `Ödeme alındı: ${studentName} · ${formatCurrency(cycle.amount)}`,
        });
        refresh();
      },
    });
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Ödeme takibi yükleniyor…</p>
      </section>
    );
  }

  return (
    <div className="demo-stack">
      <AnimatedCard index={0} className="dash-card">
        <h2 className="dash-section-title">Öğrenci ödeme planları</h2>
        <p className="dash-hint">
          Her öğrenci için kayıt tarihi ve aylık tutarı belirleyin, kaydedin, ardından ödeme alındığında
          <strong> Ödendi</strong> ile işaretleyin.
        </p>

        {schemaMissing ? (
          <InlineError error={tuitionSchemaMissingError()} context="general" />
        ) : null}

        {students.length > 0 ? (
          <div className="tuition-search-toolbar">
            <input
              className="dash-input manage-list-search tuition-search-toolbar__input"
              type="search"
              value={studentSearchQuery}
              onChange={(event) => setStudentSearchQuery(event.target.value)}
              placeholder="Öğrenci veya şube ara…"
              aria-label="Öğrenci veya şube ara"
            />
            {hasActiveSearch ? (
              <span className="tuition-search-toolbar__count">
                {visibleStudents.length}/{students.length}
              </span>
            ) : null}
          </div>
        ) : null}

        {students.length === 0 ? (
          <p className="dash-hint">Kayıtlı öğrenci yok.</p>
        ) : visibleStudents.length === 0 ? (
          <p className="dash-hint">Aramanızla eşleşen öğrenci bulunamadı.</p>
        ) : (
          <ul className="tuition-student-list">
            {visibleStudents.map((student) => {
              const draft = drafts[student.id] ?? {
                monthly_amount: '',
                billing_start_date: today,
                is_active: true,
              };
              const billingRow = billingByStudent[student.id];
              const preview =
                draft.billing_start_date && draft.monthly_amount
                  ? computeCycleForDate(draft.billing_start_date, today)
                  : null;
              const currentCycle = currentCycleByStudent.get(student.id);
              const planSaved = hasSavedBilling(billingRow, draft);
              const canMarkPaid =
                planSaved && currentCycle && currentCycle.status !== 'paid' && !isDemo && !parentDemo;

              return (
                <li key={student.id}>
                  <TuitionStudentCard
                    student={student}
                    draft={{
                      ...draft,
                      onChange: (patch) => updateDraft(student.id, patch),
                    }}
                    billingRow={billingRow}
                    preview={preview}
                    currentCycle={currentCycle}
                    planSaved={planSaved}
                    canMarkPaid={canMarkPaid}
                    isDemo={isDemo}
                    schemaMissing={schemaMissing}
                    onSave={() => requestSaveBilling(student)}
                    onMarkPaid={() => requestMarkPaid(currentCycle, student.full_name)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </AnimatedCard>

      <AnimatedCard index={1} className="dash-card accounting-history-card">
        <details className="accounting-history accounting-history--readonly">
          <summary className="accounting-history__summary">
            <span className="accounting-history__chevron" aria-hidden="true" />
            <span className="accounting-history__summary-text">
              <span className="dash-section-title">Ödeme geçmişi</span>
              <span className="dash-hint">Tüm öğrencilerin aylık dönem kayıtları · yalnızca görüntüleme</span>
            </span>
          </summary>

          <p className="accounting-history__intro dash-hint">
            Üstteki kartlardan güncel ödeme planını yönetirsiniz. Burada ise öğrenciye tıklayarak dönem dönem
            geçmişi görüntüleyebilir ve duruma göre filtreleyebilirsiniz. Ödeme işaretleme yalnızca üstteki
            kartlardan yapılır.
          </p>

          <div className="accounting-panel__head accounting-history__filters">
            <select
              className="dash-input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Durum filtresi"
            >
              <option value="">Tüm durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="paid">Ödendi</option>
              <option value="overdue">Gecikmiş</option>
            </select>
            {historyGroups.length > 0 ? (
              <span className="accounting-history__count">
                {historyGroups.length} öğrenci · {visibleCycles.length} dönem
              </span>
            ) : null}
          </div>

          {hasActiveSearch ? (
            <p className="accounting-history__search-hint dash-hint">
              Arama: yalnızca eşleşen öğrencilerin dönemleri gösteriliyor.
            </p>
          ) : null}

          {cycles.length === 0 ? (
            <p className="dash-hint">Henüz dönem kaydı yok. Öğrenci planı kaydedildiğinde burada görünür.</p>
          ) : visibleCycles.length === 0 ? (
            <p className="dash-hint">
              {hasActiveSearch || statusFilter
                ? 'Seçili arama veya filtreye uygun dönem kaydı bulunamadı.'
                : 'Kayıt bulunamadı.'}
            </p>
          ) : (
            <ul className="tuition-history-student-list">
              {historyGroups.map((group) => (
                <TuitionHistoryStudentGroup key={group.studentId} group={group} />
              ))}
            </ul>
          )}
        </details>
      </AnimatedCard>

      <AsyncActionDialog
        open={Boolean(asyncAction)}
        phase={asyncAction?.phase ?? 'confirm'}
        title={asyncAction?.title}
        message={asyncAction?.message}
        confirmLabel={asyncAction?.confirmLabel}
        loadingLabel={asyncAction?.loadingLabel}
        successTitle={asyncAction?.successTitle}
        errorTitle={asyncAction?.errorTitle}
        credentials={asyncAction?.credentials}
        error={asyncAction?.error}
        errorContext="accounting"
        onConfirm={asyncAction?.onConfirm}
        onClose={closeAsyncAction}
      />

      {error && <InlineError error={error} context="accounting" />}
    </div>
  );
}
