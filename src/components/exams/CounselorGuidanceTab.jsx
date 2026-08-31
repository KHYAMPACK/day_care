import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClassLabel } from '../../lib/curriculum';
import { buildStudentDossierFromDb } from '../../lib/studentGapsData';
import { isDemoSchool } from '../../lib/parentDemoData';
import {
  getDemoCounselorStudent,
  getDemoCounselorStudentDossier,
  isDemoCounselorStudentId,
} from '../../lib/studentGapDemoData';
import CounselorGuidancePanel from '../gaps/CounselorGuidancePanel';
import { InlineError } from '../dashboardUi';

export default function CounselorGuidanceTab({
  students = [],
  classes = [],
  schoolId,
  school = null,
}) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dossier, setDossier] = useState(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState(null);
  const detailRef = useRef(null);

  const showDemoStudent = isDemoSchool(school);
  const demoStudent = showDemoStudent ? getDemoCounselorStudent() : null;

  const displayStudents = useMemo(() => {
    if (!demoStudent) return students;
    return [demoStudent, ...students.filter((row) => row.id !== demoStudent.id)];
  }, [students, demoStudent]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr');
    if (!query) return displayStudents;
    return displayStudents.filter((student) => {
      const klass = classMap.get(student.class_id);
      const classLabel = klass
        ? formatClassLabel(klass.grade, klass.name)
        : student.grade
          ? `${student.grade}-A`
          : '';
      const haystack = [student.full_name, student.student_number, classLabel]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr');
      return haystack.includes(query);
    });
  }, [displayStudents, searchQuery, classMap]);

  const selectedStudent =
    displayStudents.find((row) => row.id === selectedStudentId) ?? null;

  function selectStudent(studentId) {
    setSelectedStudentId((current) => (current === studentId ? '' : studentId));
  }

  useEffect(() => {
    if (!selectedStudentId || !detailRef.current) return;
    const isMobile = window.matchMedia('(max-width: 960px)').matches;
    if (!isMobile) return;
    const frame = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudent?.id) {
      setDossier(null);
      return;
    }

    if (isDemoCounselorStudentId(selectedStudent.id)) {
      setDossier(getDemoCounselorStudentDossier());
      setDossierLoading(false);
      setDossierError(null);
      return;
    }

    if (!schoolId) {
      setDossier(null);
      return;
    }

    let mounted = true;
    (async () => {
      setDossierLoading(true);
      setDossierError(null);
      try {
        const nextDossier = await buildStudentDossierFromDb({
          schoolId,
          student: selectedStudent,
          klass: classMap.get(selectedStudent.class_id) ?? null,
        });
        if (mounted) setDossier(nextDossier);
      } catch (loadError) {
        if (mounted) setDossierError(loadError);
      } finally {
        if (mounted) setDossierLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedStudent, schoolId, classMap]);

  return (
    <>
      <section className="counselor-guidance-mobile-notice dash-card" aria-live="polite">
        <span className="counselor-guidance-mobile-notice__badge">PC</span>
        <h2 className="counselor-guidance-mobile-notice__title">Bilgisayar gerekli</h2>
        <p className="counselor-guidance-mobile-notice__text">
          Rehberlik planı geniş tablolar içerir; bu sayfa telefon için uygun değildir. Soru takip,
          konu/kaynak matrisi ve haftalık programı düzenlemek için lütfen bir bilgisayardan giriş
          yapın.
        </p>
      </section>

      <div className="counselor-guidance-desktop">
      <header className="dash-header">
        <h1 className="dash-title">Rehberlik planı</h1>
        <p className="dash-subtitle">
          Haftalık soru takip, konu/kaynak matrisi ve çalışma programı
        </p>
      </header>

      <div
        className={`counselor-students-layout${
          selectedStudent ? ' counselor-students-layout--selected' : ''
        }`}
      >
        <section className="dash-card counselor-students-layout__list">
          <div className="counselor-students-toolbar">
            <input
              className="dash-input counselor-students-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Öğrenci, okul no veya şube ara…"
              aria-label="Öğrenci ara"
            />
            {searchQuery.trim() ? (
              <span className="counselor-students-toolbar__count">
                {filteredStudents.length}/{displayStudents.length}
              </span>
            ) : null}
          </div>

          {displayStudents.length === 0 ? (
            <p className="dash-hint">Kayıtlı öğrenci yok.</p>
          ) : filteredStudents.length === 0 ? (
            <p className="dash-hint">Aramanızla eşleşen öğrenci bulunamadı.</p>
          ) : (
            <div className="counselor-students-table-wrap">
              <table className="exam-ranking-table counselor-students-table">
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>Okul No</th>
                    <th>Şube</th>
                    <th className="counselor-students-table__action-col" />
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const klass = classMap.get(student.class_id);
                    const isDemoRow = student.isDemo || isDemoCounselorStudentId(student.id);
                    const isSelected = selectedStudentId === student.id;
                    return (
                      <tr
                        key={student.id}
                        className={[
                          isDemoRow ? 'counselor-student-row--demo' : '',
                          isSelected ? 'counselor-student-row--selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined}
                      >
                        <td>
                          {student.full_name}
                          {isDemoRow ? (
                            <span className="demo-pill demo-pill--sky">Örnek veri</span>
                          ) : null}
                        </td>
                        <td>{student.student_number ?? '—'}</td>
                        <td>
                          {klass
                            ? formatClassLabel(klass.grade, klass.name)
                            : student.grade
                              ? `${student.grade}-A`
                              : '—'}
                        </td>
                        <td className="counselor-students-table__action-col">
                          <button
                            type="button"
                            className={`demo-btn demo-btn--ghost${
                              isSelected ? ' demo-btn--active' : ''
                            }`}
                            onClick={() => selectStudent(student.id)}
                          >
                            Planla
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          ref={detailRef}
          className="dash-card counselor-students-layout__detail"
          id="counselor-guidance-detail"
        >
          {selectedStudent ? (
            <>
              <header className="counselor-students-detail__head counselor-students-detail__head--solo">
                <div>
                  <h2 className="dash-section-title">{selectedStudent.full_name}</h2>
                  <p className="dash-hint">
                    {classMap.get(selectedStudent.class_id)
                      ? formatClassLabel(
                          classMap.get(selectedStudent.class_id).grade,
                          classMap.get(selectedStudent.class_id).name
                        )
                      : selectedStudent.grade
                        ? `${selectedStudent.grade}. sınıf`
                        : '—'}
                  </p>
                </div>
              </header>

              {dossierLoading ? (
                <p className="dash-hint">Rehberlik planı yükleniyor…</p>
              ) : dossierError ? (
                <InlineError error={dossierError} context="general" />
              ) : (
                <CounselorGuidancePanel dossier={dossier} schoolId={schoolId} />
              )}
            </>
          ) : (
            <p className="dash-hint">Plan oluşturmak için listeden bir öğrenci seçin.</p>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
