import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCurriculumCatalog, loadSchoolClasses, formatClassLabel } from '../../lib/curriculum';
import { loadAttendanceFlags } from '../../lib/attendance';
import { InlineError } from '../dashboardUi';

export default function DirectorAttendance({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [flags, setFlags] = useState([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const classFilter = classId || undefined;
  const subjectFilter = subjectId || undefined;
  const gradeForSubject = classes.find((klass) => klass.id === classId)?.grade;
  const subjectOptions = useMemo(() => {
    if (!gradeForSubject) return subjects;
    return subjects.filter((subject) => subject.grade === gradeForSubject);
  }, [subjects, gradeForSubject]);

  const loadFilters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classRows, catalog] = await Promise.all([
        loadSchoolClasses(schoolId),
        loadCurriculumCatalog(),
      ]);
      setClasses(classRows);
      setSubjects(catalog.subjects);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const loadFlags = useCallback(async () => {
    if (!schoolId) return;
    setError(null);
    try {
      const rows = await loadAttendanceFlags({
        schoolId,
        classId: classFilter,
        subjectId: subjectFilter,
      });
      setFlags(rows);
    } catch (loadError) {
      setError(loadError);
      setFlags([]);
    }
  }, [schoolId, classFilter, subjectFilter]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Yoklama özeti yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Yoklama</h1>
        <p className="dash-subtitle">
          Aynı konudan 2 ders ve üzeri kaçıran öğrenciler. Veliler bu listeyi görmez.
        </p>
      </header>

      {error && <InlineError error={error} context="attendance" />}

      <section className="dash-card">
        <div className="att-filters">
          <label className="dash-label">
            Şube
            <select
              className="dash-input"
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setSubjectId('');
              }}
            >
              <option value="">Tümü</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {formatClassLabel(klass.grade, klass.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-label">
            Ders
            <select
              className="dash-input"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <option value="">Tümü</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.grade}. sınıf {subject.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {flags.length === 0 ? (
          <p className="dash-hint">Bu süzgeçte işaretlenen öğrenci yok.</p>
        ) : (
          <ul className="att-flag-list">
            {flags.map((flag) => (
              <li key={`${flag.studentId}-${flag.unitId}`} className="att-flag">
                <strong>
                  {flag.studentName}
                  {flag.classLabel ? ` · ${flag.classLabel}` : ''}
                </strong>
                <span>
                  {flag.subjectName} · {flag.unitTitle} · {flag.absentCount} gün
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
