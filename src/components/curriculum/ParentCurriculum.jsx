import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadCurriculumCatalog, PROGRESS_SELECT, filterSubjectsForGrade } from '../../lib/curriculum';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';

function unitState(progress, studentId, unitId) {
  const row = progress.find((item) => item.student_id === studentId && item.unit_id === unitId);
  return {
    completed: Boolean(row?.completed),
    questions: row?.questions_solved ?? 0,
  };
}

function currentTopic(subjects, units, progress, studentId) {
  for (const subject of subjects) {
    const subjectUnits = units.filter((unit) => unit.subject_id === subject.id);
    const next = subjectUnits.find((unit) => !unitState(progress, studentId, unit.id).completed);
    if (next) {
      return { subject, unit: next };
    }
  }
  return null;
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
            {child.topic ? (
              <p className="dash-hint">
                Şu anki konu: {child.topic.subject.name} — {child.topic.unit.title}
              </p>
            ) : (
              <p className="dash-hint">Kayıtlı ünite ilerlemesi yok.</p>
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

function ParentStudentCurriculum({ student, subjects, units, progress }) {
  const gradeSubjects = useMemo(
    () => filterSubjectsForGrade(subjects, student.grade),
    [subjects, student.grade]
  );
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
                    className={`cur-parent-unit${state.completed ? ' cur-parent-unit--done' : ''}`}
                  >
                    <span className="cur-parent-unit__mark" aria-hidden="true">
                      <Icon name={state.completed ? 'check' : 'book'} size={15} />
                    </span>
                    <div className="cur-parent-unit__main">
                      <strong className="cur-parent-unit__title">{unit.title}</strong>
                      <span className="cur-parent-unit__index">Ünite {index + 1}</span>
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

export default function ParentCurriculum({ students }) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await loadCurriculumCatalog();
      setSubjects(catalog.subjects);
      setUnits(catalog.units);

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
  }, [students]);

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
        <p className="dash-subtitle">Ünitelerin tamamlanma durumu ve çözülen soru sayısı.</p>
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
            progress={progress}
          />
        ))
      )}
    </>
  );
}

export function useParentCurriculumRecap(students) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const catalog = await loadCurriculumCatalog();
        if (!mounted) return;
        setSubjects(catalog.subjects);
        setUnits(catalog.units);
        const ids = students.map((student) => student.id);
        if (!ids.length) {
          setProgress([]);
          return;
        }
        const { data, error } = await supabase
          .from('student_unit_progress')
          .select(PROGRESS_SELECT)
          .in('student_id', ids);
        if (error || !mounted) return;
        setProgress(data ?? []);
      } catch {
        if (mounted) {
          setSubjects([]);
          setUnits([]);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [students]);

  return useMemo(
    () =>
      students.map((student) => ({
        student,
        topic: currentTopic(
          filterSubjectsForGrade(subjects, student.grade),
          units,
          progress,
          student.id
        ),
      })),
    [students, subjects, units, progress]
  );
}
