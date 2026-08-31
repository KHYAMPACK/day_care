import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso } from '../../lib/calendar';
import {
  formatClassLabel,
  loadSchoolClasses,
  loadCurriculumSubjects,
  loadTeacherAssignments,
  getTeacherSubjectSlug,
  getTeacherBransDisplay,
  resolveSubjectForClass,
} from '../../lib/curriculum';
import {
  canEnterResults,
  createHomeworkAssignment,
  currentAcademicYear,
  deleteHomeworkAssignment,
  formatDateTr,
  grantedBooksForTargets,
  groupIndexByTopic,
  loadBookGrants,
  loadBookIndex,
  loadClassStudents,
  loadHomeworkBooks,
  loadHomeworkBundle,
  studentAssignmentStatus,
  studentHasBookGrant,
  totalsFromResults,
} from '../../lib/homework';
import { notifyHomeworkAssigned } from '../../lib/homeworkNotifications';
import { recordSchoolActivity } from '../../lib/activityLog';
import { supabase } from '../../lib/supabase';
import { buildClassHomeworkReport } from '../../lib/homeworkReports';
import AtlasClassPicker from '../atlas/AtlasClassPicker';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import ReportDonut, { reportDonutSegments } from '../attendance/ReportDonut';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const SUB_TABS = [
  { id: 'create', label: 'Ödev ver' },
  { id: 'status', label: 'Durum' },
  { id: 'report', label: 'Rapor' },
];

function addDaysIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export default function TeacherHomework({ profile, schoolId, atlasSchedule = false }) {
  const subjectSlug = getTeacherSubjectSlug(profile);
  const bransDisplay = getTeacherBransDisplay(profile);
  const [subTab, setSubTab] = useState('create');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [assignmentsRows, setAssignmentsRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [books, setBooks] = useState([]);
  const [grants, setGrants] = useState([]);
  const [bookId, setBookId] = useState('');
  const [topics, setTopics] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [startsOn, setStartsOn] = useState(() => istanbulDateIso());
  const [dueOn, setDueOn] = useState(() => addDaysIso(istanbulDateIso(), 7));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [bundle, setBundle] = useState({
    assignments: [],
    links: [],
    testLinks: [],
    results: [],
    tests: [],
    topics: [],
    books: [],
  });
  const [deleteId, setDeleteId] = useState(null);

  const academicYear = currentAcademicYear();
  const selectedClass = classes.find((row) => row.id === classId) ?? null;
  const classAssignments = useMemo(
    () => (atlasSchedule ? [] : assignmentsRows.filter((row) => row.class_id === classId)),
    [atlasSchedule, assignmentsRows, classId]
  );
  const [subjectId, setSubjectId] = useState('');
  const subject = atlasSchedule
    ? resolveSubjectForClass(subjects, subjectSlug, selectedClass?.grade)
    : classAssignments.find((row) => row.subject_id === subjectId)?.curriculum_subjects ??
      classAssignments[0]?.curriculum_subjects ??
      null;

  const availableBooks = useMemo(
    () =>
      grantedBooksForTargets({
        books: books.filter((book) => !subject || book.subject_id === subject.id),
        grants,
        classId,
        studentIds: selectedStudentIds,
      }),
    [books, grants, classId, selectedStudentIds, subject]
  );

  const groupedIndex = useMemo(() => groupIndexByTopic(topics, tests), [topics, tests]);
  const eligibleStudents = useMemo(
    () => students.filter((student) => !bookId || studentHasBookGrant(student, bookId, grants)),
    [students, bookId, grants]
  );

  useEffect(() => {
    if (!classAssignments.length) {
      setSubjectId('');
      return;
    }
    setSubjectId((current) =>
      current && classAssignments.some((row) => row.subject_id === current)
        ? current
        : classAssignments[0].subject_id
    );
  }, [classAssignments]);

  const loadRoster = useCallback(
    async (nextClassId) => {
      if (!nextClassId) {
        setStudents([]);
        setSelectedStudentIds([]);
        return;
      }
      const rows = await loadClassStudents(schoolId, nextClassId);
      setStudents(rows);
      setSelectedStudentIds(rows.map((row) => row.id));
    },
    [schoolId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let nextClasses = [];
      if (atlasSchedule) {
        if (subjectSlug) {
          const [all, catalogSubjects] = await Promise.all([
            loadSchoolClasses(schoolId),
            loadCurriculumSubjects(),
          ]);
          nextClasses = all;
          setSubjects(catalogSubjects);
        }
        setAssignmentsRows([]);
      } else {
        const rows = await loadTeacherAssignments(profile.id);
        setAssignmentsRows(rows);
        nextClasses = rows
          .map((row) => row.classes)
          .filter(Boolean)
          .filter((klass, index, list) => list.findIndex((item) => item.id === klass.id) === index);
      }
      setClasses(nextClasses);
      setClassId((current) =>
        current && nextClasses.some((row) => row.id === current) ? current : nextClasses[0]?.id ?? ''
      );

      const [bookRows, grantRows] = await Promise.all([
        loadHomeworkBooks(schoolId),
        loadBookGrants(schoolId, academicYear),
      ]);
      setBooks(bookRows);
      setGrants(grantRows);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [academicYear, atlasSchedule, profile.id, subjectSlug, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRoster(classId).catch((rosterError) => setError(rosterError));
  }, [classId, loadRoster]);

  useEffect(() => {
    if (!bookId) {
      setTopics([]);
      setTests([]);
      setSelectedTestIds([]);
      return undefined;
    }
    let cancelled = false;
    loadBookIndex(bookId)
      .then((index) => {
        if (cancelled) return;
        setTopics(index.topics);
        setTests(index.tests);
        setSelectedTestIds(index.tests.map((test) => test.id));
      })
      .catch((indexError) => {
        if (!cancelled) setError(indexError);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (availableBooks.length === 0) {
      setBookId('');
      return;
    }
    setBookId((current) =>
      current && availableBooks.some((book) => book.id === current)
        ? current
        : availableBooks[0].id
    );
  }, [availableBooks]);

  const refreshBundle = useCallback(async () => {
    if (!schoolId || !classId) {
      setBundle({
        assignments: [],
        links: [],
        testLinks: [],
        results: [],
        tests: [],
        topics: [],
        books: [],
      });
      return;
    }
    const next = await loadHomeworkBundle(schoolId, { classId });
    setBundle(next);
  }, [classId, schoolId]);

  useEffect(() => {
    if (subTab === 'status' || subTab === 'report') {
      refreshBundle().catch((bundleError) => setError(bundleError));
    }
  }, [refreshBundle, subTab]);

  const report = useMemo(
    () =>
      buildClassHomeworkReport({
        students,
        assignments: bundle.assignments,
        links: bundle.links,
        testLinks: bundle.testLinks,
        results: bundle.results,
        tests: bundle.tests,
        topics: bundle.topics,
      }),
    [bundle, students]
  );

  function toggleStudent(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  function toggleTopic(topic) {
    const ids = topic.tests.map((test) => test.id);
    const allOn = ids.every((id) => selectedTestIds.includes(id));
    setSelectedTestIds((current) =>
      allOn ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]
    );
  }

  function toggleTest(testId) {
    setSelectedTestIds((current) =>
      current.includes(testId) ? current.filter((id) => id !== testId) : [...current, testId]
    );
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!subject || !classId || !bookId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const recipients = selectedStudentIds.filter((id) =>
        eligibleStudents.some((student) => student.id === id)
      );
      if (!recipients.length) {
        throw new Error('Bu kitabı atayabileceğiniz öğrenci yok. Müdürden kitap ataması isteyin.');
      }
      if (!selectedTestIds.length) {
        throw new Error('En az bir test seçin.');
      }
      const assignment = await createHomeworkAssignment({
        schoolId,
        bookId,
        subjectId: subject.id,
        classId,
        createdBy: profile.id,
        studentIds: recipients,
        testIds: selectedTestIds,
        startsOn,
        dueOn,
        notes,
      });
      try {
        await notifyHomeworkAssigned({ assignmentId: assignment.id, schoolId });
      } catch {
        // Assignment is saved; notification is best-effort.
      }
      const classLabel = classes.find((row) => row.id === classId);
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'homework',
        action: 'assigned',
        summary: `Ödev atandı: ${
          classLabel ? formatClassLabel(classLabel.grade, classLabel.name) : 'Şube'
        } · ${subject?.name ?? 'Ders'}`,
        targetType: 'homework_assignment',
        targetId: assignment.id,
      });
      setSuccess('Ödev atandı. Veliler bilgilendirildi.');
      setNotes('');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteHomeworkAssignment(deleteId);
      setDeleteId(null);
      await refreshBundle();
    } catch (deleteError) {
      setError(deleteError);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Ödev modülü yükleniyor…</p>
      </section>
    );
  }

  if (atlasSchedule && !subjectSlug) {
    return (
      <section className="dash-card">
        <h1 className="dash-title">Ödev</h1>
        <p className="dash-hint">Branş atamanız yok. Müdürden branş ataması isteyin.</p>
      </section>
    );
  }

  if (!classId && atlasSchedule && classes.length > 0) {
    return (
      <AtlasClassPicker
        classes={classes}
        subjectName={bransDisplay?.name}
        hint="Ödev vereceğiniz şubeyi seçin."
        onSelectClass={setClassId}
      />
    );
  }

  if (atlasSchedule && classes.length > 1 && classId && !subject) {
    return (
      <section className="dash-card">
        <h1 className="dash-title">Ödev</h1>
        <p className="dash-hint">
          Seçilen sınıf için {bransDisplay?.name ?? 'branş'} müfredatı bulunamadı.
        </p>
        <button type="button" className="demo-btn" onClick={() => setClassId('')}>
          ← Sınıflar
        </button>
      </section>
    );
  }

  if (!atlasSchedule && !classId) {
    return (
      <section className="dash-card">
        <h1 className="dash-title">Ödev</h1>
        <p className="dash-hint">Atanmış şubeniz yok.</p>
      </section>
    );
  }

  return (
    <div className="homework-module demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Ödev</h1>
        <p className="dash-subtitle">
          {selectedClass ? formatClassLabel(selectedClass.grade, selectedClass.name) : 'Şube'}
          {subject ? ` · ${subject.name}` : ''}
        </p>
      </header>

      {error && <InlineError error={error} />}
      {success && <SuccessMessage message={success} />}

      {classes.length > 1 ? (
        <label className="dash-label">
          Şube
          <select className="dash-input" value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {formatClassLabel(klass.grade, klass.name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <nav className="homework-subtabs" aria-label="Ödev alt sekmeleri">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`homework-subtab${subTab === tab.id ? ' homework-subtab--active' : ''}`}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {subTab === 'create' && (
        <form className="dash-form dash-card" onSubmit={handleCreate}>
          {availableBooks.length === 0 ? (
            <p className="dash-hint">
              Bu şubeye atanmış kaynak kitap yok. Müdür Kitaplar sekmesinden kitap ataması yapmalı.
            </p>
          ) : (
            <>
              {!atlasSchedule && classAssignments.length > 1 ? (
                <label className="dash-label">
                  Ders
                  <select
                    className="dash-input"
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                  >
                    {classAssignments.map((row) => (
                      <option key={row.id} value={row.subject_id}>
                        {row.curriculum_subjects?.name ?? 'Ders'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="dash-label">
                Kitap
                <select
                  className="dash-input"
                  value={bookId}
                  onChange={(event) => setBookId(event.target.value)}
                >
                  {availableBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="homework-form-grid">
                <label className="dash-label">
                  Başlangıç
                  <input
                    className="dash-input"
                    type="date"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.target.value)}
                    required
                  />
                </label>
                <label className="dash-label">
                  Teslim
                  <input
                    className="dash-input"
                    type="date"
                    value={dueOn}
                    onChange={(event) => setDueOn(event.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="dash-label">
                Öğretmen notu
                <textarea
                  className="dash-textarea"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                />
              </label>

              <fieldset className="homework-fieldset">
                <legend>Öğrenciler</legend>
                <p className="dash-hint">
                  {selectedStudentIds.length} / {eligibleStudents.length} öğrenci · yalnızca kitabı
                  atanmış öğrenciler
                </p>
                <div className="homework-chip-row">
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => setSelectedStudentIds(eligibleStudents.map((row) => row.id))}
                  >
                    Tümü
                  </button>
                  <button type="button" className="demo-btn" onClick={() => setSelectedStudentIds([])}>
                    Hiçbiri
                  </button>
                </div>
                <ul className="homework-check-list">
                  {eligibleStudents.map((student) => (
                    <li key={student.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudent(student.id)}
                        />
                        {student.full_name}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <fieldset className="homework-fieldset">
                <legend>Konular ve testler</legend>
                {groupedIndex.length === 0 ? (
                  <p className="dash-hint">Bu kitabın indeksi boş. Müdür Excel yüklemeli.</p>
                ) : (
                  groupedIndex.map((topic) => {
                    const allOn = topic.tests.every((test) => selectedTestIds.includes(test.id));
                    return (
                      <div key={topic.id} className="homework-topic-block">
                        <label className="homework-topic-toggle">
                          <input type="checkbox" checked={allOn} onChange={() => toggleTopic(topic)} />
                          <strong>{topic.topic_name}</strong>
                          <span className="dash-hint">{topic.topic_code}</span>
                        </label>
                        <ul className="homework-check-list">
                          {topic.tests.map((test) => (
                            <li key={test.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={selectedTestIds.includes(test.id)}
                                  onChange={() => toggleTest(test.id)}
                                />
                                {test.test_name} ({test.question_count} soru)
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
                )}
              </fieldset>

              <SendButton sending={saving} label="Ödevi ata" sendingLabel="Atanıyor…" />
            </>
          )}
        </form>
      )}

      {subTab === 'status' && (
        <section className="dash-card">
          <h2 className="dash-section-title">Öğrenci durumu</h2>
          {bundle.assignments.length === 0 ? (
            <p className="dash-hint">Bu şubede ödev yok.</p>
          ) : (
            bundle.assignments.map((assignment) => {
              const book = bundle.books.find((row) => row.id === assignment.book_id);
              return (
                <div key={assignment.id} className="homework-status-block">
                  <div className="homework-card-head">
                    <div>
                      <h3>{book?.title ?? 'Ödev'}</h3>
                      <p className="dash-hint">
                        {formatDateTr(assignment.starts_on)} – {formatDateTr(assignment.due_on)}
                        {canEnterResults(assignment) ? '' : ' · kapalı'}
                      </p>
                    </div>
                    <button type="button" className="demo-btn" onClick={() => setDeleteId(assignment.id)}>
                      Sil
                    </button>
                  </div>
                  <ul className="homework-status-table">
                    {students
                      .filter((student) =>
                        bundle.links.some(
                          (link) =>
                            link.assignment_id === assignment.id && link.student_id === student.id
                        )
                      )
                      .map((student) => {
                      const status = studentAssignmentStatus({
                        assignment,
                        studentId: student.id,
                        testLinks: bundle.testLinks,
                        results: bundle.results,
                      });
                      const studentResults = bundle.results.filter(
                        (row) => row.assignment_id === assignment.id && row.student_id === student.id
                      );
                      const totals = totalsFromResults(studentResults);
                      return (
                        <li key={student.id} className={`homework-status-row homework-status-row--${status.key}`}>
                          <span>{student.full_name}</span>
                          <span>{status.label}</span>
                          <span>
                            {status.done}/{status.total}
                          </span>
                          <span>
                            D {totals.correct} · Y {totals.wrong} · B {totals.blank}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}

      {subTab === 'report' && (
        <section className="dash-card">
          <h2 className="dash-section-title">Sınıf raporu</h2>
          {report.classTotals.asked === 0 ? (
            <p className="dash-hint">Girilmiş sonuç yok.</p>
          ) : (
            <>
              <div className="homework-report-hero">
                <ReportDonut
                  segments={reportDonutSegments(report.classTotals)}
                  centerLabel={`%${report.classPercent ?? 0}`}
                  centerSub="doğru"
                  centerNumeric={report.classPercent ?? 0}
                  ariaLabel="Sınıf doğru oranı"
                />
                <p className="dash-hint">
                  D {report.classTotals.correct} · Y {report.classTotals.wrong} · B{' '}
                  {report.classTotals.blank}
                </p>
              </div>
              <h3 className="dash-section-title">Zayıf konular</h3>
              <ul className="homework-preview-list">
                {report.topicStats.slice(0, 8).map((row) => (
                  <li key={row.topic.id}>
                    <strong>{row.topic.topic_name}</strong>
                    <span className="dash-hint">%{row.percent ?? 0} doğru</span>
                  </li>
                ))}
              </ul>
              <h3 className="dash-section-title">Öğrenciler</h3>
              <ul className="homework-preview-list">
                {report.studentRows.map((row) => (
                  <li key={row.student.id}>
                    <strong>{row.student.full_name}</strong>
                    <span className="dash-hint">
                      {row.doneCount}/{row.assignmentCount} ödev ·{' '}
                      {row.percent == null ? 'sonuç yok' : `%${row.percent}`}
                      {row.overdueCount ? ` · ${row.overdueCount} gecikmiş` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Ödevi sil"
        confirmLabel="Sil"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      >
        Bu ödev ve girilmiş sonuçlar silinecek.
      </ConfirmDialog>
    </div>
  );
}
