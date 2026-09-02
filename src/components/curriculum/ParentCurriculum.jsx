import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { istanbulDateIso } from '../../lib/calendar';
import {
  loadCurriculumContext,
  PROGRESS_SELECT,
  filterSubjectsForGrade,
  academicWeekIndex,
  isPlaceholderUnitTitle,
  resolvePlannedUnitForWeek,
} from '../../lib/curriculum';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';

function unitState(progress, studentId, unitId) {
  const row = progress.find((item) => item.student_id === studentId && item.unit_id === unitId);
  return {
    completed: Boolean(row?.completed),
    questions: row?.questions_solved ?? 0,
  };
}

function currentWeekTopics(subjects, units, weekPlans, student) {
  const gradeSubjects = filterSubjectsForGrade(subjects, student.grade);
  const weekIndex = Math.max(1, academicWeekIndex(istanbulDateIso()));

  return gradeSubjects
    .map((subject) => {
      const subjectUnits = units.filter((unit) => unit.subject_id === subject.id);
      const planned = resolvePlannedUnitForWeek({
        weekPlans,
        units: subjectUnits,
        subjectId: subject.id,
        grade: student.grade,
        weekIndex,
      });
      if (!planned?.unit || isPlaceholderUnitTitle(planned.unit.title)) return null;
      return { subject, unit: planned.unit, weekIndex };
    })
    .filter(Boolean);
}

function formatWeekTopicsSummary(topics) {
  if (!topics.length) return null;
  if (topics.length === 1) {
    const row = topics[0];
    return `${row.subject.name} — ${row.unit.title}`;
  }
  return topics.map((row) => `${row.subject.name}: ${row.unit.title}`).join(' · ');
}

