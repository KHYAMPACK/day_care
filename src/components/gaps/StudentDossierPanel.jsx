import { useEffect, useMemo, useState } from 'react';
import ExamProgressChart from '../exams/ExamProgressChart';
import { StudentGapPriorityList } from './StudentGapPanel';
import { LGS_SUBJECTS, subjectByCode } from '../../lib/lgsExam';
import { formatCalendarDateTr } from '../../lib/calendar';

function formatHeldOn(value) {
  if (!value) return '—';
  try {
    return formatCalendarDateTr(value);
  } catch {
    return value;
  }
}

function TableHint({ children }) {
  return <p className="student-dossier__table-hint dash-hint">{children}</p>;
}

function ColumnHead({ label, hint = null }) {
  return (
    <span className="student-dossier__col-head" title={hint ?? undefined}>
      <span className="student-dossier__col-head-label">{label}</span>
      {hint ? <span className="student-dossier__col-head-hint">{hint}</span> : null}
    </span>
  );
}

function formatDyb({ correct, wrong, blank }) {
  return `${correct ?? 0} doğru · ${wrong ?? 0} yanlış · ${blank ?? 0} boş`;
}

function formatWrongBlank({ wrong, blank }) {
  return `${wrong ?? 0} yanlış · ${blank ?? 0} boş`;
}

function groupBySubject(rows = [], { getCode, getLabel, getUnits }) {
  const groups = new Map();

  for (const row of rows) {
    const code = getCode(row) ?? 'other';
    if (!groups.has(code)) {
      groups.set(code, {
        subject_code: code,
        label: getLabel(row) ?? subjectByCode(code)?.label ?? 'Diğer',
        units: [],
      });
    }
    getUnits(groups.get(code), row);
  }

  const order = LGS_SUBJECTS.map((subject) => subject.code);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      units: [...group.units].sort((a, b) =>
        (a.unitTitle ?? a.topicLabel ?? '').localeCompare(b.unitTitle ?? b.topicLabel ?? '', 'tr')
      ),
    }))
    .sort((a, b) => {
      const left = order.indexOf(a.subject_code);
      const right = order.indexOf(b.subject_code);
      return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
    });
}

function collectSubjectCodes(rows = []) {
  const codes = new Set();
  for (const row of rows) {
    if (row.subject_code) codes.add(row.subject_code);
  }
  return LGS_SUBJECTS.filter((subject) => codes.has(subject.code)).map(
    (subject) => subject.code
  );
}

function filterGroupsBySubject(groups = [], subjectFilter = 'all') {
  if (subjectFilter === 'all') return groups;
  return groups.filter((group) => group.subject_code === subjectFilter);
}

