import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { formatClassLabel, getTeacherSubjectSlug, getTeacherBransDisplay } from '../../lib/curriculum';
import {
  academicWeekIndex,
  loadAssessmentTypes,
  loadClassRoster,
  loadSessionDetails,
  loadTeacherWeekQuestionSessions,
  saveAtlasLessonActivity,
} from '../../lib/atlasLessons';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';
import { AnimatedView } from '../ui/AnimatedView';

function SessionCard({ session, completed, onSelect }) {
  const dateLabel = new Date(`${session.session_date}T12:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const classLabel = formatClassLabel(session.classes?.grade, session.classes?.name);
  const statusLabel =
    session.lesson_type === 'lecture' ? 'Konu anlatımı' : 'Test / Uygulama';
  return (
    <li
      className={`atlas-questions-list__item${completed ? ' atlas-questions-list__item--completed' : ''}`}
    >
      <div className="atlas-questions-session">
        <div className="atlas-questions-session__body">
          <span className="atlas-questions-session__class">{classLabel}</span>
          <span className="atlas-questions-session__meta">
            {dateLabel} · {session.slot_index}. ders · {session.curriculum_subjects?.name ?? 'Ders'}
          </span>
          {completed ? (
            <span className="demo-pill demo-pill--mint atlas-questions-session__status">
              {statusLabel}
            </span>
          ) : null}
        </div>
        <button type="button" className="demo-btn" onClick={() => onSelect(session)}>
          {completed ? 'Düzenle' : 'Soru gir'}
        </button>
      </div>
    </li>
  );
}

export default function TeacherAtlasQuestions({
  profile,
  schoolId,
  catchUpPreset,
  onCatchUpConsumed,
}) {
  const { refreshProfile } = useAuth();
  const subjectSlug = getTeacherSubjectSlug(profile);
  const bransDisplay = getTeacherBransDisplay(profile);
  const weekIndex = academicWeekIndex();

  const [pending, setPending] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [assessmentTypes, setAssessmentTypes] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [absentIds, setAbsentIds] = useState(() => new Set());
  const [lessonType, setLessonType] = useState('practice');
  const [assessmentTypeId, setAssessmentTypeId] = useState('');
  const [questionsTotal, setQuestionsTotal] = useState('20');
  const [studentResults, setStudentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const presentStudents = useMemo(
    () => students.filter((student) => !absentIds.has(student.id)),
    [students, absentIds]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshProfile();
      const [sessions, types] = await Promise.all([
        loadTeacherWeekQuestionSessions(profile.id, weekIndex),
        loadAssessmentTypes(schoolId),
      ]);
      setPending(sessions.pending);
      setCompleted(sessions.completed);
      setAssessmentTypes(types);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [profile.id, schoolId, weekIndex, refreshProfile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (assessmentTypes.length && !assessmentTypeId) {
      setAssessmentTypeId(assessmentTypes[0].id);
    }
  }, [assessmentTypes, assessmentTypeId]);

  useEffect(() => {
    if (!catchUpPreset?.sessionId || !catchUpPreset?.resumeActivity) return;
    let mounted = true;
    (async () => {
      try {
        const { session, attendance, results } = await loadSessionDetails(catchUpPreset.sessionId);
        if (!mounted || !session) return;
        setSelectedSession(session);
        setAbsentIds(
          new Set(attendance.filter((row) => row.status === 'absent').map((row) => row.student_id))
        );
        if (session.activity_completed_at) {
          setLessonType(session.lesson_type === 'practice' ? 'practice' : 'lecture');
          if (session.lesson_type === 'practice') {
            setAssessmentTypeId(session.assessment_type_id ?? assessmentTypes[0]?.id ?? '');
            setQuestionsTotal(String(session.questions_total ?? 20));
            const prefilled = {};
            for (const result of results) {
              prefilled[result.student_id] = {
                wrong: String(result.wrong_count ?? 0),
                blank: String(result.blank_count ?? 0),
              };
            }
            setStudentResults(prefilled);
          }
        } else {
          setLessonType('practice');
          setStudentResults({});
        }
        onCatchUpConsumed?.();
      } catch (loadError) {
        if (mounted) setError(loadError);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [catchUpPreset, onCatchUpConsumed, assessmentTypes]);

  useEffect(() => {
    if (!selectedSession?.class_id) {
      setStudents([]);
      return;
    }
    let mounted = true;
    loadClassRoster(schoolId, selectedSession.class_id)
      .then((roster) => {
        if (mounted) setStudents(roster);
      })
      .catch((loadError) => {
        if (mounted) setError(loadError);
      });
    return () => {
      mounted = false;
    };
  }, [selectedSession?.class_id, schoolId]);

  function closeSessionEditor() {
    setSelectedSession(null);
    setLessonType('practice');
    setStudentResults({});
    setSuccess(null);
    setError(null);
  }

  async function handleSelectSession(session) {
    setError(null);
    setSuccess(null);
    try {
      const { session: row, attendance, results } = await loadSessionDetails(session.id);
      setSelectedSession(row);
      setAbsentIds(
        new Set(attendance.filter((r) => r.status === 'absent').map((r) => r.student_id))
      );
      if (row.activity_completed_at) {
        setLessonType(row.lesson_type === 'practice' ? 'practice' : 'lecture');
        if (row.lesson_type === 'practice') {
          setAssessmentTypeId(row.assessment_type_id ?? assessmentTypes[0]?.id ?? '');
          setQuestionsTotal(String(row.questions_total ?? 20));
          const prefilled = {};
          for (const result of results) {
            prefilled[result.student_id] = {
              wrong: String(result.wrong_count ?? 0),
              blank: String(result.blank_count ?? 0),
            };
          }
          setStudentResults(prefilled);
        } else {
          setStudentResults({});
        }
      } else {
        setLessonType('practice');
        setStudentResults({});
      }
    } catch (loadError) {
      setError(loadError);
    }
  }

  async function handleSaveLecture() {
    if (!selectedSession?.id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAtlasLessonActivity({ sessionId: selectedSession.id, lessonType: 'lecture' });
      setSuccess('Konu anlatımı kaydedildi.');
      closeSessionEditor();
      await refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePractice(event) {
    event.preventDefault();
    if (!selectedSession?.id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const total = Number.parseInt(questionsTotal, 10);
      if (Number.isNaN(total) || total < 1) {
        throw new Error('Geçerli bir soru sayısı girin.');
      }
      const results = presentStudents.map((student) => {
        const row = studentResults[student.id] ?? { wrong: '0', blank: '0' };
        return {
          student_id: student.id,
          wrong_count: Number.parseInt(row.wrong, 10) || 0,
          blank_count: Number.parseInt(row.blank, 10) || 0,
        };
      });
      await saveAtlasLessonActivity({
        sessionId: selectedSession.id,
        lessonType: 'practice',
        assessmentTypeId,
        questionsTotal: total,
        results,
      });
      setSuccess('Soru kaydı tamamlandı.');
      closeSessionEditor();
      await refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (!subjectSlug) {
    return (
      <section className="director-panel atlas-questions">
        <h2 className="dash-section-title">Sorular</h2>
        <p className="dash-hint">
          Branşınız tanımlı değil. Müdürünüz Öğretmen Yönetimi sekmesinden branş ataması yapmalı.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="director-panel atlas-questions">
        <p className="dash-hint">Sorular yükleniyor…</p>
      </section>
    );
  }

  if (selectedSession) {
    const classLabel = formatClassLabel(
      selectedSession.classes?.grade,
      selectedSession.classes?.name
    );
    return (
      <AnimatedView viewKey="editor" enterOnMount={false}>
      <section className="director-panel atlas-questions">
        <header className="atlas-lessons__header">
          <button
            type="button"
            className="demo-btn demo-btn--ghost atlas-lessons__back"
            onClick={closeSessionEditor}
          >
            ← Liste
          </button>
          <h2 className="dash-section-title">
            {classLabel} · {selectedSession.slot_index}. ders
          </h2>
          <p className="dash-hint">
            {selectedSession.curriculum_subjects?.name ?? bransDisplay?.name}
          </p>
        </header>

        {error && <InlineError error={error} context="general" />}
        {success && <SuccessMessage message={success} />}

        <div className="dash-form">
          <h3 className="dash-section-title">Ders türü</h3>
          <div className="atlas-activity-type">
            <button
              type="button"
              className={`atlas-activity-type__btn${lessonType === 'practice' ? ' atlas-activity-type__btn--active' : ''}`}
              onClick={() => setLessonType('practice')}
            >
              Test / Uygulama
            </button>
            <button
              type="button"
              className={`atlas-activity-type__btn${lessonType === 'lecture' ? ' atlas-activity-type__btn--active' : ''}`}
              onClick={() => setLessonType('lecture')}
            >
              Konu Anlatımı
            </button>
          </div>

          {lessonType === 'lecture' ? (
            <div className="atlas-wrap-up__actions">
              <button
                type="button"
                className="demo-btn demo-btn--primary"
                disabled={saving}
                onClick={handleSaveLecture}
              >
                Konu anlatımı olarak kaydet
              </button>
            </div>
          ) : (
            <form onSubmit={handleSavePractice}>
              <label className="dash-label">
                Değerlendirme türü
                <select
                  className="dash-input"
                  value={assessmentTypeId}
                  onChange={(event) => setAssessmentTypeId(event.target.value)}
                >
                  {assessmentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dash-label">
                Toplam soru (sınıf geneli)
                <input
                  className="dash-input"
                  type="number"
                  min="1"
                  value={questionsTotal}
                  onChange={(event) => setQuestionsTotal(event.target.value)}
                />
              </label>
              <ul className="atlas-results-list">
                {presentStudents.map((student) => {
                  const row = studentResults[student.id] ?? { wrong: '0', blank: '0' };
                  return (
                    <li key={student.id} className="atlas-results-card">
                      <p className="atlas-results-card__name">{student.full_name}</p>
                      <div className="atlas-results-card__fields">
                        <label className="atlas-results-card__field">
                          <span className="atlas-results-card__label">Yanlış</span>
                          <input
                            className="dash-input"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={row.wrong}
                            onChange={(event) =>
                              setStudentResults((current) => ({
                                ...current,
                                [student.id]: { ...row, wrong: event.target.value },
                              }))
                            }
                            onBlur={(event) => {
                              if (event.target.value !== '') return;
                              setStudentResults((current) => ({
                                ...current,
                                [student.id]: { ...row, wrong: '0' },
                              }));
                            }}
                          />
                        </label>
                        <label className="atlas-results-card__field">
                          <span className="atlas-results-card__label">Boş</span>
                          <input
                            className="dash-input"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={row.blank}
                            onChange={(event) =>
                              setStudentResults((current) => ({
                                ...current,
                                [student.id]: { ...row, blank: event.target.value },
                              }))
                            }
                            onBlur={(event) => {
                              if (event.target.value !== '') return;
                              setStudentResults((current) => ({
                                ...current,
                                [student.id]: { ...row, blank: '0' },
                              }));
                            }}
                          />
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {presentStudents.length === 0 ? (
                <p className="dash-hint">Var olan öğrenci yok.</p>
              ) : (
                <SendButton sending={saving} label="Soruları kaydet" sendingLabel="Kaydediliyor…" />
              )}
            </form>
          )}
        </div>
      </section>
      </AnimatedView>
    );
  }

  return (
    <AnimatedView viewKey="list" enterOnMount={false}>
    <section className="director-panel atlas-questions">
      <header className="atlas-lessons__header">
        <h2 className="dash-section-title">Sorular</h2>
        <p className="dash-hint">
          {bransDisplay?.name ?? 'Branş'} — yoklama girdikten sonra ders türünü ve soru sayılarını
          buradan girin.
        </p>
      </header>

      {error && <InlineError error={error} context="general" />}
      {success && <SuccessMessage message={success} />}

      {pending.length === 0 && completed.length === 0 ? (
        <div className="atlas-questions-empty">
          <Icon name="file" size={32} />
          <p className="dash-hint">Bu hafta soru girişi bekleyen ders yok.</p>
          <p className="dash-hint">Ders sekmesinden yoklama kaydettikten sonra burada görünür.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 ? (
            <>
              <h3 className="dash-section-title">Bekleyen dersler</h3>
              <ul className="atlas-questions-list">
                {pending.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    completed={false}
                    onSelect={handleSelectSession}
                  />
                ))}
              </ul>
            </>
          ) : null}
          {completed.length > 0 ? (
            <>
              <h3 className="dash-section-title atlas-questions-completed-title">
                Tamamlanan dersler
              </h3>
              <ul className="atlas-questions-list">
                {completed.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    completed
                    onSelect={handleSelectSession}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
    </AnimatedView>
  );
}
