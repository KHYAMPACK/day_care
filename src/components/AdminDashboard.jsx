import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withSchoolFilter } from '../lib/tenant';
import { notifyParentsForMessage } from '../lib/sendPush';
import { recordSchoolActivity } from '../lib/activityLog';
import { useAuth } from '../context/AuthContext';
import { useStaffHeader } from '../hooks/useStaffHeader';
import {
  AppNavbar,
  ErrorMessage,
  InlineError,
  SuccessMessage,
  getTemplateChipVariant,
  LoadingPanel,
  SendButton,
} from './dashboardUi';
import { formatRelativeTimeTr } from '../utils/formatTime';
import { getTeacherTabs, defaultTeacherTab } from '../lib/demoData';
import { hasAtlasSchedule, hasHomeworkTracking } from '../lib/schoolFeatures';
import { loadStudentsForTeacherAssignments } from '../lib/curriculum';
import { DemoBottomNav, getTabFromSearch, useDemoNav } from './demo/DemoKit';
import { Icon } from './ui/Icon';
import { Avatar } from './ui/Avatar';
import { AnimatedView } from './ui/AnimatedView';
import { usePresence } from '../lib/motion';
import TeacherAnnouncements from './announcements/TeacherAnnouncements';
import AcademicCalendar from './calendar/AcademicCalendar';
import TeacherCurriculum from './curriculum/TeacherCurriculum';
import TeacherClassTimetable from './curriculum/TeacherClassTimetable';
import TeacherAttendance from './attendance/TeacherAttendance';
import TeacherHomework from './homework/TeacherHomework';
import TeacherAtlasLessons from './atlas/TeacherAtlasLessons';
import TeacherAtlasQuestions from './atlas/TeacherAtlasQuestions';
import {
  AtlasTeacherAlertsView,
  useAtlasTeacherAlerts,
} from './atlas/AtlasTeacherAlerts';
import { uniqueGrades } from '../lib/calendar';

const TARGET_ALL = 'all';
const CHILD_NAME_PLACEHOLDER = '{{child_name}}';
const CHILD_DISPLAY_FALLBACK = 'Çocuğunuz';

function getFirstName(fullName) {
  if (!fullName?.trim()) return CHILD_DISPLAY_FALLBACK;
  return fullName.trim().split(/\s+/)[0];
}

function applyTemplateBody(templateBody, students, selectedStudentIds) {
  let replacement = CHILD_DISPLAY_FALLBACK;

  if (selectedStudentIds.length === 1) {
    const student = students.find((entry) => entry.id === selectedStudentIds[0]);
    if (student) {
      replacement = getFirstName(student.full_name);
    }
  }

  return templateBody.replaceAll(CHILD_NAME_PLACEHOLDER, replacement);
}

function formatMessageTarget(message) {
  if (message.student_id && message.students?.full_name) {
    return message.students.full_name;
  }
  if (message.group_id && message.groups?.name) {
    return message.groups.name;
  }
  if (message.student_id) return 'Bireysel öğrenci';
  if (message.group_id) return 'Grup';
  return 'Bilinmiyor';
}