export function ParentCurriculumRecap({ childrenData, onOpen }) {
  if (!childrenData?.length) return null;

  return (
    <section className="dash-card">
      <h2 className="dash-section-title">Müfredat</h2>
      <ul className="cur-parent-recap">
        {childrenData.map((child) => (
          <li key={child.student.id}>
            <strong>{child.student.full_name}</strong>
            {child.topics?.length ? (
              <p className="dash-hint">
                Bu hafta (Hafta {child.topics[0].weekIndex}): {formatWeekTopicsSummary(child.topics)}
              </p>
            ) : (
              <p className="dash-hint">Bu hafta için planlı konu bulunamadı.</p>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="demo-btn" onClick={onOpen}>
        Tüm ünitelere bak
      </button>
    </section>
  );
}

function ParentStudentCurriculum({ student, subjects, units, weekPlans, progress }) {
  const gradeSubjects = useMemo(
    () => filterSubjectsForGrade(subjects, student.grade),
    [subjects, student.grade]
  );
  const weekIndex = useMemo(
    () => Math.max(1, academicWeekIndex(istanbulDateIso())),
    []
  );
  const plannedUnitIds = useMemo(() => {
    const ids = new Set();
    for (const subject of gradeSubjects) {
      const subjectUnits = units.filter((unit) => unit.subject_id === subject.id);
      const planned = resolvePlannedUnitForWeek({
        weekPlans,
        units: subjectUnits,
        subjectId: subject.id,
        grade: student.grade,
        weekIndex,
      });
      if (planned?.unit?.id) ids.add(planned.unit.id);
    }
    return ids;
  }, [gradeSubjects, units, weekPlans, student.grade, weekIndex]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  useEffect(() => {
    if (!gradeSubjects.length) {
      setSelectedSubjectId('');
      return;
    }
    setSelectedSubjectId((current) =>
      gradeSubjects.some((subject) => subject.id === current) ? current : gradeSubjects[0].id
    );
  }, [gradeSubjects]);

  const selectedSubject =
    gradeSubjects.find((subject) => subject.id === selectedSubjectId) ?? gradeSubjects[0] ?? null;
  const subjectUnits = selectedSubject
    ? units.filter((unit) => unit.subject_id === selectedSubject.id)
    : [];

  const unitProgress = useMemo(
    () =>
      subjectUnits.map((unit) => ({
        unit,
        state: unitState(progress, student.id, unit.id),
      })),
    [subjectUnits, progress, student.id]
  );

  const completedCount = unitProgress.filter((row) => row.state.completed).length;
  const progressPct =
    subjectUnits.length > 0 ? Math.round((completedCount / subjectUnits.length) * 100) : 0;

  return (
    <section className="dash-card">
      <h2 className="dash-section-title">{student.full_name}</h2>
      {gradeSubjects.length === 0 ? (
        <p className="dash-hint">Bu öğrenci için sınıf (5–8) tanımlı değil.</p>
      ) : (
        <>
          <div className="cur-parent-subject-pills" role="tablist" aria-label="Dersler">
            {gradeSubjects.map((subject) => {
              const active = subject.id === selectedSubjectId;
              return (
                <button
                  key={subject.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`cur-parent-subject-pill${active ? ' cur-parent-subject-pill--active' : ''}`}
                  style={active ? { '--cur-subject': subject.color } : undefined}
                  onClick={() => setSelectedSubjectId(subject.id)}
                >
                  <Icon name={subject.icon} size={14} />
                  {subject.name}
                </button>
              );
            })}
          </div>

          {selectedSubject ? (
            <>
              <div
                className="cur-parent-progress"
                style={{ '--cur-subject': selectedSubject.color }}
              >
                <span className="cur-parent-progress__label">
                  {completedCount}/{subjectUnits.length} ünite tamamlandı
                </span>
                <div
                  className="cur-parent-progress__bar"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <ul
                className="cur-parent-units"
                style={{ '--cur-subject': selectedSubject.color }}
              >
                {unitProgress.map(({ unit, state }, index) => (
                  <li
                    key={unit.id}
                    className={`cur-parent-unit${state.completed ? ' cur-parent-unit--done' : ''}${plannedUnitIds.has(unit.id) ? ' cur-parent-unit--current-week' : ''}`}
                  >
                    <span className="cur-parent-unit__mark" aria-hidden="true">
                      <Icon name={state.completed ? 'check' : 'book'} size={15} />
                    </span>
                    <div className="cur-parent-unit__main">
                      <strong className="cur-parent-unit__title">{unit.title}</strong>
                      <span className="cur-parent-unit__index">
                        Ünite {index + 1}
                        {plannedUnitIds.has(unit.id) ? ' · bu hafta' : ''}
                      </span>
                    </div>
                    <div className="cur-parent-unit__meta">
                      <span
                        className={`cur-parent-unit__badge${
                          state.completed
                            ? ' cur-parent-unit__badge--done'
                            : ' cur-parent-unit__badge--pending'
                        }`}
                      >
                        {state.completed ? 'Tamamlandı' : 'Tamamlanmadı'}
                      </span>
                      <span className="cur-parent-unit__questions">{state.questions} soru</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function ParentCurriculum({ students, schoolId }) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const curriculum = await loadCurriculumContext(schoolId);
      setSubjects(curriculum.subjects);
      setUnits(curriculum.units);
      setWeekPlans(curriculum.weekPlans);

      const ids = students.map((student) => student.id);
      if (ids.length) {
        const { data, error: progressError } = await supabase
          .from('student_unit_progress')
          .select(PROGRESS_SELECT)
          .in('student_id', ids);
        if (progressError) throw progressError;
        setProgress(data ?? []);
      } else {
        setProgress([]);
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, students]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Müfredat yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Müfredat</h1>
        <p className="dash-subtitle">
          Ünitelerin tamamlanma durumu, çözülen soru sayısı ve bu haftanın planlı konuları.
        </p>
      </header>

      {error && <InlineError error={error} context="curriculum" />}

      {students.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">Hesabınıza bağlı öğrenci yok.</p>
        </section>
      ) : (
        students.map((student) => (
          <ParentStudentCurriculum
            key={student.id}
            student={student}
            subjects={subjects}
            units={units}
            weekPlans={weekPlans}
            progress={progress}
          />
        ))
      )}
    </>
  );
}

export function useParentCurriculumRecap(students, schoolId) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const curriculum = await loadCurriculumContext(schoolId);
        if (!mounted) return;
        setSubjects(curriculum.subjects);
        setUnits(curriculum.units);
        setWeekPlans(curriculum.weekPlans);
      } catch {
        if (mounted) {
          setSubjects([]);
          setUnits([]);
          setWeekPlans([]);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [students, schoolId]);

  return useMemo(
    () =>
      students.map((student) => ({
        student,
        topics: currentWeekTopics(subjects, units, weekPlans, student),
      })),
    [students, subjects, units, weekPlans]
  );
}
