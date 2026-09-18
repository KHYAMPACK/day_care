import { useEffect, useMemo, useState } from 'react';
import { loadClassRoster } from '../../lib/attendance';
import { formatClassLabel } from '../../lib/curriculum';
import DirectorAttendance from '../attendance/DirectorAttendance';
import CounselorStudentsTab from '../exams/CounselorStudentsTab';
import CounselorGuidanceTab from '../exams/CounselorGuidanceTab';
import ExamReportsPanel from '../exams/ExamReportsPanel';
import DirectorSubNav from '../director/DirectorSubNav';
import { InlineError } from '../dashboardUi';

const SECTIONS = [
  { id: 'overview', label: 'Yoklama', icon: 'check' },
  { id: 'students', label: 'Öğrenciler', icon: 'child' },
  { id: 'guidance', label: 'Rehberlik', icon: 'book' },
  { id: 'reports', label: 'Raporlar', icon: 'clipboard' },
];

export default function TeacherHomeroomTab({
  schoolId,
  school,
  homeroomClasses = [],
  atlasSchedule = false,
}) {
  const [selectedClassId, setSelectedClassId] = useState(homeroomClasses[0]?.id ?? '');
  const [section, setSection] = useState('overview');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!homeroomClasses.length) return;
    if (!homeroomClasses.some((klass) => klass.id === selectedClassId)) {
      setSelectedClassId(homeroomClasses[0].id);
    }
  }, [homeroomClasses, selectedClassId]);

  const scopedClasses = useMemo(
    () =>
      selectedClassId
        ? homeroomClasses.filter((klass) => klass.id === selectedClassId)
        : homeroomClasses,
    [homeroomClasses, selectedClassId]
  );

  useEffect(() => {
    if (!scopedClasses.length) {
      setStudents([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rosters = await Promise.all(
          scopedClasses.map((klass) => loadClassRoster(schoolId, klass.id))
        );
        if (mounted) setStudents(rosters.flat());
      } catch (loadError) {
        if (mounted) setError(loadError);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [scopedClasses, schoolId]);

  if (!homeroomClasses.length) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Henüz sınıf öğretmeni olduğunuz bir şube yok.</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Sınıfım</h1>
        <p className="dash-subtitle">Sınıf öğretmeni olduğunuz şube(ler) için genel görünüm.</p>
      </header>

      {homeroomClasses.length > 1 ? (
        <div className="cur-assign-chips" role="tablist" aria-label="Şube">
          {homeroomClasses.map((klass) => (
            <button
              key={klass.id}
              type="button"
              role="tab"
              className={`cur-assign-chip${selectedClassId === klass.id ? ' cur-assign-chip--active' : ''}`}
              aria-selected={selectedClassId === klass.id}
              onClick={() => setSelectedClassId(klass.id)}
            >
              {formatClassLabel(klass.grade, klass.name)}
            </button>
          ))}
        </div>
      ) : null}

      <DirectorSubNav items={SECTIONS} active={section} onChange={setSection} />

      {error && <InlineError error={error} context="general" />}

      {loading ? (
        <section className="dash-card">
          <p className="dash-hint">Yükleniyor…</p>
        </section>
      ) : section === 'overview' ? (
        <DirectorAttendance
          schoolId={schoolId}
          students={students}
          classes={scopedClasses}
          atlasSchedule={atlasSchedule}
        />
      ) : section === 'students' ? (
        <CounselorStudentsTab
          students={students}
          classes={scopedClasses}
          schoolId={schoolId}
          school={school}
        />
      ) : section === 'guidance' ? (
        <CounselorGuidanceTab
          students={students}
          classes={scopedClasses}
          schoolId={schoolId}
          school={school}
        />
      ) : section === 'reports' ? (
        <ExamReportsPanel
          schoolId={schoolId}
          school={school}
          students={students}
          classes={scopedClasses}
        />
      ) : null}
    </>
  );
}
