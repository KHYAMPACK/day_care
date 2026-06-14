import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const MESSAGE_SELECT = `
  id,
  body,
  created_at,
  student_id,
  group_id,
  students ( full_name ),
  groups ( name )
`;

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString();
}

function messageAppliesToParent(message, studentIds, groupIds) {
  if (message.student_id && studentIds.includes(message.student_id)) {
    return true;
  }
  if (message.group_id && groupIds.includes(message.group_id)) {
    return true;
  }
  return false;
}

function getMessageLabel(message, studentNameById, groupNameById) {
  if (message.student_id) {
    return (
      message.students?.full_name ??
      studentNameById[message.student_id] ??
      'Your child'
    );
  }
  if (message.group_id) {
    return message.groups?.name ?? groupNameById[message.group_id] ?? 'Classroom';
  }
  return 'Notification';
}

export default function ParentDashboard({ profile }) {
  const [students, setStudents] = useState([]);
  const [studentIds, setStudentIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedReady, setFeedReady] = useState(false);

  const studentNameById = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student.full_name])),
    [students]
  );

  const groupNameById = useMemo(() => {
    const map = {};
    students.forEach((student) => {
      student.groups?.forEach((group) => {
        map[group.id] = group.name;
      });
    });
    return map;
  }, [students]);

  const fetchMessages = useCallback(async (ids, gids) => {
    if (ids.length === 0) {
      return [];
    }

    const filters = [`student_id.in.(${ids.join(',')})`];
    if (gids.length > 0) {
      filters.push(`group_id.in.(${gids.join(',')})`);
    }

    const { data, error: messagesError } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .or(filters.join(','))
      .order('created_at', { ascending: false });

    if (messagesError) throw messagesError;
    return data ?? [];
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadParentFeed() {
      setLoading(true);
      setError(null);
      setFeedReady(false);

      const { data: links, error: linksError } = await supabase
        .from('student_parents')
        .select(
          `
          student_id,
          students (
            id,
            full_name
          )
        `
        )
        .eq('parent_id', profile.id);

      if (!mounted) return;

      if (linksError) {
        setError(linksError.message);
        setLoading(false);
        return;
      }

      const linkedStudents = (links ?? [])
        .map((link) => link.students)
        .filter(Boolean);

      const ids = linkedStudents.map((student) => student.id);

      let gids = [];
      if (ids.length > 0) {
        const { data: groupLinks, error: groupLinksError } = await supabase
          .from('student_groups')
          .select(
            `
            group_id,
            student_id,
            groups (
              id,
              name
            )
          `
          )
          .in('student_id', ids);

        if (!mounted) return;

        if (groupLinksError) {
          setError(groupLinksError.message);
          setLoading(false);
          return;
        }

        gids = [...new Set((groupLinks ?? []).map((row) => row.group_id))];

        const groupsByStudent = {};
        (groupLinks ?? []).forEach((row) => {
          if (!row.groups) return;
          if (!groupsByStudent[row.student_id]) {
            groupsByStudent[row.student_id] = [];
          }
          groupsByStudent[row.student_id].push(row.groups);
        });

        linkedStudents.forEach((student) => {
          student.groups = groupsByStudent[student.id] ?? [];
        });
      }

      setStudents(linkedStudents);
      setStudentIds(ids);
      setGroupIds(gids);

      try {
        const initialMessages = await fetchMessages(ids, gids);
        if (!mounted) return;
        setMessages(initialMessages);
        setFeedReady(true);
      } catch (messagesError) {
        if (!mounted) return;
        setError(messagesError.message);
      }

      setLoading(false);
    }

    loadParentFeed();

    return () => {
      mounted = false;
    };
  }, [profile.id, fetchMessages]);

  useEffect(() => {
    if (!feedReady || studentIds.length === 0) {
      return;
    }

    const channel = supabase
      .channel(`parent-messages-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const incoming = payload.new;

          if (!messageAppliesToParent(incoming, studentIds, groupIds)) {
            return;
          }

          const { data: enrichedMessage, error: enrichError } = await supabase
            .from('messages')
            .select(MESSAGE_SELECT)
            .eq('id', incoming.id)
            .maybeSingle();

          if (enrichError || !enrichedMessage) {
            return;
          }

          setMessages((current) => {
            if (current.some((message) => message.id === enrichedMessage.id)) {
              return current;
            }
            return [enrichedMessage, ...current];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [feedReady, profile.id, studentIds, groupIds]);

  if (loading) {
    return (
      <main style={styles.page}>
        <p>Loading your feed…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>Could not load feed: {error}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Updates</h1>
        <p style={styles.subtitle}>
          Welcome, {profile?.full_name ?? profile?.email ?? 'Parent'}.
        </p>
        {students.length > 0 && (
          <p style={styles.children}>
            Following updates for{' '}
            {students.map((student) => student.full_name).join(', ')}
          </p>
        )}
      </header>

      {students.length === 0 ? (
        <section style={styles.emptyCard}>
          <h2 style={styles.emptyTitle}>No children linked</h2>
          <p style={styles.emptyText}>
            Your account is not linked to any students yet. Contact the daycare admin
            to connect your profile.
          </p>
        </section>
      ) : messages.length === 0 ? (
        <section style={styles.emptyCard}>
          <h2 style={styles.emptyTitle}>No messages yet</h2>
          <p style={styles.emptyText}>
            When the daycare sends notifications for your children, they will appear
            here instantly.
          </p>
        </section>
      ) : (
        <ol style={styles.timeline}>
          {messages.map((message) => (
            <li key={message.id} style={styles.timelineItem}>
              <div style={styles.timelineDot} aria-hidden="true" />
              <article style={styles.messageCard}>
                <header style={styles.messageHeader}>
                  <span style={styles.messageLabel}>
                    {getMessageLabel(message, studentNameById, groupNameById)}
                  </span>
                  <time style={styles.messageTime} dateTime={message.created_at}>
                    {formatTimestamp(message.created_at)}
                  </time>
                </header>
                <p style={styles.messageBody}>{message.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

const styles = {
  page: {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: '1.5rem',
  },
  header: {
    marginBottom: '1.5rem',
  },
  title: {
    margin: '0 0 0.25rem',
    fontSize: '1.5rem',
  },
  subtitle: {
    margin: 0,
    color: '#4b5563',
  },
  children: {
    margin: '0.5rem 0 0',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  error: {
    color: '#b91c1c',
  },
  emptyCard: {
    border: '1px dashed #d1d5db',
    borderRadius: '8px',
    padding: '2rem 1.5rem',
    textAlign: 'center',
    background: '#f9fafb',
  },
  emptyTitle: {
    margin: '0 0 0.5rem',
    fontSize: '1.125rem',
  },
  emptyText: {
    margin: 0,
    color: '#6b7280',
    lineHeight: 1.5,
  },
  timeline: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  timelineItem: {
    display: 'grid',
    gridTemplateColumns: '1rem 1fr',
    gap: '0.75rem',
    alignItems: 'start',
  },
  timelineDot: {
    width: '0.75rem',
    height: '0.75rem',
    marginTop: '0.375rem',
    borderRadius: '50%',
    background: '#2563eb',
    justifySelf: 'center',
  },
  messageCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '1rem',
    background: '#fff',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '1rem',
    marginBottom: '0.5rem',
  },
  messageLabel: {
    fontWeight: 600,
    fontSize: '0.875rem',
    color: '#1f2937',
  },
  messageTime: {
    fontSize: '0.75rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  },
  messageBody: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
    color: '#374151',
  },
};
