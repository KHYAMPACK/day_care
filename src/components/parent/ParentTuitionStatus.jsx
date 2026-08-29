import { useCallback, useEffect, useState } from 'react';
import {
  formatCurrency,
  formatTuitionDueDate,
  formatTuitionPeriodTr,
  loadParentTuitionStatus,
  TUITION_STATUS_LABELS,
} from '../../lib/tuitionBilling';
import { InlineError } from '../dashboardUi';
import { IconWell } from '../ui/Icon';

function statusChipClass(status) {
  if (status === 'paid') return 'tuition-chip--mint';
  if (status === 'overdue') return 'tuition-chip--peach';
  return 'tuition-chip--sky';
}

export default function ParentTuitionStatus({ parentId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!parentId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await loadParentTuitionStatus(parentId);
      setRows(data);
    } catch (loadError) {
      if (/accounting_tuition_cycles/i.test(loadError.message ?? '')) {
        setRows([]);
        setError(null);
      } else {
        setError(loadError);
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return null;
  if (error) return <InlineError error={error} context="general" />;
  if (!rows.length) return null;

  return (
    <section className="dash-card tuition-parent-card">
      <div className="tuition-parent-card__head">
        <IconWell name="chart" variant="mint" />
        <div>
          <h2 className="dash-section-title">Ödeme durumu</h2>
          <p className="dash-hint">Güncel dönem ödeme bilgileri (bilgilendirme amaçlıdır).</p>
        </div>
      </div>

      <ul className="tuition-parent-list">
        {rows.map((row) => {
          const studentName = row.students?.full_name ?? 'Öğrenci';
          return (
            <li key={row.id} className="tuition-parent-item">
              <div>
                <strong>{studentName}</strong>
                <p className="tuition-parent-item__meta">
                  {formatTuitionPeriodTr(row.period_start, row.period_end)}
                </p>
                <p className="tuition-parent-item__meta">
                  Vade: {formatTuitionDueDate(row.due_date)} · {formatCurrency(row.amount)}
                </p>
              </div>
              <span className={`tuition-chip ${statusChipClass(row.status)}`}>
                {TUITION_STATUS_LABELS[row.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
