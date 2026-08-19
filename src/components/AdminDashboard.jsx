import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withSchoolFilter } from '../lib/tenant';
import { notifyParentsForMessage } from '../lib/sendPush';
import { useAuth } from '../context/AuthContext';
import { getSchoolNavBrand } from '../lib/schoolTheme';
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
import { firstName, TEACHER_MODULES, TEACHER_TABS } from '../lib/demoData';
import {
  DemoBottomNav,
  DemoSubHeader,
  DemoToast,
  ModuleGrid,
  moduleTitle,
  useDemoNav,
} from './demo/DemoKit';
import { DemoScreen, TeacherClassHome } from './demo/DemoScreens';

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
  const demoNav = useDemoNav('home');

  const displayName = profile?.full_name ?? profile?.email ?? 'Öğretmen';
  const navBrand = getSchoolNavBrand(school, 'Öğretmen');
  const navLogoUrl = school?.logo_url ?? null;

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

      const [studentsRes, templatesRes] = await Promise.all([
        withSchoolFilter(
          supabase.from('students').select('id, full_name').order('full_name'),
          schoolId
        ),
        withSchoolFilter(
          supabase.from('message_templates').select('id, title, body, icon').order('title'),
          schoolId
        ),
      ]);

      if (!mounted) return;

      const firstError = studentsRes.error ?? templatesRes.error ?? null;

      if (firstError) {
        setDataError(firstError);
        setDataLoading(false);
        return;
      }

      setStudents(studentsRes.data ?? []);
      setTemplates(templatesRes.data ?? []);

      if ((studentsRes.data ?? []).length === 0) {
        setDataWarning(
          'Size atanan öğrenci bulunmuyor. Müdürünüzden sınıf ataması yapmasını isteyin.'
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
  }, [fetchMessages, schoolId]);

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

  if (dataLoading) {
    return (
      <>
        <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <LoadingPanel message="Panel yükleniyor…" />
      </>
    );
  }

  if (dataError) {
    return (
      <>
        <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
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
      <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
      <DemoToast message={demoNav.toast} />
      {demoNav.isModule && (
        <DemoSubHeader
          title={moduleTitle(demoNav.moduleId)}
          onBack={demoNav.closeModule}
        />
      )}

      <main className="dash-page dash-page--flush dash-page--tabbar">
        {demoNav.isModule ? (
          <DemoScreen
            id={demoNav.moduleId}
            role="teacher"
            childName={firstName(students[0]?.full_name, 'Elif')}
            students={students}
            notify={demoNav.notify}
          />
        ) : demoNav.tab === 'attendance' ? (
          <DemoScreen
            id="attendance"
            role="teacher"
            childName={firstName(students[0]?.full_name, 'Elif')}
            students={students}
            notify={demoNav.notify}
          />
        ) : demoNav.tab === 'more' ? (
          <ModuleGrid modules={TEACHER_MODULES} onOpen={demoNav.openModule} />
        ) : demoNav.tab === 'home' ? (
          <>
            <header className="dash-header">
              <h1 className="dash-title">Öğretmen Paneli</h1>
              <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
            </header>
            {dataWarning && <p className="dash-warning">{dataWarning}</p>}
            <TeacherClassHome
              students={students}
              onOpen={demoNav.openModule}
              notify={demoNav.notify}
            />
          </>
        ) : (
          <>
            <header className="dash-header">
              <h1 className="dash-title">Mesaj gönder</h1>
              <p className="dash-subtitle">Velilere anlık bildirim iletin.</p>
            </header>

            {dataWarning && <p className="dash-warning">{dataWarning}</p>}

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
                          {template.icon ? `${template.icon} ` : ''}
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
      </main>

      <DemoBottomNav
        tabs={TEACHER_TABS}
        active={demoNav.tab}
        onChange={demoNav.selectTab}
      />
    </>
  );
}