function StudentPicker({
  students,
  selectedStudentIds,
  onToggleStudent,
  onToggleSelectAll,
  searchQuery,
  onSearchQueryChange,
  disabled,
}) {
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr');
    if (!query) return students;
    return students.filter((student) =>
      student.full_name.toLocaleLowerCase('tr').includes(query)
    );
  }, [students, searchQuery]);

  const allSelected = students.length > 0 && selectedStudentIds.length === students.length;

  return (
    <div className="student-picker">
      <p className="dash-label-inline">Alıcılar</p>
      <div className="student-picker-toolbar">
        <input
          className="dash-input student-picker-search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Öğrenci ara…"
          disabled={disabled || students.length === 0}
          aria-label="Öğrenci ara"
        />
        <button
          type="button"
          className="student-picker-select-all"
          onClick={onToggleSelectAll}
          disabled={disabled || students.length === 0}
        >
          {allSelected ? 'Seçimleri Kaldır' : 'Tüm Öğrencileri Seç'}
        </button>
      </div>

      {students.length === 0 ? (
        <p className="dash-hint">Gönderilecek öğrenci bulunmuyor.</p>
      ) : filteredStudents.length === 0 ? (
        <p className="dash-hint">Aramanızla eşleşen öğrenci yok.</p>
      ) : (
        <ul className="student-picker-list" role="list">
          {filteredStudents.map((student) => {
            const checked = selectedStudentIds.includes(student.id);
            return (
              <li key={student.id} role="listitem">
                <label
                  className={`student-picker-item${checked ? ' student-picker-item--checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="student-picker-checkbox"
                    checked={checked}
                    onChange={() => onToggleStudent(student.id)}
                    disabled={disabled}
                  />
                  <span className="student-picker-item__name">{student.full_name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="student-picker-count">
        {selectedStudentIds.length} / {students.length} öğrenci seçildi
      </p>
    </div>
  );
}

export default function AdminDashboard({ profile, schoolId, onSignOut }) {
  const { school } = useAuth();
  const atlasSchedule = hasAtlasSchedule(school);
  const homeworkTracking = hasHomeworkTracking(school);
  const teacherTabs = useMemo(
    () => getTeacherTabs(atlasSchedule, homeworkTracking),
    [atlasSchedule, homeworkTracking]
  );
  const [catchUpPreset, setCatchUpPreset] = useState(null);
  const [questionsCatchUp, setQuestionsCatchUp] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPresent = usePresence(notificationsOpen);
  const atlasAlerts = useAtlasTeacherAlerts(atlasSchedule ? profile?.id : null);
  const [students, setStudents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [messages, setMessages] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [dataWarning, setDataWarning] = useState(null);

  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [showMessages, setShowMessages] = useState(() => {
    const tab = getTabFromSearch(defaultTeacherTab(atlasSchedule));
    return tab === 'messages';
  });
  const demoNav = useDemoNav(defaultTeacherTab(atlasSchedule));

  const displayName = profile?.full_name ?? profile?.email ?? 'Öğretmen';
  const navLogoUrl = school?.logo_url ?? null;
  const schoolName = school?.name ?? 'OkulTakip';
  const viewerGrades = useMemo(() => uniqueGrades(students), [students]);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await withSchoolFilter(
      supabase
        .from('messages')
        .select(
          `
        id,
        body,
        created_at,
        student_id,
        group_id,
        students ( full_name ),
        groups ( name )
      `
        )
        .order('created_at', { ascending: false })
        .limit(50),
      schoolId
    );

    if (error) throw error;
    setMessages(data ?? []);
  }, [schoolId]);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      setDataLoading(true);
      setDataError(null);
      setDataWarning(null);

      let assignedStudents = [];
      try {
        assignedStudents = await loadStudentsForTeacherAssignments(profile?.id, schoolId, {
          atlasSchedule,
        });
      } catch (assignmentError) {
        if (mounted) {
          setDataError(assignmentError);
          setDataLoading(false);
        }
        return;
      }

      const templatesRes = await withSchoolFilter(
        supabase.from('message_templates').select('id, title, body, icon').order('title'),
        schoolId
      );

      if (!mounted) return;

      const firstError = templatesRes.error ?? null;

      if (firstError) {
        setDataError(firstError);
        setDataLoading(false);
        return;
      }

      setStudents(assignedStudents);
      setTemplates(templatesRes.data ?? []);

      if (assignedStudents.length === 0 && !atlasSchedule) {
        setDataWarning(
          'Size atanan şube yok. Müdür Yönetim → Şube Atama bölümünden şube ataması yapmalı.'
        );
      }

      try {
        await fetchMessages();
      } catch (error) {
        setDataError(error);
      }

      setDataLoading(false);
    }

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [atlasSchedule, fetchMessages, schoolId, profile?.id]);

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  function toggleSelectAllStudents() {
    setSelectedStudentIds((current) =>
      current.length === students.length ? [] : students.map((student) => student.id)
    );
  }

  async function triggerPushNotifications({ messageBody, bodiesByStudentId, studentIds }) {
    const pushResult = await notifyParentsForMessage({
      targetType: TARGET_ALL,
      targetId: null,
      students,
      studentIds,
      body: messageBody,
      bodiesByStudentId,
    });

    return pushResult;
  }

  async function sendMessage(event) {
    event.preventDefault();
    console.log('sendMessage: form submitted');

    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setSubmitError('Mesaj metni zorunludur.');
      return;
    }

    if (selectedStudentIds.length === 0) {
      setSubmitError('En az bir öğrenci seçin.');
      return;
    }

    const selectedStudents = students.filter((student) =>
      selectedStudentIds.includes(student.id)
    );

    setSending(true);

    try {
      const bodiesByStudentId = Object.fromEntries(
        selectedStudents.map((student) => [
          student.id,
          trimmedBody.replaceAll(CHILD_NAME_PLACEHOLDER, getFirstName(student.full_name)),
        ])
      );

      const rows = selectedStudents.map((student) => ({
        body: bodiesByStudentId[student.id],
        author_id: profile.id,
        student_id: student.id,
        group_id: null,
        school_id: schoolId,
      }));

      const { error } = await supabase.from('messages').insert(rows);
      if (error) throw error;

      const summaryLabel =
        selectedStudents.length === 1
          ? selectedStudents[0].full_name
          : `${selectedStudents.length} öğrenci`;
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'message',
        action: 'sent',
        summary: `Veliye mesaj gönderildi: ${summaryLabel}`,
      });

      let pushNote = '';
      try {
        const pushResult = await triggerPushNotifications({
          messageBody: trimmedBody,
          bodiesByStudentId,
          studentIds: selectedStudentIds,
        });

        if (!pushResult.skipped && pushResult.total > 0) {
          pushNote = ` (${pushResult.sent} anlık bildirim gönderildi)`;
        } else if (pushResult.skipped) {
          pushNote = ' (Mesaj kaydedildi; push abonesi bulunamadı)';
        }
      } catch (pushError) {
        console.error('sendMessage: push notification failed', pushError);
        pushNote = ' (Mesaj kaydedildi; anlık bildirim gönderilemedi.)';
      }

      setSubmitSuccess(
        `Mesaj ${selectedStudents.length} öğrenciye başarıyla gönderildi!${pushNote}`
      );

      setBody('');
      setSelectedStudentIds([]);
      await fetchMessages();
    } catch (error) {
      console.error('sendMessage: failed before or during insert', error);
      setSubmitError(error);
    } finally {
      setSending(false);
    }
  }

  function handleTemplateClick(template) {
    setBody(applyTemplateBody(template.body, students, selectedStudentIds));
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  function handleAlertCatchUp(preset) {
    setNotificationsOpen(false);
    if (preset.resumeActivity || preset.sessionId) {
      setQuestionsCatchUp(preset);
      demoNav.selectTab('questions');
    } else {
      setCatchUpPreset(preset);
      demoNav.selectTab('lessons');
    }
  }

  const { roleLabel, roleSwitcher } = useStaffHeader();

  const teacherNavbarProps = useMemo(
    () => ({
      schoolName,
      roleLabel,
      roleSwitcher,
      logoUrl: navLogoUrl,
      userName: displayName,
      onSignOut,
      ...(atlasSchedule
        ? {
            onNotificationsClick: () => setNotificationsOpen((open) => !open),
            notificationCount: atlasAlerts.totalCount,
            notificationsOpen,
          }
        : {}),
    }),
    [
      schoolName,
      roleLabel,
      roleSwitcher,
      navLogoUrl,
      displayName,
      onSignOut,
      atlasSchedule,
      atlasAlerts.totalCount,
      notificationsOpen,
    ]
  );

  useEffect(() => {
    if (atlasSchedule && profile?.id) {
      atlasAlerts.refresh();
    }
  }, [demoNav.tab, atlasSchedule, profile?.id, atlasAlerts.refresh]);

  if (dataLoading) {
    return (
      <>
        <AppNavbar {...teacherNavbarProps} />
        <LoadingPanel message="Panel yükleniyor…" />
      </>
    );
  }

  if (dataError) {
    return (
      <>
        <AppNavbar {...teacherNavbarProps} />
        <main className="dash-page dash-error-page">
          <ErrorMessage
            error={dataError}
            context="admin"
            onRetry={() => window.location.reload()}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <AppNavbar {...teacherNavbarProps} />

      {atlasSchedule && notificationsPresent ? (
        <div className={`atlas-notifications-layer${notificationsOpen ? '' : ' atlas-notifications-layer--out'}`}>
          <button
            type="button"
            className="atlas-notifications-backdrop"
            aria-label="Bildirimleri kapat"
            onClick={() => setNotificationsOpen(false)}
          />
          <section className="atlas-notifications-panel" aria-label="Bildirimler">
            <div className="atlas-notifications-panel__header">
              <h2 className="atlas-notifications-panel__title">Bildirimler</h2>
            </div>
            <AtlasTeacherAlertsView
              {...atlasAlerts}
              hideQuestionAlerts={false}
              showEmptyState
              onCatchUp={handleAlertCatchUp}
              onRefresh={atlasAlerts.refresh}
              profile={profile}
              schoolId={schoolId}
            />
          </section>
        </div>
      ) : null}

      <main className="dash-page dash-page--flush dash-page--tabbar">
        {atlasSchedule && profile?.id ? (
          <div className="atlas-alerts-inline">
            <AtlasTeacherAlertsView
              {...atlasAlerts}
              hideQuestionAlerts={demoNav.tab === 'questions'}
              compact
              onCatchUp={handleAlertCatchUp}
              onRefresh={atlasAlerts.refresh}
              profile={profile}
              schoolId={schoolId}
            />
          </div>
        ) : null}
        <AnimatedView viewKey={`${demoNav.tab}-${showMessages ? 'messages' : 'main'}`}>
        {demoNav.tab === 'questions' ? (
          <TeacherAtlasQuestions
            profile={profile}
            schoolId={schoolId}
            catchUpPreset={questionsCatchUp}
            onCatchUpConsumed={() => setQuestionsCatchUp(null)}
          />
        ) : demoNav.tab === 'announcements' ? (
          <TeacherAnnouncements
            profile={profile}
            schoolId={schoolId}
            students={students}
            templates={templates}
            enableParentMessages={atlasSchedule}
          />
        ) : demoNav.tab === 'calendar' ? (
          <AcademicCalendar schoolId={schoolId} viewerGrades={viewerGrades.length ? viewerGrades : null} />
        ) : demoNav.tab === 'curriculum' ? (
          <TeacherCurriculum profile={profile} schoolId={schoolId} atlasSchedule={atlasSchedule} />
        ) : demoNav.tab === 'homework' ? (
          <TeacherHomework profile={profile} schoolId={schoolId} atlasSchedule={atlasSchedule} />
        ) : demoNav.tab === 'schedule' ? (
          <TeacherClassTimetable schoolId={schoolId} />
        ) : demoNav.tab === 'lessons' ? (
          <TeacherAtlasLessons
            profile={profile}
            schoolId={schoolId}
            catchUpPreset={catchUpPreset}
            onCatchUpConsumed={() => setCatchUpPreset(null)}
          />
        ) : demoNav.tab === 'attendance' ? (
          <TeacherAttendance profile={profile} schoolId={schoolId} />
        ) : (
          <>
            <header className="dash-header">
              <h1 className="dash-title">{showMessages ? 'Mesaj gönder' : 'Sınıf'}</h1>
              <p className="dash-subtitle">
                {showMessages
                  ? 'Velilere anlık bildirim iletin.'
                  : `Hoş geldiniz, ${displayName}.`}
              </p>
            </header>
            {dataWarning && <p className="dash-warning">{dataWarning}</p>}

            {!showMessages ? (
            <section className="dash-card">
              <h2 className="dash-section-title">Sınıfınız</h2>
              {students.length === 0 ? (
                <p className="dash-hint">
                  {atlasSchedule
                    ? 'Henüz şubelerde öğrenci yok. Öğrenciler yerleştirildiğinde burada görünür.'
                    : 'Size atanan öğrenci yok. Müdürünüz Yönetim → Şube Atama bölümünden şube ataması yaptığında burada görünecek.'}
                </p>
              ) : (
                <>
                  <p className="dash-hint">
                    {students.length} öğrenci atandı. Velilere bildirim için{' '}
                    <strong>Mesaj gönder</strong>, sınıf duyurusu için{' '}
                    <strong>Duyurular</strong> sekmesini kullanın.
                  </p>
                  <button
                    type="button"
                    className="demo-btn demo-btn--primary home-msg-btn"
                    onClick={() => setShowMessages(true)}
                  >
                    Mesaj gönder
                  </button>
                  <ul className="student-pill-list">
                    {students.map((student) => (
                      <li key={student.id} className="student-pill">
                        <Avatar name={student.full_name} size={36} />
                        <strong className="student-pill__name">{student.full_name}</strong>
                        {student.grade ? (
                          <span className="student-pill__meta">{student.grade}. sınıf</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            ) : (
              <>
                <button
                  type="button"
                  className="demo-btn home-msg-back"
                  onClick={() => setShowMessages(false)}
                >
                  ← Sınıfa dön
                </button>

            <section className="dash-card">
              <h2 className="dash-section-title">Yeni Mesaj Gönder</h2>

              <form className="dash-form" onSubmit={sendMessage}>
                <StudentPicker
                  students={students}
                  selectedStudentIds={selectedStudentIds}
                  onToggleStudent={toggleStudentSelection}
                  onToggleSelectAll={toggleSelectAllStudents}
                  searchQuery={studentSearchQuery}
                  onSearchQueryChange={setStudentSearchQuery}
                  disabled={sending}
                />

                <label className="dash-label">
                  Mesaj
                  <span className="dash-label-inline">Şablonlar</span>
                  {templates.length === 0 ? (
                    <p className="dash-hint">Henüz şablon eklenmemiş.</p>
                  ) : (
                    <div className="template-scroll" role="list" aria-label="Mesaj şablonları">
                      {templates.map((template, index) => (
                        <button
                          key={template.id}
                          type="button"
                          role="listitem"
                          className={`template-chip template-chip--${getTemplateChipVariant(index)}`}
                          onClick={() => handleTemplateClick(template)}
                          disabled={sending}
                        >
                          {template.icon ? <Icon name={template.icon} size={14} /> : null}
                          {template.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="dash-textarea"
                    rows={6}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Bildiriminizi yazın…"
                    disabled={sending}
                    required
                  />
                </label>

                {submitError && <InlineError error={submitError} context="send" />}
                {submitSuccess && <SuccessMessage message={submitSuccess} />}

                <SendButton
                  sending={sending}
                  disabled={selectedStudentIds.length === 0}
                  label="Mesaj Gönder"
                  sendingLabel="Mesaj Gönderiliyor…"
                />
              </form>
            </section>

            <section className="dash-card">
              <h2 className="dash-section-title">Gönderilen Mesajlar</h2>

              {messages.length === 0 ? (
                <p className="dash-hint">Henüz mesaj gönderilmedi.</p>
              ) : (
                <ul className="history-list">
                  {messages.map((message) => (
                    <li key={message.id} className="history-item">
                      <div className="history-meta">
                        <strong>{formatMessageTarget(message)}</strong>
                        <span>{formatRelativeTimeTr(message.created_at)}</span>
                      </div>
                      <p className="history-body">{message.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
              </>
            )}
          </>
        )}
        </AnimatedView>
      </main>

      <DemoBottomNav
        tabs={teacherTabs}
        active={demoNav.tab}
        onChange={(tab) => {
          setShowMessages(false);
          setNotificationsOpen(false);
          demoNav.selectTab(tab);
        }}
      />
    </>
  );
}
