import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getMessageCategory, LoadingPanel } from './dashboardUi';

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

function FeedItem({ message, studentNameById, groupNameById, isNew, onAnimationEnd }) {
  const category = getMessageCategory(message);

  return (
    <li
      className={isNew ? 'feed-item-enter' : undefined}
      onAnimationEnd={isNew ? onAnimationEnd : undefined}
    >
      <article className={`feed-card feed-card--${category.key}`}>
        <div className={`feed-badge feed-badge--${category.key}`} aria-hidden="true">
          {category.icon}
        </div>
        <div className="feed-content">
          <header className="feed-header">
            <div>
              <span className="feed-label">
                {getMessageLabel(message, studentNameById, groupNameById)}
              </span>
              <span className="feed-category">{category.label}</span>
            </div>
            <time className="feed-time" dateTime={message.created_at}>
              {formatTimestamp(message.created_at)}
            </time>
          </header>
          <p className="feed-body">{message.body}</p>
        </div>
      </article>
    </li>
  );
}

export default function ParentDashboard({ profile }) {
  const [students, setStudents] = useState([]);
  const [studentIds, setStudentIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessageIds, setNewMessageIds] = useState(() => new Set());

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

  function clearNewMessageAnimation(messageId) {
    setNewMessageIds((current) => {
      if (!current.has(messageId)) return current;
      const next = new Set(current);
      next.delete(messageId);
      return next;
    });
  }

  useEffect(() => {
    let mounted = true;

    async function loadParentFeed() {
      setLoading(true);
      setError(null);
      setFeedReady(false);
      setNewMessageIds(new Set());

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

          setNewMessageIds((current) => new Set(current).add(enrichedMessage.id));

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
    return <LoadingPanel message="Loading your feed…" />;
  }

  if (error) {
    return (
      <main className="dash-page">
        <p className="dash-error">Could not load feed: {error}</p>
      </main>
    );
  }

  return (
    <main className="dash-page">
      <header className="dash-header">
        <h1 className="dash-title">Updates</h1>
        <p className="dash-subtitle">
          Welcome, {profile?.full_name ?? profile?.email ?? 'Parent'}.
        </p>
        {students.length > 0 && (
          <p className="dash-meta">
            Following updates for{' '}
            {students.map((student) => student.full_name).join(', ')}
          </p>
        )}
      </header>

      {students.length === 0 ? (
        <section className="empty-card">
          <h2 className="empty-title">No children linked</h2>
          <p className="empty-text">
            Your account is not linked to any students yet. Contact the daycare admin
            to connect your profile.
          </p>
        </section>
      ) : messages.length === 0 ? (
        <section className="empty-card">
          <h2 className="empty-title">No messages yet</h2>
          <p className="empty-text">
            When the daycare sends notifications for your children, they will appear
            here instantly.
          </p>
        </section>
      ) : (
        <ol className="feed-list">
          {messages.map((message) => (
            <FeedItem
              key={message.id}
              message={message}
              studentNameById={studentNameById}
              groupNameById={groupNameById}
              isNew={newMessageIds.has(message.id)}
              onAnimationEnd={() => clearNewMessageAnimation(message.id)}
            />
          ))}
        </ol>
      )}
    </main>
  );
}
