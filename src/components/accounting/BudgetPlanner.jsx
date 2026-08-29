import { useEffect, useMemo, useState } from 'react';
import {
  buildFinanceSummary,
  formatCurrency,
  loadBudgetLines,
  loadBudgetPeriods,
  saveBudgetLine,
  saveBudgetPeriod,
} from '../../lib/accounting';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { AnimatedCard } from '../ui/AnimatedCard';

function defaultPeriodDates() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return {
    name: `${startYear}–${startYear + 1}`,
    start_date: `${startYear}-09-01`,
    end_date: `${startYear + 1}-06-30`,
  };
}

export default function BudgetPlanner({
  schoolId,
  categories,
  expenses,
  periods,
  budgetLines,
  activePeriod,
  isDemo,
  onRefresh,
  setPeriods,
  setBudgetLines,
}) {
  const defaults = defaultPeriodDates();
  const [periodForm, setPeriodForm] = useState({
    name: defaults.name,
    start_date: defaults.start_date,
    end_date: defaults.end_date,
    is_active: true,
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriod?.id ?? '');
  const [lineDrafts, setLineDrafts] = useState({});
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [savingLineId, setSavingLineId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selectedPeriod = useMemo(
    () => periods.find((row) => row.id === selectedPeriodId) ?? activePeriod ?? null,
    [periods, selectedPeriodId, activePeriod]
  );

  useEffect(() => {
    if (activePeriod?.id && !selectedPeriodId) {
      setSelectedPeriodId(activePeriod.id);
    }
  }, [activePeriod, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId || isDemo || !schoolId) return undefined;
    let cancelled = false;
    loadBudgetLines(schoolId, selectedPeriodId)
      .then((lines) => {
        if (cancelled) return;
        setBudgetLines((prev) => {
          const rest = prev.filter((row) => row.period_id !== selectedPeriodId);
          return [...rest, ...lines];
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedPeriodId, schoolId, isDemo, setBudgetLines]);

  useEffect(() => {
    const next = {};
    for (const category of categories) {
      const existing = budgetLines.find(
        (row) => row.period_id === selectedPeriodId && row.category_id === category.id
      );
      next[category.id] = {
        id: existing?.id,
        planned_amount: existing?.planned_amount ?? '',
        notes: existing?.notes ?? '',
      };
    }
    setLineDrafts(next);
  }, [categories, budgetLines, selectedPeriodId]);

  const summary = useMemo(
    () =>
      buildFinanceSummary({
        expenses,
        budgetLines: budgetLines.filter((row) => row.period_id === selectedPeriodId),
        categories,
        period: selectedPeriod,
      }),
    [expenses, budgetLines, categories, selectedPeriod, selectedPeriodId]
  );

  const actualByCategory = useMemo(
    () => Object.fromEntries(summary.byCategory.map((row) => [row.categoryId, row.actual])),
    [summary.byCategory]
  );

  async function reloadPeriodData(periodId) {
    if (onRefresh) {
      await onRefresh();
      return;
    }
    const periodRows = await loadBudgetPeriods(schoolId);
    setPeriods(periodRows);
    if (periodId) {
      const lines = await loadBudgetLines(schoolId, periodId);
      setBudgetLines(lines);
    }
  }

  async function handleSavePeriod(event) {
    event.preventDefault();
    if (isDemo) {
      setError(new Error('Demo modunda bütçe dönemi oluşturulamaz.'));
      return;
    }

    setSavingPeriod(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveBudgetPeriod(schoolId, periodForm);
      await reloadPeriodData(saved.id);
      setSelectedPeriodId(saved.id);
      setSuccess('Bütçe dönemi kaydedildi.');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSavingPeriod(false);
    }
  }

  async function handleSaveLine(categoryId) {
    if (!selectedPeriodId || isDemo) {
      setError(new Error('Önce bir bütçe dönemi seçin veya oluşturun.'));
      return;
    }

    const draft = lineDrafts[categoryId] ?? {};
    setSavingLineId(categoryId);
    setError(null);
    setSuccess(null);
    try {
      await saveBudgetLine(schoolId, {
        id: draft.id,
        period_id: selectedPeriodId,
        category_id: categoryId,
        planned_amount: draft.planned_amount,
        notes: draft.notes,
      });
      await reloadPeriodData(selectedPeriodId);
      setSuccess('Bütçe satırı kaydedildi.');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSavingLineId(null);
    }
  }

  return (
    <div className="demo-stack">
      <AnimatedCard index={0} className="dash-card">
        <h2 className="dash-section-title">Bütçe Dönemi</h2>
        <form className="dash-form accounting-form" onSubmit={handleSavePeriod}>
          <div className="accounting-form__grid">
            <label className="dash-field">
              <span className="dash-label">Dönem adı</span>
              <input
                className="dash-input"
                value={periodForm.name}
                onChange={(event) => setPeriodForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Başlangıç</span>
              <input
                className="dash-input"
                type="date"
                value={periodForm.start_date}
                onChange={(event) => setPeriodForm((prev) => ({ ...prev, start_date: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Bitiş</span>
              <input
                className="dash-input"
                type="date"
                value={periodForm.end_date}
                onChange={(event) => setPeriodForm((prev) => ({ ...prev, end_date: event.target.value }))}
                required
              />
            </label>
          </div>
          <label className="accounting-check">
            <input
              type="checkbox"
              checked={periodForm.is_active}
              onChange={(event) => setPeriodForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            Aktif dönem olarak işaretle
          </label>
          <div className="accounting-form__actions">
            <SendButton type="submit" loading={savingPeriod} disabled={savingPeriod}>
              Dönemi Kaydet
            </SendButton>
          </div>
        </form>
      </AnimatedCard>

      {periods.length > 0 && (
        <AnimatedCard index={1} className="dash-card">
          <h2 className="dash-section-title">Kategori Tahsisleri</h2>
          <label className="dash-field">
            <span className="dash-label">Dönem</span>
            <select
              className="dash-input"
              value={selectedPeriodId}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
            >
              {periods.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}{row.is_active ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="accounting-table-wrap">
            <table className="accounting-table accounting-table--budget">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Planlanan</th>
                  <th>Gerçekleşen</th>
                  <th>Not</th>
                  <th aria-label="Kaydet" />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const draft = lineDrafts[category.id] ?? { planned_amount: '', notes: '' };
                  const actual = actualByCategory[category.id] ?? 0;
                  return (
                    <tr key={category.id}>
                      <td>{category.name}</td>
                      <td>
                        <input
                          className="dash-input dash-input--compact"
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.planned_amount}
                          onChange={(event) =>
                            setLineDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...prev[category.id], planned_amount: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>{formatCurrency(actual)}</td>
                      <td>
                        <input
                          className="dash-input dash-input--compact"
                          value={draft.notes ?? ''}
                          onChange={(event) =>
                            setLineDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...prev[category.id], notes: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="demo-btn demo-btn--ghost demo-btn--sm"
                          disabled={savingLineId === category.id || isDemo}
                          onClick={() => handleSaveLine(category.id)}
                        >
                          {savingLineId === category.id ? '…' : 'Kaydet'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="dash-hint accounting-budget-summary">
            Toplam plan: {formatCurrency(summary.totalPlanned)} · Gerçekleşen: {formatCurrency(summary.totalSpent)}
          </p>
        </AnimatedCard>
      )}

      {success && <SuccessMessage message={success} />}
      {error && <InlineError error={error} />}
    </div>
  );
}
