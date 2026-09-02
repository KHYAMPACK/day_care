import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  formatAssignmentLabel,
  formatPlannedUnitBanner,
  loadCurriculumContext,
  loadTeacherAssignments,
} from '../../lib/curriculum';
import { istanbulDateIso } from '../../lib/calendar';
import {
  loadAttendanceFlags,
  loadAttendanceSession,
  loadClassRoster,
  saveClassAttendance,
  snapshotForDate,
} from '../../lib/attendance';
import { recordSchoolActivity } from '../../lib/activityLog';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { ConfirmDialog } from '../ui/ConfirmDialog';

function formatAttendanceDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function TeacherAttendance({ profile, schoolId }) {
  const [assignments, setAssignments] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);
  const [students, setStudents] = useState([]);
  const [absentIds, setAbsentIds] = useState(() => new Set());
  const [flags, setFlags] = useState([]);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [assignmentId, setAssignmentId] = useState('');
  const [takenOn, setTakenOn] = useState(() => istanbulDateIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selected = assignments.find((row) => row.id === assignmentId) ?? assignments[0] ?? null;
  const subject = selected?.curriculum_subjects ?? null;
  const klass = selected?.classes ?? null;
  const subjectUnits = useMemo(
    () => units.filter((unit) => unit.subject_id === subject?.id),
    [units, subject]
  );
  const snapshot = useMemo(
    () =>
      snapshotForDate({
        units: subjectUnits,
        takenOn,
        weekPlans,
        subjectId: subject?.id,
        grade: klass?.grade,
      }),
    [subjectUnits, takenOn, weekPlans, subject?.id, klass?.grade]
  );
  const banner = formatPlannedUnitBanner(snapshot.planned);
  const classLabel = selected ? formatAssignmentLabel(selected) : '';
  const absentStudentNames = useMemo(
    () =>
      students.filter((student) => absentIds.has(student.id)).map((student) => student.full_name),
    [students, absentIds]
  );
  const presentCount = students.length - absentStudentNames.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadTeacherAssignments(profile.id);
      setAssignments(rows);
      setAssignmentId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? '';
      });
      const curriculum = await loadCurriculumContext(schoolId);
      setUnits(curriculum.units);
      setWeekPlans(curriculum.weekPlans);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [profile.id, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDay = useCallback(async () => {
    if (!klass?.id || !subject?.id || !takenOn) {
      setStudents([]);
      setAbsentIds(new Set());
      setFlags([]);
      setSessionLoaded(false);
      return;
    }
    setError(null);
    setSessionLoaded(false);
    try {
      const roster = await loadClassRoster(schoolId, klass.id);
      setStudents(roster);
      try {
        const [sessionPack, flagRows] = await Promise.all([
          loadAttendanceSession({ classId: klass.id, subjectId: subject.id, takenOn }),
          loadAttendanceFlags({ schoolId, classId: klass.id, subjectId: subject.id }),
        ]);
        const nextAbsent = new Set(
          (sessionPack.records ?? [])
            .filter((record) => record.status === 'absent')
            .map((record) => record.student_id)
        );
        setAbsentIds(nextAbsent);
        setFlags(flagRows);
        setSessionLoaded(Boolean(sessionPack.session));
      } catch (attendanceError) {
        setAbsentIds(new Set());
        setFlags([]);
        setSessionLoaded(false);
        throw attendanceError;
      }
    } catch (loadError) {
      setError(loadError);
    }
  }, [klass?.id, schoolId, subject?.id, takenOn]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  function toggleAbsent(studentId) {
    setSuccess(null);
    setAbsentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleSave(event) {
    event.preventDefault();
    if (!klass?.id || !subject?.id || !students.length) return;
    setConfirmOpen(true);
  }

  async function performSave() {
    if (!klass?.id || !subject?.id || !students.length) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveClassAttendance({
        classId: klass.id,
        subjectId: subject.id,
        takenOn,
        weekIndex: snapshot.weekIndex,
        unitId: snapshot.unitId,
        records: students.map((student) => ({
          student_id: student.id,
          status: absentIds.has(student.id) ? 'absent' : 'present',
        })),
      });
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'attendance',
        action: 'saved',
        summary: `Yoklama kaydedildi: ${klass.label ?? klass.name ?? 'Şube'} · ${students.length} öğrenci`,
      });
      setSuccess('Yoklama kaydedildi.');
      setSessionLoaded(true);
      setConfirmOpen(false);
      const flagRows = await loadAttendanceFlags({
        schoolId,
        classId: klass.id,
        subjectId: subject.id,
      });
      setFlags(flagRows);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Yoklama yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Yoklama</h1>
        <p className="dash-subtitle">
          Gelmeyen öğrencileri işaretleyin. Kayıt o günün konusuyla eşleşir.
        </p>
      </header>

      {error && <InlineError error={error} context="attendance" />}

      {assignments.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">
            Size atanmış şube ve ders yok. Müdürünüz Öğretmen Atama sekmesinden şube + ders
            eşleştirmesi yapsın.
          </p>
        </section>
      ) : (
        <>
          {assignments.length > 1 ? (
            <div className="cur-assign-chips" role="tablist" aria-label="Şube ve ders">
              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  type="button"
                  role="tab"
                  className={`cur-assign-chip${assignment.id === selected?.id ? ' cur-assign-chip--active' : ''}`}
                  onClick={() => setAssignmentId(assignment.id)}
                  aria-selected={assignment.id === selected?.id}
                >
                  {formatAssignmentLabel(assignment)}
                </button>
              ))}
            </div>
          ) : (
            <p className="dash-hint">{formatAssignmentLabel(selected)}</p>
          )}

          <section className="dash-card">
            <form className="dash-form" onSubmit={handleSave}>
              <label className="dash-label">
                Tarih
                <input
                  className="dash-input"
                  type="date"
                  value={takenOn}
                  onChange={(event) => setTakenOn(event.target.value)}
                  disabled={saving}
                />
              </label>

              <p className="att-banner">
                {banner ?? 'Bu tarihte planlı konu yok. Yoklama yine alınabilir.'}
              </p>

              {students.length === 0 ? (
                <p className="dash-hint">Bu şubede öğrenci yok.</p>
              ) : (
                <ul className="att-roster" aria-label="Yoklama listesi">
                  {students.map((student) => {
                    const absent = absentIds.has(student.id);
                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          className={`att-roster__btn${absent ? ' att-roster__btn--absent' : ''}`}
                          onClick={() => toggleAbsent(student.id)}
                          aria-pressed={absent}
                        >
                          <span>{student.full_name}</span>
                          <span className="att-roster__status">{absent ? 'Yok' : 'Var'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {success && <SuccessMessage message={success} />}

              <SendButton
                sending={saving}
                label={sessionLoaded ? 'Yoklamayı güncelle' : 'Yoklamayı kaydet'}
                sendingLabel="Kaydediliyor…"
                disabled={!students.length}
              />
            </form>
          </section>

          <section className="dash-card">
            <h2 className="dash-section-title">Geri kalanlar</h2>
            {flags.length === 0 ? (
              <p className="dash-hint">Bu ders için 2 gün ve üzeri konu kaçıran öğrenci yok.</p>
            ) : (
              <ul className="att-flag-list">
                {flags.map((flag) => (
                  <li key={`${flag.studentId}-${flag.unitId}`} className="att-flag">
                    <strong>{flag.studentName}</strong>
                    <span>
                      {flag.unitTitle} · {flag.absentCount} gün
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={sessionLoaded ? 'Yoklamayı güncelle' : 'Yoklamayı kaydet'}
        confirmLabel={sessionLoaded ? 'Güncelle' : 'Kaydet'}
        confirming={saving}
        onCancel={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={performSave}
      >
        <p className="app-dialog__lead">
          <strong>{classLabel}</strong> yoklamasını{' '}
          <strong>{formatAttendanceDate(takenOn)}</strong> tarihi için{' '}
          {sessionLoaded ? 'güncellemek' : 'kaydetmek'} istiyor musunuz?
        </p>
        {absentStudentNames.length === 0 ? (
          <p className="dash-hint">
            Yok olarak işaretlenen öğrenci yok. Tüm öğrenciler &ldquo;Var&rdquo; olarak
            kaydedilecek.
          </p>
        ) : (
          <>
            <p className="app-dialog__label">Yok olarak işaretlenen öğrenciler</p>
            <ul className="app-dialog__list">
              {absentStudentNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {presentCount > 0 ? (
              <p className="dash-hint">
                {presentCount} öğrenci &ldquo;Var&rdquo; olarak kaydedilecek.
              </p>
            ) : null}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