function SubjectFilterBar({ subjects = [], value = 'all', onChange, counts = {} }) {
  if (!subjects.length) return null;

  return (
    <div className="student-dossier__subject-filter" role="tablist" aria-label="Ders filtresi">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'all'}
        className={`student-dossier__subject-chip${
          value === 'all' ? ' student-dossier__subject-chip--active' : ''
        }`}
        onClick={() => onChange('all')}
      >
        Tümü
      </button>
      {subjects.map((code) => {
        const subject = subjectByCode(code);
        const count = counts[code];
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={value === code}
            className={`student-dossier__subject-chip${
              value === code ? ' student-dossier__subject-chip--active' : ''
            }`}
            onClick={() => onChange(code)}
          >
            {subject?.label ?? code}
            {count != null ? ` (${count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

function groupTopicsBySubject(topics = []) {
  return groupBySubject(topics, {
    getCode: (row) => row.subject_code,
    getLabel: (row) => subjectByCode(row.subject_code)?.label,
    getUnits: (group, row) => {
      group.units.push(row);
    },
  }).map((group) => ({
    ...group,
    units: [...group.units].sort((a, b) =>
      (a.topicLabel ?? '').localeCompare(b.topicLabel ?? '', 'tr')
    ),
  }));
}

function groupAtlasUnitsBySubject(atlasUnits = []) {
  return groupBySubject(atlasUnits, {
    getCode: (row) => row.subject_code,
    getLabel: (row) => row.subjectLabel,
    getUnits: (group, row) => {
      group.units.push(row);
    },
  });
}

function buildUnitCompareRows(unitRollup = [], atlasUnits = []) {
  const keys = new Set([
    ...unitRollup.map((row) => row.unitId ?? row.unitTitle),
    ...atlasUnits.map((row) => row.unitId ?? row.unitTitle),
  ]);

  return [...keys].map((key) => {
    const deneme = unitRollup.find((row) => (row.unitId ?? row.unitTitle) === key);
    const atlas = atlasUnits.find((row) => (row.unitId ?? row.unitTitle) === key);
    const subject_code = deneme?.subject_code ?? atlas?.subject_code ?? 'other';

    return {
      key,
      unitTitle: deneme?.unitTitle ?? atlas?.unitTitle ?? '—',
      subject_code,
      subjectLabel:
        atlas?.subjectLabel ?? subjectByCode(subject_code)?.label ?? 'Diğer',
      deneme,
      atlas,
    };
  });
}

function groupUnitCompareBySubject(rows = []) {
  return groupBySubject(rows, {
    getCode: (row) => row.subject_code,
    getLabel: (row) => row.subjectLabel,
    getUnits: (group, row) => {
      group.units.push(row);
    },
  });
}

function AtlasUnitsBySubjectTable({ atlasUnits = [] }) {
  const [subjectFilter, setSubjectFilter] = useState('all');
  const groups = useMemo(() => groupAtlasUnitsBySubject(atlasUnits), [atlasUnits]);
  const availableSubjects = useMemo(() => collectSubjectCodes(atlasUnits), [atlasUnits]);
  const subjectCounts = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.subject_code, group.units.length])),
    [groups]
  );
  const visibleGroups = useMemo(
    () => filterGroupsBySubject(groups, subjectFilter),
    [groups, subjectFilter]
  );

  if (!groups.length) {
    return <p className="dash-hint">Atlas sınıf çalışması kaydı yok.</p>;
  }

  return (
    <>
      <SubjectFilterBar
        subjects={availableSubjects}
        value={subjectFilter}
        onChange={setSubjectFilter}
        counts={subjectCounts}
      />
      <TableHint>
        Sınıfta ünite bazında çözülen sorular, branşa göre gruplandırılmıştır. Başarı = doğru
        cevap oranı.
      </TableHint>
      {!visibleGroups.length ? (
        <p className="dash-hint">Seçilen ders için sınıf çalışması kaydı yok.</p>
      ) : (
        <div className="student-dossier__atlas-groups">
          {visibleGroups.map((group) => (
            <section key={group.subject_code} className="student-dossier__atlas-group">
              <header className="student-dossier__atlas-group-head">
                <h4 className="student-dossier__atlas-group-title">{group.label}</h4>
                <span className="dash-hint">{group.units.length} ünite</span>
              </header>
              <table className="exam-ranking-table">
                <thead>
                  <tr>
                    <th>Ünite</th>
                    <th>
                      <ColumnHead label="Toplam soru" hint="Sınıfta çözülen soru sayısı" />
                    </th>
                    <th>
                      <ColumnHead label="Yanlış / boş" />
                    </th>
                    <th>
                      <ColumnHead label="Başarı" />
                    </th>
                    <th>
                      <ColumnHead label="Çalışma sayısı" hint="Kaç kez sınıfta çalışıldı" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.units.map((row) => (
                    <tr key={row.unitId ?? row.unitTitle}>
                      <td>{row.unitTitle}</td>
                      <td>{row.totalQuestions}</td>
                      <td className="student-dossier__cell-muted">{formatWrongBlank(row)}</td>
                      <td>{row.successRate != null ? `%${row.successRate}` : '—'}</td>
                      <td>{row.sessions ?? 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function DossierAccordionSection({ id, title, summary, isOpen, onToggle, children }) {
  return (
    <section
      id={`dossier-section-${id}`}
      className={`student-dossier__accordion${isOpen ? ' student-dossier__accordion--open' : ''}`}
    >
      <button
        type="button"
        className="student-dossier__accordion-trigger"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
      >
        <span className="student-dossier__accordion-title">{title}</span>
        {summary ? <span className="student-dossier__accordion-meta dash-hint">{summary}</span> : null}
      </button>
      {isOpen ? <div className="student-dossier__accordion-body">{children}</div> : null}
    </section>
  );
}

function TopicGroupTable({ topics = [] }) {
  const [sortKey, setSortKey] = useState('successRate');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    const rows = [...topics];
    rows.sort((a, b) => {
      const left = a[sortKey] ?? '';
      const right = b[sortKey] ?? '';
      if (typeof left === 'number' && typeof right === 'number') {
        return sortDir === 'asc' ? left - right : right - left;
      }
      return sortDir === 'asc'
        ? String(left).localeCompare(String(right), 'tr')
        : String(right).localeCompare(String(left), 'tr');
    });
    return rows;
  }, [topics, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  return (
    <table className="exam-ranking-table student-dossier__topic-table">
      <thead>
        <tr>
          <th>
            <button type="button" className="student-dossier__sort" onClick={() => toggleSort('topicLabel')}>
              Konu
            </button>
          </th>
          <th>
            <ColumnHead label="Doğru" hint="Toplam doğru" />
          </th>
          <th>
            <ColumnHead label="Yanlış" hint="Toplam yanlış" />
          </th>
          <th>
            <ColumnHead label="Boş" hint="Toplam boş" />
          </th>
          <th>
            <button type="button" className="student-dossier__sort" onClick={() => toggleSort('successRate')}>
              Başarı
            </button>
          </th>
          <th>
            <button type="button" className="student-dossier__sort" onClick={() => toggleSort('examCount')}>
              Deneme sayısı
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={`${row.subject_code}-${row.topicLabel}`}>
            <td>{row.topicLabel}</td>
            <td>{row.correct}</td>
            <td>{row.wrong}</td>
            <td>{row.blank}</td>
            <td>{row.successRate != null ? `%${row.successRate}` : '—'}</td>
            <td>{row.examCount ?? 1}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopicAnalysisTable({ topics = [] }) {
  const [subjectFilter, setSubjectFilter] = useState('all');
  const groups = useMemo(() => groupTopicsBySubject(topics), [topics]);
  const availableSubjects = useMemo(() => collectSubjectCodes(topics), [topics]);
  const subjectCounts = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.subject_code, group.units.length])),
    [groups]
  );
  const visibleGroups = useMemo(
    () => filterGroupsBySubject(groups, subjectFilter),
    [groups, subjectFilter]
  );

  if (!groups.length) {
    return <p className="dash-hint">Konu analizi için optik ve cevap anahtarı gerekir.</p>;
  }

  return (
    <>
      <SubjectFilterBar
        subjects={availableSubjects}
        value={subjectFilter}
        onChange={setSubjectFilter}
        counts={subjectCounts}
      />
      <TableHint>
        Her konuda tüm denemelerden toplanan soru sonuçları, branşa göre gruplandırılmıştır.
        Başarı = doğru cevap oranı.
      </TableHint>
      {!visibleGroups.length ? (
        <p className="dash-hint">Seçilen ders için konu verisi yok.</p>
      ) : (
        <div className="student-dossier__atlas-groups">
          {visibleGroups.map((group) => (
            <section key={group.subject_code} className="student-dossier__atlas-group">
              <header className="student-dossier__atlas-group-head">
                <h4 className="student-dossier__atlas-group-title">{group.label}</h4>
                <span className="dash-hint">{group.units.length} konu</span>
              </header>
              <TopicGroupTable topics={group.units} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function UnitCompareTable({ unitRollup = [], atlasUnits = [] }) {
  const [subjectFilter, setSubjectFilter] = useState('all');
  const groups = useMemo(() => {
    const rows = buildUnitCompareRows(unitRollup, atlasUnits);
    return groupUnitCompareBySubject(rows);
  }, [unitRollup, atlasUnits]);
  const compareRows = useMemo(
    () => buildUnitCompareRows(unitRollup, atlasUnits),
    [unitRollup, atlasUnits]
  );
  const availableSubjects = useMemo(() => collectSubjectCodes(compareRows), [compareRows]);
  const subjectCounts = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.subject_code, group.units.length])),
    [groups]
  );
  const visibleGroups = useMemo(
    () => filterGroupsBySubject(groups, subjectFilter),
    [groups, subjectFilter]
  );

  if (!groups.length) {
    return <p className="dash-hint">Ünite özeti için deneme veya sınıf çalışması verisi gerekir.</p>;
  }

  return (
    <div className="student-dossier__unit-compare">
      <SubjectFilterBar
        subjects={availableSubjects}
        value={subjectFilter}
        onChange={setSubjectFilter}
        counts={subjectCounts}
      />
      <TableHint>
        Aynı ünite için deneme sınavı sonuçları ile sınıftaki Atlas çalışması karşılaştırılır.
        Branşa göre gruplandırılmıştır.
      </TableHint>
      {!visibleGroups.length ? (
        <p className="dash-hint">Seçilen ders için ünite verisi yok.</p>
      ) : (
        <div className="student-dossier__atlas-groups">
          {visibleGroups.map((group) => (
            <section key={group.subject_code} className="student-dossier__atlas-group">
              <header className="student-dossier__atlas-group-head">
                <h4 className="student-dossier__atlas-group-title">{group.label}</h4>
                <span className="dash-hint">{group.units.length} ünite</span>
              </header>
              <table className="exam-ranking-table">
                <thead>
                  <tr>
                    <th>Ünite</th>
                    <th>
                      <ColumnHead label="Denemede" hint="Doğru · yanlış · boş" />
                    </th>
                    <th>
                      <ColumnHead label="Deneme başarısı" />
                    </th>
                    <th>
                      <ColumnHead label="Sınıf soru sayısı" hint="Atlas'ta çözülen toplam soru" />
                    </th>
                    <th>
                      <ColumnHead label="Sınıfta" hint="Yanlış · boş" />
                    </th>
                    <th>
                      <ColumnHead label="Sınıf başarısı" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.units.map((row) => (
                    <tr key={row.key}>
                      <td>{row.unitTitle}</td>
                      <td className="student-dossier__cell-muted">
                        {row.deneme ? formatDyb(row.deneme) : '—'}
                      </td>
                      <td>
                        {row.deneme?.successRate != null ? `%${row.deneme.successRate}` : '—'}
                      </td>
                      <td>{row.atlas?.totalQuestions ?? '—'}</td>
                      <td className="student-dossier__cell-muted">
                        {row.atlas ? formatWrongBlank(row.atlas) : '—'}
                      </td>
                      <td>{row.atlas?.successRate != null ? `%${row.atlas.successRate}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamDetailAccordion({ exam }) {
  const session = exam.session;
  const ranking = exam.ranking;

  return (
    <details className="student-dossier__exam-detail exam-reports-collapse">
      <summary className="exam-reports-collapse__summary">
        <span className="exam-reports-collapse__title">
          {session?.title ?? 'Deneme'} · {formatHeldOn(session?.held_on)}
        </span>
        <span className="dash-hint">
          Net {ranking?.total_net != null ? Number(ranking.total_net).toFixed(2) : '—'}
          {ranking?.class_rank ? ` · Sınıf ${ranking.class_rank}.` : ''}
        </span>
      </summary>
      <div className="exam-reports-collapse__body">
        <table className="exam-ranking-table">
          <thead>
            <tr>
              <th>Ders</th>
              <th>Doğru</th>
              <th>Yanlış</th>
              <th>Boş</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {(exam.subjectRows ?? []).map((row) => (
              <tr key={row.code ?? row.subject_code}>
                <td>{row.shortLabel ?? row.label ?? subjectByCode(row.subject_code)?.shortLabel}</td>
                <td>{row.correct ?? '—'}</td>
                <td>{row.wrong ?? '—'}</td>
                <td>{row.blank ?? '—'}</td>
                <td>{row.net != null ? Number(row.net).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {exam.errorGroups?.length ? (
          <ul className="exam-list student-gap-grouped-list">
            {exam.errorGroups.map((group) => (
              <li key={group.topicLabel} className="student-gap-group">
                <div className="student-gap-group__head">
                  <strong>{group.topicLabel}</strong>
                  <span className="dash-hint">
                    {group.wrong ? `${group.wrong} yanlış` : ''}
                    {group.wrong && group.blank ? ' · ' : ''}
                    {group.blank ? `${group.blank} boş` : ''}
                  </span>
                </div>
                <ul className="student-gap-group__items">
                  {group.items.slice(0, 6).map((item) => (
                    <li key={item.questionIndex ?? item.question_id}>
                      Soru {item.questionIndex ?? '—'}
                      <span className="dash-hint">
                        {item.status === 'blank' ? 'Boş' : `Yanlış (${item.choice ?? '—'})`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dash-hint">Bu deneme için konu hata listesi yok.</p>
        )}
      </div>
    </details>
  );
}

export default function StudentDossierPanel({ dossier, loading, error, ErrorComponent, embedded = false }) {
  const [activeSection, setActiveSection] = useState('summary');

  useEffect(() => {
    setActiveSection('summary');
  }, [dossier?.student?.id]);

  useEffect(() => {
    if (!activeSection) return;
    const node = document.getElementById(`dossier-section-${activeSection}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeSection]);

  const gapProfile = dossier?.gapProfile;
  const progressSeries = dossier?.progressSeries ?? [];
  const exams = dossier?.exams ?? [];
  const attendanceFlags = dossier?.attendanceFlags ?? [];
  const atlasUnits = dossier?.atlasUnits ?? [];
  const stats = dossier?.stats;
  const student = dossier?.student;
  const latest = progressSeries[progressSeries.length - 1];
  const examDetails = useMemo(
    () => [...exams].reverse().slice(0, 2),
    [exams]
  );

  const sections = useMemo(
    () => [
      {
        id: 'summary',
        title: 'Özet — öncelikli eksikler',
        summary: `${gapProfile?.priorities?.length ?? 0} öncelik`,
      },
      {
        id: 'exams',
        title: 'Deneme geçmişi',
        summary: `${progressSeries.length} sınav`,
      },
      {
        id: 'topics',
        title: 'Konu analizi',
        summary: `${gapProfile?.allTopics?.length ?? 0} konu`,
      },
      {
        id: 'units',
        title: 'Ünite özeti',
        summary: 'Deneme vs sınıf çalışması',
      },
      {
        id: 'atlas',
        title: 'Sınıf çalışması (Atlas)',
        summary: `${atlasUnits.length} ünite`,
      },
      {
        id: 'attendance',
        title: 'Devamsızlık',
        summary: `${attendanceFlags.length} uyarı`,
      },
      {
        id: 'exam-details',
        title: 'Deneme detayları',
        summary: `Son ${examDetails.length} deneme`,
      },
    ],
    [
      gapProfile?.priorities?.length,
      gapProfile?.allTopics?.length,
      progressSeries.length,
      atlasUnits.length,
      attendanceFlags.length,
      examDetails.length,
    ]
  );

  if (loading) return <p className="dash-hint">Öğrenci dosyası yükleniyor…</p>;
  if (error && ErrorComponent) return <ErrorComponent error={error} context="general" />;
  if (!dossier) {
    return <p className="dash-hint">Öğrenci seçin ve dosyayı görüntüleyin.</p>;
  }

  function toggleSection(sectionId) {
    setActiveSection((current) => (current === sectionId ? '' : sectionId));
  }

  function renderSectionContent(sectionId) {
    switch (sectionId) {
      case 'summary':
        return (
          <StudentGapPriorityList
            priorities={gapProfile?.priorities ?? []}
            growthTarget={gapProfile?.growthTarget}
          />
        );
      case 'exams':
        return (
          <>
            <ExamProgressChart series={progressSeries ?? []} metric="totalNet" />
            {progressSeries?.length ? (
              <table className="exam-ranking-table student-dossier__exam-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Deneme</th>
                    <th>Net</th>
                    <th>LGS</th>
                    <th>Kurum</th>
                    <th>Sınıf</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(exams ?? [])].reverse().map((exam) => {
                    const ranking = exam.ranking;
                    return (
                      <tr key={exam.session?.id}>
                        <td>{formatHeldOn(exam.session?.held_on)}</td>
                        <td>{exam.session?.title ?? '—'}</td>
                        <td>
                          {ranking?.total_net != null ? Number(ranking.total_net).toFixed(2) : '—'}
                        </td>
                        <td>
                          {ranking?.lgs_score != null ? Math.round(ranking.lgs_score) : '—'}
                        </td>
                        <td>{ranking?.school_rank ?? '—'}</td>
                        <td>{ranking?.class_rank ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </>
        );
      case 'topics':
        return <TopicAnalysisTable topics={gapProfile?.allTopics ?? []} />;
      case 'units':
        return (
          <UnitCompareTable
            unitRollup={gapProfile?.unitRollup ?? []}
            atlasUnits={atlasUnits ?? gapProfile?.atlasUnits ?? []}
          />
        );
      case 'atlas':
        return !atlasUnits?.length ? (
          <p className="dash-hint">Atlas sınıf çalışması kaydı yok.</p>
        ) : (
          <AtlasUnitsBySubjectTable atlasUnits={atlasUnits} />
        );
      case 'attendance':
        return !attendanceFlags?.length ? (
          <p className="dash-hint">Kaçırılan ünite uyarısı yok.</p>
        ) : (
          <ul className="att-flag-list">
            {attendanceFlags.map((flag) => (
              <li key={`${flag.unitId}-${flag.subjectId}`} className="att-flag">
                <strong>{flag.unitTitle}</strong>
                <span className="dash-hint">
                  {flag.subjectName} · {flag.classLabel} · {flag.absentCount} gün kaçırdı
                </span>
              </li>
            ))}
          </ul>
        );
      case 'exam-details':
        return !examDetails.length ? (
          <p className="dash-hint">Deneme detayı için yayınlanmış sınav gerekir.</p>
        ) : (
          examDetails.map((exam) => <ExamDetailAccordion key={exam.session?.id} exam={exam} />)
        );
      default:
        return null;
    }
  }

  return (
    <section className="student-dossier">
      <header className="student-dossier__hero">
        <div>
          {!embedded ? <h2 className="dash-section-title">{student?.full_name}</h2> : null}
          <p className="dash-hint">
            {gapProfile?.tier?.label ?? '—'} · {gapProfile?.trajectoryLabel ?? '—'} ·{' '}
            {stats?.examCount ?? 0} deneme · {stats?.persistentGapCount ?? 0} gelişim alanı
          </p>
        </div>
        <dl className="student-dossier__stats">
          <div>
            <dt>Son net</dt>
            <dd>{stats?.latestNet != null ? Number(stats.latestNet).toFixed(2) : '—'}</dd>
          </div>
          <div>
            <dt>Son LGS</dt>
            <dd>{stats?.latestLgs != null ? Math.round(stats.latestLgs) : '—'}</dd>
          </div>
          <div>
            <dt>Son sınav</dt>
            <dd>{latest?.title ?? '—'}</dd>
          </div>
        </dl>
      </header>

      <div className="student-dossier__accordion-list">
        {sections.map((section) => (
          <DossierAccordionSection
            key={section.id}
            id={section.id}
            title={section.title}
            summary={section.summary}
            isOpen={activeSection === section.id}
            onToggle={toggleSection}
          >
            {renderSectionContent(section.id)}
          </DossierAccordionSection>
        ))}
      </div>
    </section>
  );
}
