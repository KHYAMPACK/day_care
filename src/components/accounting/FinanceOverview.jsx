import { useMemo } from 'react';
import ReportDonut from '../attendance/ReportDonut';
import AnimatedBarFill from '../attendance/AnimatedBarFill';
import { AnimatedCard } from '../ui/AnimatedCard';
import {
  buildFinanceSummary,
  donutSegmentsFromCategories,
  formatCurrency,
} from '../../lib/accounting';
import { summarizeTuitionCollected } from '../../lib/tuitionBilling';

function StatCard({ label, value, variant = 'lavender', sub }) {
  return (
    <div className={`accounting-stat accounting-stat--${variant}`}>
      <p className="accounting-stat__label">{label}</p>
      <p className="accounting-stat__value">{value}</p>
      {sub && <p className="accounting-stat__sub">{sub}</p>}
    </div>
  );
}

export default function FinanceOverview({
  expenses,
  budgetLines,
  categories,
  classes,
  activePeriod,
  tuitionCycles = [],
}) {
  const summary = useMemo(
    () =>
      buildFinanceSummary({
        expenses,
        budgetLines,
        categories,
        period: activePeriod,
        classes,
      }),
    [expenses, budgetLines, categories, activePeriod, classes]
  );

  const donutSegments = useMemo(
    () => donutSegmentsFromCategories(summary.byCategory),
    [summary.byCategory]
  );

  const maxCategoryActual = Math.max(...summary.byCategory.map((row) => row.actual), 1);
  const maxCategoryPlanned = Math.max(...summary.byCategory.map((row) => row.planned), 1);
  const barScale = Math.max(maxCategoryActual, maxCategoryPlanned, 1);

  const tuitionSummary = useMemo(() => summarizeTuitionCollected(tuitionCycles), [tuitionCycles]);

  const varianceLabel =
    summary.variance >= 0
      ? `${formatCurrency(summary.variance)} bütçe altında`
      : `${formatCurrency(Math.abs(summary.variance))} bütçe aşımı`;

  return (
    <div className="demo-stack">
      <section className="accounting-stats accounting-stats--four">
        <StatCard
          label="Toplam Harcama"
          value={formatCurrency(summary.totalSpent)}
          variant="sky"
          sub={activePeriod ? activePeriod.name : 'Tüm dönem'}
        />
        <StatCard
          label="Planlanan Bütçe"
          value={formatCurrency(summary.totalPlanned)}
          variant="mint"
        />
        <StatCard
          label="Tahsil edilen"
          value={formatCurrency(tuitionSummary.totalCollected)}
          variant="lavender"
          sub={`${tuitionSummary.paidCount} ödeme · ${tuitionSummary.overdueCount} gecikmiş`}
        />
        <StatCard
          label="Sapma"
          value={varianceLabel}
          variant={summary.variance >= 0 ? 'lavender' : 'peach'}
          sub={`${summary.expenseCount} gider kaydı`}
        />
      </section>

      <div className="accounting-grid">
        <AnimatedCard index={0} className="dash-card accounting-panel">
          <h2 className="dash-section-title">Kategori Dağılımı</h2>
          {donutSegments.length === 0 ? (
            <p className="dash-hint">Henüz gider kaydı yok.</p>
          ) : (
            <div className="accounting-donut-wrap">
              <ReportDonut
                segments={donutSegments}
                size={168}
                stroke={20}
                centerNumeric={summary.totalSpent}
                centerLabel={formatCurrency(summary.totalSpent)}
                centerSub="toplam"
                ariaLabel="Gider kategori dağılımı"
              />
              <ul className="accounting-legend">
                {donutSegments.map((segment) => (
                  <li key={segment.key} className="accounting-legend__item">
                    <span
                      className="accounting-legend__swatch"
                      style={{ backgroundColor: segment.color }}
                      aria-hidden="true"
                    />
                    <span>{segment.label}</span>
                    <strong>{formatCurrency(segment.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AnimatedCard>

        <AnimatedCard index={1} className="dash-card accounting-panel">
          <h2 className="dash-section-title">Bütçe vs Gerçekleşen</h2>
          {summary.byCategory.length === 0 ? (
            <p className="dash-hint">Bütçe satırı veya gider yok.</p>
          ) : (
            <ul className="accounting-budget-bars">
              {summary.byCategory.map((row, index) => (
                <li key={row.categoryId} className="accounting-budget-bar">
                  <div className="accounting-budget-bar__head">
                    <span>{row.name}</span>
                    <span className="accounting-budget-bar__amounts">
                      {formatCurrency(row.actual)} / {formatCurrency(row.planned)}
                    </span>
                  </div>
                  <div className="accounting-budget-bar__track">
                    <AnimatedBarFill
                      pct={(row.planned / barScale) * 100}
                      variant="planned"
                      delay={index * 60}
                      className="accounting-bar-fill accounting-bar-fill--planned"
                    />
                    <AnimatedBarFill
                      pct={(row.actual / barScale) * 100}
                      variant="actual"
                      delay={index * 60 + 40}
                      className="accounting-bar-fill accounting-bar-fill--actual"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AnimatedCard>
      </div>

      <div className="accounting-grid">
        <AnimatedCard index={2} className="dash-card accounting-panel">
          <h2 className="dash-section-title">Aylık Trend</h2>
          {summary.byMonth.length === 0 ? (
            <p className="dash-hint">Aylık veri yok.</p>
          ) : (
            <ul className="accounting-month-list">
              {summary.byMonth.map((row) => (
                <li key={row.key} className="accounting-month-row">
                  <span>{row.label}</span>
                  <strong>{formatCurrency(row.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </AnimatedCard>

        <AnimatedCard index={3} className="dash-card accounting-panel">
          <h2 className="dash-section-title">Öne Çıkan Tedarikçiler</h2>
          {summary.topSuppliers.length === 0 ? (
            <p className="dash-hint">Tedarikçi bazlı gider yok.</p>
          ) : (
            <ul className="accounting-month-list">
              {summary.topSuppliers.map((row) => (
                <li key={row.supplierId} className="accounting-month-row">
                  <span>{row.name}</span>
                  <strong>{formatCurrency(row.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </AnimatedCard>
      </div>

      {summary.byClass.length > 0 && (
        <AnimatedCard index={4} className="dash-card accounting-panel">
          <h2 className="dash-section-title">Şube Maliyet Merkezleri</h2>
          <ul className="accounting-month-list">
            {summary.byClass.map((row) => (
              <li key={row.classId} className="accounting-month-row">
                <span>{row.label}</span>
                <strong>{formatCurrency(row.amount)}</strong>
              </li>
            ))}
          </ul>
        </AnimatedCard>
      )}
    </div>
  );
}
