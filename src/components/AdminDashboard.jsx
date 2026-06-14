import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { notifyParentsForMessage } from '../lib/sendPush';
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

const TARGET_GROUP = 'group';
const TARGET_STUDENT = 'student';
const TARGET_ALL = 'all';
const CHILD_NAME_PLACEHOLDER = '{{child_name}}';
const CHILD_DISPLAY_FALLBACK = 'Çocuğunuz';

function getFirstName(fullName) {
  if (!fullName?.trim()) return CHILD_DISPLAY_FALLBACK;
  return fullName.trim().split(/\s+/)[0];
}

function applyTemplateBody(templateBody, targetType, targetId, students) {
  let replacement = CHILD_DISPLAY_FALLBACK;

  if (targetType === TARGET_STUDENT && targetId) {
    const student = students.find((entry) => entry.id === targetId);
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

export default function AdminDashboard({ profile, onSignOut }) {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [messages, setMessages] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [dataWarning, setDataWarning] = useState(null);

  const [targetType, setTargetType] = useState(TARGET_GROUP);
  const [targetId, setTargetId] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const displayName = profile?.full_name ?? profile?.email ?? 'Yönetici';

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
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
      .limit(50);

    if (error) throw error;
    setMessages(data ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      setDataLoading(true);
      setDataError(null);
      setDataWarning(null);

      const [groupsRes, studentsRes, templatesRes] = await Promise.all([
        supabase.from('groups').select('id, name').order('name'),
        supabase.from('students').select('id, full_name').order('full_name'),
        supabase.from('message_templates').select('id, title, body').order('title'),
      ]);

      if (!mounted) return;

      const firstError =
        groupsRes.error ?? studentsRes.error ?? templatesRes.error ?? null;

      if (firstError) {
        setDataError(firstError);
        setDataLoading(false);
        return;
      }

      setGroups(groupsRes.data ?? []);
      setStudents(studentsRes.data ?? []);
      setTemplates(templatesRes.data ?? []);

      const warnings = [];
      if ((groupsRes.data ?? []).length === 0) {
        warnings.push(
          'Grup listesi boş. Supabase\'de kayıt varsa 004_groups_students_rls.sql dosyasını çalıştırın.'
        );
      }
      if ((studentsRes.data ?? []).length === 0) {
        warnings.push(
          'Öğrenci listesi boş. Supabase\'de kayıt varsa 004_groups_students_rls.sql dosyasını çalıştırın.'
        );
      }
      if (warnings.length > 0) {
        setDataWarning(warnings.join(' '));
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
  }, [fetchMessages]);

  useEffect(() => {
    if (targetType === TARGET_GROUP && groups.length > 0) {
      setTargetId((current) =>
        groups.some((group) => group.id === current) ? current : groups[0].id
      );
      return;
    }

    if (targetType === TARGET_STUDENT && students.length > 0) {
      setTargetId((current) =>
        students.some((student) => student.id === current) ? current : students[0].id
      );
      return;
    }

    if (targetType === TARGET_ALL) {
      setTargetId('');
    }
  }, [targetType, groups, students]);

  async function triggerPushNotifications({
    messageBody,
    pushTargetType,
    pushTargetId,
    bodiesByStudentId = null,
  }) {
    console.log('Push notification function triggered!', {
      targetType: pushTargetType,
      targetId: pushTargetId,
      messageBody,
      bodiesByStudentId,
      studentIds: students.map((student) => student.id),
    });

    const pushResult = await notifyParentsForMessage({
      targetType: pushTargetType,
      targetId: pushTargetId,
      students,
      body: messageBody,
      bodiesByStudentId,
    });

    console.log('Push notification result:', pushResult);
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

    if (targetType === TARGET_GROUP && !targetId) {
      setSubmitError('Lütfen bir sınıf seçin.');
      return;
    }

    if (targetType === TARGET_STUDENT && !targetId) {
      setSubmitError('Lütfen bir öğrenci seçin.');
      return;
    }

    if (targetType === TARGET_ALL && students.length === 0) {
      setSubmitError('Bildirim gönderilecek öğrenci bulunmuyor.');
      return;
    }

    setSending(true);

    try {
      if (targetType === TARGET_ALL) {
        const bodiesByStudentId = Object.fromEntries(
          students.map((student) => [
            student.id,
            trimmedBody.replaceAll(CHILD_NAME_PLACEHOLDER, getFirstName(student.full_name)),
          ])
        );

        const rows = students.map((student) => ({
          body: bodiesByStudentId[student.id],
          author_id: profile.id,
          student_id: student.id,
          group_id: null,
        }));

        const { error } = await supabase.from('messages').insert(rows);
        if (error) throw error;

        console.log('sendMessage: messages inserted successfully (all students)');

        let pushNote = '';
        try {
          const pushResult = await triggerPushNotifications({
            messageBody: trimmedBody,
            pushTargetType: TARGET_ALL,
            pushTargetId: null,
            bodiesByStudentId,
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
          `Mesaj ${students.length} öğrenciye başarıyla gönderildi!${pushNote}`
        );
      } else {
        const { error } = await supabase.from('messages').insert({
          body: trimmedBody,
          author_id: profile.id,
          student_id: targetType === TARGET_STUDENT ? targetId : null,
          group_id: targetType === TARGET_GROUP ? targetId : null,
        });
        if (error) throw error;

        console.log('sendMessage: message inserted successfully', {
          targetType,
          targetId,
          body: trimmedBody,
        });

        let pushNote = '';
        try {
          const pushResult = await triggerPushNotifications({
            messageBody: trimmedBody,
            pushTargetType: targetType,
            pushTargetId: targetId,
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

        setSubmitSuccess(`Mesaj başarıyla gönderildi!${pushNote}`);
      }

      setBody('');
      await fetchMessages();
    } catch (error) {
      console.error('sendMessage: failed before or during insert', error);
      setSubmitError(error);
    } finally {
      setSending(false);
    }
  }

  function handleTemplateClick(template) {
    setBody(applyTemplateBody(template.body, targetType, targetId, students));
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  if (dataLoading) {
    return (
      <>
        <AppNavbar brand="🎈 Kreş Yönetim" onSignOut={onSignOut} />
        <LoadingPanel message="Panel yükleniyor…" />
      </>
    );
  }

  if (dataError) {
    return (
      <>
        <AppNavbar brand="🎈 Kreş Yönetim" onSignOut={onSignOut} />
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
      <AppNavbar brand="🎈 Kreş Yönetim" onSignOut={onSignOut} />

      <main className="dash-page dash-page--flush">
        <header className="dash-header">
          <h1 className="dash-title">Yönetici Paneli</h1>
          <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
        </header>

        {dataWarning && <p className="dash-warning">{dataWarning}</p>}

        <section className="dash-card">
          <h2 className="dash-section-title">Yeni Mesaj Gönder</h2>

          <form className="dash-form" onSubmit={sendMessage}>
            <label className="dash-label">
              Gönderim hedefi
              <select
                className="dash-input"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                disabled={sending}
              >
                <option value={TARGET_GROUP}>Sınıf / Grup</option>
                <option value={TARGET_STUDENT}>Bireysel Öğrenci</option>
                <option value={TARGET_ALL}>Tüm Öğrenciler</option>
              </select>
            </label>

            {targetType === TARGET_GROUP && (
              <label className="dash-label">
                Sınıf Seçin
                <select
                  className="dash-input"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={sending || groups.length === 0}
                >
                  {groups.length === 0 ? (
                    <option value="">Grup bulunmuyor</option>
                  ) : (
                    groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            {targetType === TARGET_STUDENT && (
              <label className="dash-label">
                Öğrenci Seçin
                <select
                  className="dash-input"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={sending || students.length === 0}
                >
                  {students.length === 0 ? (
                    <option value="">Öğrenci bulunmuyor</option>
                  ) : (
                    students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            {targetType === TARGET_ALL && (
              <p className="dash-hint">
                Her öğrenci için ayrı bir mesaj oluşturulacak ({students.length} adet).
              </p>
            )}

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
      </main>
    </>
  );
}
