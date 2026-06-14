import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTemplateChipVariant, LoadingPanel, SendButton } from './dashboardUi';

const TARGET_GROUP = 'group';
const TARGET_STUDENT = 'student';
const TARGET_ALL = 'all';
const CHILD_NAME_PLACEHOLDER = '{{child_name}}';

function getFirstName(fullName) {
  if (!fullName?.trim()) return 'Your child';
  return fullName.trim().split(/\s+/)[0];
}

function applyTemplateBody(templateBody, targetType, targetId, students) {
  let replacement = 'Your child';

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
  if (message.student_id) return 'Individual student';
  if (message.group_id) return 'Group';
  return 'Unknown';
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString();
}

export default function AdminDashboard({ profile }) {
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
        setDataError(firstError.message);
        setDataLoading(false);
        return;
      }

      setGroups(groupsRes.data ?? []);
      setStudents(studentsRes.data ?? []);
      setTemplates(templatesRes.data ?? []);

      const warnings = [];
      if ((groupsRes.data ?? []).length === 0) {
        warnings.push(
          'Groups list is empty. If rows exist in Supabase, run supabase/migrations/004_groups_students_rls.sql.'
        );
      }
      if ((studentsRes.data ?? []).length === 0) {
        warnings.push(
          'Students list is empty. If rows exist in Supabase, run supabase/migrations/004_groups_students_rls.sql.'
        );
      }
      if (warnings.length > 0) {
        setDataWarning(warnings.join(' '));
      }

      try {
        await fetchMessages();
      } catch (error) {
        setDataError(error.message);
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

  async function sendMessage(event) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setSubmitError('Message body is required.');
      return;
    }

    if (targetType === TARGET_GROUP && !targetId) {
      setSubmitError('Please select a group.');
      return;
    }

    if (targetType === TARGET_STUDENT && !targetId) {
      setSubmitError('Please select a student.');
      return;
    }

    if (targetType === TARGET_ALL && students.length === 0) {
      setSubmitError('There are no students to notify.');
      return;
    }

    setSending(true);

    try {
      if (targetType === TARGET_ALL) {
        const rows = students.map((student) => ({
          body: trimmedBody.replaceAll(
            CHILD_NAME_PLACEHOLDER,
            getFirstName(student.full_name)
          ),
          author_id: profile.id,
          student_id: student.id,
          group_id: null,
        }));

        const { error } = await supabase.from('messages').insert(rows);
        if (error) throw error;

        setSubmitSuccess(`Message sent to all ${students.length} students.`);
      } else {
        const { error } = await supabase.from('messages').insert({
          body: trimmedBody,
          author_id: profile.id,
          student_id: targetType === TARGET_STUDENT ? targetId : null,
          group_id: targetType === TARGET_GROUP ? targetId : null,
        });
        if (error) throw error;

        setSubmitSuccess('Message sent successfully.');
      }

      setBody('');
      await fetchMessages();
    } catch (error) {
      setSubmitError(error.message);
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
    return <LoadingPanel message="Loading dashboard…" />;
  }

  if (dataError) {
    return (
      <main className="dash-page">
        <p className="dash-error">Could not load dashboard: {dataError}</p>
      </main>
    );
  }

  return (
    <main className="dash-page">
      <header className="dash-header">
        <h1 className="dash-title">Admin Dashboard</h1>
        <p className="dash-subtitle">
          Welcome, {profile?.full_name ?? profile?.email ?? 'Admin'}.
        </p>
      </header>

      {dataWarning && <p className="dash-warning">{dataWarning}</p>}

      <section className="dash-card">
        <h2 className="dash-section-title">Send notification</h2>

        <form className="dash-form" onSubmit={sendMessage}>
          <label className="dash-label">
            Send to
            <select
              className="dash-input"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              disabled={sending}
            >
              <option value={TARGET_GROUP}>Group / Classroom</option>
              <option value={TARGET_STUDENT}>Individual Student</option>
              <option value={TARGET_ALL}>All Students</option>
            </select>
          </label>

          {targetType === TARGET_GROUP && (
            <label className="dash-label">
              Group
              <select
                className="dash-input"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={sending || groups.length === 0}
              >
                {groups.length === 0 ? (
                  <option value="">No groups available</option>
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
              Student
              <select
                className="dash-input"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={sending || students.length === 0}
              >
                {students.length === 0 ? (
                  <option value="">No students available</option>
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
              This will create one message per student ({students.length} total).
            </p>
          )}

          <label className="dash-label">
            Message
            <span className="dash-label-inline">Templates</span>
            {templates.length === 0 ? (
              <p className="dash-hint">No templates yet.</p>
            ) : (
              <div className="template-scroll" role="list" aria-label="Message templates">
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
              placeholder="Write your notification…"
              disabled={sending}
              required
            />
          </label>

          {submitError && <p className="dash-error">{submitError}</p>}
          {submitSuccess && <p className="dash-success">{submitSuccess}</p>}

          <SendButton sending={sending} />
        </form>
      </section>

      <section className="dash-card">
        <h2 className="dash-section-title">Sent messages</h2>

        {messages.length === 0 ? (
          <p className="dash-hint">No messages sent yet.</p>
        ) : (
          <ul className="history-list">
            {messages.map((message) => (
              <li key={message.id} className="history-item">
                <div className="history-meta">
                  <strong>{formatMessageTarget(message)}</strong>
                  <span>{formatTimestamp(message.created_at)}</span>
                </div>
                <p className="history-body">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
