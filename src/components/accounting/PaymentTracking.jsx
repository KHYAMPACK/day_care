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
} from '../../lib/tuitionBilling';
import { getDemoStudentBilling, getDemoTuitionCycles, isTuitionEmpty } from '../../lib/accountingDemoData';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { AnimatedCard } from '../ui/AnimatedCard';

function statusChipClass(status) {
  if (status === 'paid') return 'tuition-chip--mint';
  if (status === 'overdue') return 'tuition-chip--peach';
  return 'tuition-chip--sky';
}

export default function PaymentTracking({ schoolId, profile, isDemo: parentDemo, onRefresh }) {
  const today = istanbulDateIso();
  const [students, setStudents] = useState([]);
  const [billing, setBilling] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingStudentId, setSavingStudentId] = useState(null);
  const [payingCycleId, setPayingCycleId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const [drafts, setDrafts] = useState({});

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const [studentRows, billingRows] = await Promise.all([
        loadSchoolStudents(schoolId),
        loadStudentBilling(schoolId).catch((loadError) => {
          if (/accounting_student_billing/i.test(loadError.message ?? '')) return [];
          throw loadError;
        }),
      ]);

      setStudents(studentRows);

      if (isTuitionEmpty({ billing: billingRows }) && !billingRows.length) {
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

      const cycleRows = await loadTuitionCycles(schoolId);
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

  const filteredCycles = useMemo(() => {
    const rows = [...cycles];
    if (!statusFilter) return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [cycles, statusFilter]);

  async function handleSaveBilling(studentId) {
    if (isDemo || parentDemo) {
      setError(new Error('Demo modunda kayıt yapılamaz.'));
      return;
    }

    const draft = drafts[studentId] ?? {};
    setSavingStudentId(studentId);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveStudentBilling(schoolId, {
        id: draft.id,
        student_id: studentId,
        monthly_amount: draft.monthly_amount,
        billing_start_date: draft.billing_start_date,
        is_active: draft.is_active,
      });
      if (saved.is_active) {
        await ensureCurrentCycle(schoolId, saved, today);
      }
      setSuccess('Ödeme planı kaydedildi.');
      await refresh();
      await onRefresh?.();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSavingStudentId(null);
    }
  }

  async function handleMarkPaid(cycleId) {
    if (isDemo || parentDemo) return;
    setPayingCycleId(cycleId);
    setError(null);
    setSuccess(null);
    try {
      await markCyclePaid(schoolId, cycleId, profile?.id);
      setSuccess('Ödeme alındı olarak işaretlendi.');
      await refresh();
    } catch (payError) {
      setError(payError);
    } finally {
      setPayingCycleId(null);
    }
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
          Her öğrenci için aylık tutar ve başlangıç tarihi belirleyin. Dönem, başlangıç gününe göre
          otomatik hesaplanır (ör. 15 Eylül → 15 Ekim vadesi).
        </p>

        {students.length === 0 ? (
          <p className="dash-hint">Kayıtlı öğrenci yok.</p>
        ) : (
          <div className="accounting-table-wrap">
            <table className="accounting-table accounting-table--billing">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Aylık tutar (₺)</th>
                  <th>Başlangıç</th>
                  <th>Güncel dönem</th>
                  <th>Aktif</th>
                  <th aria-label="Kaydet" />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
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

                  return (
                    <tr key={student.id}>
                      <td>
                        <strong>{student.full_name}</strong>
                        {currentCycle && (
                          <span className={`tuition-chip ${statusChipClass(currentCycle.status)}`}>
                            {TUITION_STATUS_LABELS[currentCycle.status]}
                          </span>
                        )}
                      </td>
                      <td>
                        <input
                          className="dash-input dash-input--compact"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draft.monthly_amount}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [student.id]: { ...prev[student.id], monthly_amount: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="dash-input dash-input--compact"
                          type="date"
                          value={draft.billing_start_date ?? ''}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [student.id]: { ...prev[student.id], billing_start_date: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="tuition-period-cell">
                        {preview ? (
                          <>
                            <span>{formatTuitionPeriodTr(preview.periodStart, preview.periodEnd)}</span>
                            <span className="accounting-table__meta">
                              Vade: {formatTuitionDueDate(preview.dueDate)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={draft.is_active !== false}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [student.id]: { ...prev[student.id], is_active: event.target.checked },
                            }))
                          }
                          aria-label={`${student.full_name} ödeme planı aktif`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="demo-btn demo-btn--ghost demo-btn--sm"
                          disabled={savingStudentId === student.id || isDemo}
                          onClick={() => handleSaveBilling(student.id)}
                        >
                          {savingStudentId === student.id ? '…' : 'Kaydet'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedCard>

      <AnimatedCard index={1} className="dash-card">
        <div className="accounting-panel__head">
          <h2 className="dash-section-title">Dönem kayıtları</h2>
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
        </div>

        {filteredCycles.length === 0 ? (
          <p className="dash-hint">Kayıt bulunamadı.</p>
        ) : (
          <div className="accounting-table-wrap">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Dönem</th>
                  <th>Vade</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th aria-label="İşlem" />
                </tr>
              </thead>
              <tbody>
                {filteredCycles.map((row) => {
                  const studentName = row.students?.full_name ?? 'Öğrenci';
                  return (
                    <tr key={row.id}>
                      <td>{studentName}</td>
                      <td>{formatTuitionPeriodTr(row.period_start, row.period_end)}</td>
                      <td>{formatTuitionDueDate(row.due_date)}</td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td>
                        <span className={`tuition-chip ${statusChipClass(row.status)}`}>
                          {TUITION_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="accounting-table__actions">
                        {row.status !== 'paid' && !isDemo && (
                          <button
                            type="button"
                            className="demo-btn demo-btn--ghost demo-btn--sm"
                            disabled={payingCycleId === row.id}
                            onClick={() => handleMarkPaid(row.id)}
                          >
                            {payingCycleId === row.id ? '…' : 'Ödendi işaretle'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedCard>

      {success && <SuccessMessage message={success} />}
      {error && <InlineError error={error} />}
    </div>
  );
}
