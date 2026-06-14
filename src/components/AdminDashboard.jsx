import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
    return (
      <main style={styles.page}>
        <p>Loading dashboard…</p>
      </main>
    );
  }

  if (dataError) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>Could not load dashboard: {dataError}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.pageHeader}>
        <h1 style={styles.title}>Admin Dashboard</h1>
        <p style={styles.subtitle}>
          Welcome, {profile?.full_name ?? profile?.email ?? 'Admin'}.
        </p>
      </header>

      {dataWarning && <p style={styles.warning}>{dataWarning}</p>}

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Send notification</h2>

        <form style={styles.form} onSubmit={sendMessage}>
          <label style={styles.label}>
            Send to
            <select
              style={styles.input}
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
            <label style={styles.label}>
              Group
              <select
                style={styles.input}
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
            <label style={styles.label}>
              Student
              <select
                style={styles.input}
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
            <p style={styles.hint}>
              This will create one message per student ({students.length} total).
            </p>
          )}

          <label style={styles.label}>
            Message
            <p style={styles.labelText}>Templates</p>
            {templates.length === 0 ? (
              <p style={styles.hint}>No templates yet.</p>
            ) : (
              <div style={styles.templateScroll} role="list" aria-label="Message templates">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="listitem"
                    style={styles.templateChip}
                    onClick={() => handleTemplateClick(template)}
                    disabled={sending}
                  >
                    {template.title}
                  </button>
                ))}
              </div>
            )}
            <textarea
              style={styles.textarea}
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your notification…"
              disabled={sending}
              required
            />
          </label>

          {submitError && <p style={styles.error}>{submitError}</p>}
          {submitSuccess && <p style={styles.success}>{submitSuccess}</p>}

          <button style={styles.primaryButton} type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </form>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Sent messages</h2>

        {messages.length === 0 ? (
          <p style={styles.hint}>No messages sent yet.</p>
        ) : (
          <ul style={styles.historyList}>
            {messages.map((message) => (
              <li key={message.id} style={styles.historyItem}>
                <div style={styles.historyMeta}>
                  <strong>{formatMessageTarget(message)}</strong>
                  <span>{formatTimestamp(message.created_at)}</span>
                </div>
                <p style={styles.historyBody}>{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  pageHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
  },
  subtitle: {
    margin: 0,
    color: '#4b5563',
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.125rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  labelText: {
    margin: '0 0 0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  input: {
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontWeight: 400,
  },
  textarea: {
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    resize: 'vertical',
    fontWeight: 400,
    fontFamily: 'inherit',
  },
  templateScroll: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.375rem',
    marginBottom: '0.5rem',
    scrollbarWidth: 'thin',
  },
  templateChip: {
    flex: '0 0 auto',
    padding: '0.375rem 0.875rem',
    fontSize: '0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '999px',
    background: '#f9fafb',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    border: 'none',
    borderRadius: '6px',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
  },
  hint: {
    margin: 0,
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  error: {
    margin: 0,
    color: '#b91c1c',
  },
  warning: {
    margin: 0,
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    color: '#92400e',
    fontSize: '0.875rem',
  },
  success: {
    margin: 0,
    color: '#15803d',
  },
  historyList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  historyItem: {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '0.75rem',
  },
  historyMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    fontSize: '0.875rem',
    color: '#4b5563',
    marginBottom: '0.5rem',
  },
  historyBody: {
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
};
