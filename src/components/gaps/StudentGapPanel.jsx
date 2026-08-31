import { subjectByCode } from '../../lib/lgsExam';
import { explainGapReason, flagTypeLabel } from '../../lib/studentGaps';

function formatTopicLabel(row) {
  if (row.kind === 'subject') {
    return row.unitTitle ?? subjectByCode(row.subject_code)?.label ?? 'Ders';
  }
  if (row.sectionLabel && row.unitTitle) {
    return `${row.sectionLabel} (${row.unitTitle})`;
  }
  if (row.unitTitle && row.topicLabel) {
    return `${row.topicLabel} (${row.unitTitle})`;
  }
  return row.topicLabel ?? row.unitTitle ?? 'Konu';
}

export function StudentGapPriorityList({ priorities = [], compact = false, growthTarget = null }) {
  if (!priorities.length && !growthTarget?.summary) {
    return <p className="dash-hint">Öncelikli gelişim alanı tespit edilmedi.</p>;
  }

  return (
    <div className={`student-gap-list-wrap${compact ? ' student-gap-list-wrap--compact' : ''}`}>
      {growthTarget?.summary ? (
        <div className="student-gap-growth-target">
          <p className="student-gap-growth-target__label">
            {growthTarget.tierLabel ?? 'Öğrenci'} · {growthTarget.trajectoryLabel ?? 'Trend'}
          </p>
          <p className="student-gap-growth-target__text">{growthTarget.summary}</p>
        </div>
      ) : null}
      {!priorities.length ? (
        <p className="dash-hint">Şu an öncelikli uyarı yok — hedefe uygun ilerliyor.</p>
      ) : (
    <ul className={`student-gap-list${compact ? ' student-gap-list--compact' : ''}`}>
      {priorities.map((row, index) => (
        <li key={`${row.kind}-${row.topicLabel ?? row.unitId}-${index}`} className="student-gap-card">
          <div className="student-gap-card__head">
            <strong>{formatTopicLabel(row)}</strong>
            {row.kind === 'attendance' ? (
              <span className="demo-pill demo-pill--amber">Devamsızlık</span>
            ) : (
              <span className="demo-pill demo-pill--rose">
                {row.flagTypeLabel ?? flagTypeLabel(row.flagType) ?? 'Eksik'}
              </span>
            )}
          </div>
          <p className="student-gap-card__meta dash-hint">
            {row.successRate != null ? `%${row.successRate} başarı` : null}
            {row.examCount ? ` · ${row.examCount} deneme` : null}
            {row.attempts ? ` · ${row.attempts} soru` : null}
            {row.missedDays ? ` · ${row.missedDays} gün kaçırdı` : null}
            {row.atlasQuestions
              ? ` · Sınıf çalışması: ${row.atlasWrong ?? 0}Y / ${row.atlasQuestions} soru`
              : null}
          </p>
          <p className="student-gap-card__reason">
            <strong>Neden eksik?</strong>{' '}
            {row.flagReason ?? explainGapReason(row)}
          </p>
          <p className="student-gap-card__action">
            <strong>Ne yapılmalı?</strong> {row.suggestedAction}
          </p>
        </li>
      ))}
    </ul>
      )}
    </div>
  );
}

export function StudentWeakTopicsSummary({ topics = [], limit = 5 }) {
  const weak = topics.filter((row) => row.attempts > 0).slice(0, limit);
  if (!weak.length) return null;

  return (
    <section className="student-gap-summary">
      <h4 className="dash-section-title">Dikkat edilmesi gereken konular</h4>
      <ul className="exam-list">
        {weak.map((row) => (
          <li key={`${row.subject_code}-${row.topicLabel}`}>
            <strong>{row.topicLabel}</strong>
            <span className="dash-hint">
              {subjectByCode(row.subject_code)?.label ?? row.subject_code} · %{row.successRate} doğru
              {row.examCount > 1 ? ` · ${row.examCount} deneme` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StudentGapPanel({ profile, loading, error }) {
  if (loading) return <p className="dash-hint">Eksik analizi yükleniyor…</p>;
  if (error) return <p className="dash-hint">Eksik analizi yüklenemedi.</p>;
  if (!profile) return <p className="dash-hint">Profil yok.</p>;

  return (
    <section className="student-gap-panel">
      <h3 className="dash-section-title">Öncelikli eksikler</h3>
      <StudentGapPriorityList priorities={profile.priorities} growthTarget={profile.growthTarget} />
    </section>
  );
}
