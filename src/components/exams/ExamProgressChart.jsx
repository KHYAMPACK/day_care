import { useMemo } from 'react';
import { LGS_SUBJECTS } from '../../lib/lgsExam';

export default function ExamProgressChart({ series = [], metric = 'totalNet' }) {
  const points = useMemo(() => {
    if (!series.length) return [];
    const values = series.map((item) => Number(item[metric]) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    return series.map((item, index) => ({
      ...item,
      value: Number(item[metric]) || 0,
      xPct: series.length === 1 ? 50 : (index / (series.length - 1)) * 100,
      yPct: 100 - ((Number(item[metric]) || 0) - min) / range * 80 - 10,
    }));
  }, [series, metric]);

  if (!points.length) {
    return <p className="dash-hint">Gelişim grafiği için yeterli sınav yok.</p>;
  }

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct} ${p.yPct}`)
    .join(' ');

  return (
    <div className="exam-progress-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="exam-progress-chart__svg" role="img" aria-label="Sınav gelişim grafiği">
        <polyline points={points.map((p) => `${p.xPct},${p.yPct}`).join(' ')} className="exam-progress-chart__line" fill="none" />
        {points.map((p) => (
          <circle key={p.sessionId ?? p.title} cx={p.xPct} cy={p.yPct} r="2.5" className="exam-progress-chart__dot" />
        ))}
      </svg>
      <ul className="exam-progress-chart__labels">
        {points.map((p) => (
          <li key={p.sessionId ?? p.title}>
            <span>{p.title}</span>
            <strong>{p.value.toFixed(1)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExamSubjectBars({ subjects = [] }) {
  const maxNet = Math.max(...subjects.map((s) => Number(s.net) || 0), 1);
  return (
    <ul className="exam-subject-bars">
      {subjects.map((subject) => {
        const net = Number(subject.net) || 0;
        const pct = Math.round((net / maxNet) * 100);
        return (
          <li key={subject.code}>
            <span className="exam-subject-bars__label">{subject.shortLabel ?? subject.label}</span>
            <div className="exam-subject-bars__track">
              <span className="exam-subject-bars__fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="exam-subject-bars__value">{net ? net.toFixed(1) : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export { LGS_SUBJECTS };
