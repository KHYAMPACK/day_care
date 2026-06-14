import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isPushSupported, subscribeToWebPush } from '../lib/pushNotifications';
import { AppNavbar, ErrorMessage, InlineError, SuccessMessage, getMessageCategory, LoadingPanel } from './dashboardUi';
import { APP_NAME } from '../lib/branding';
import { formatChildTrackingTr, formatRelativeTimeTr } from '../utils/formatTime';

function getInitialNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

const MESSAGE_SELECT = `
  id,
  body,
  created_at,
  student_id,
  group_id,
  students ( full_name ),
  groups ( name )
`;

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
      'Çocuğunuz'
    );
  }
  if (message.group_id) {
    return message.groups?.name ?? groupNameById[message.group_id] ?? 'Sınıf';
  }
  return 'Bildirim';
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
              {formatRelativeTimeTr(message.created_at)}
            </time>
          </header>
          <p className="feed-body">{message.body}</p>
        </div>
      </article>
    </li>
  );
}

export default function ParentDashboard({ profile, onSignOut }) {
  const [students, setStudents] = useState([]);
  const [studentIds, setStudentIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessageIds, setNewMessageIds] = useState(() => new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedReady, setFeedReady] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState(
    getInitialNotificationPermission
  );
  const [pushSubscribing, setPushSubscribing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(null);
  const [pushError, setPushError] = useState(null);

  const displayName = profile?.full_name ?? profile?.email ?? 'Veli';
  const studentNames = useMemo(
    () => students.map((student) => student.full_name),
    [students]
  );

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

  async function handleEnableNotifications() {
    setPushSubscribing(true);
    setPushError(null);
    setPushSuccess(null);

    const { subscription, error: subscribeError } = await subscribeToWebPush();

    setPushSubscribing(false);

    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }

    if (subscribeError || !subscription) {
      setPushError(subscribeError ?? 'Bildirim aboneliği oluşturulamadı.');
      return;
    }

    setNotificationPermission('granted');
    setPushSuccess('Anlık bildirimler açıldı! Yeni mesajları anında alacaksınız.');
  }

  const showNotificationPrompt =
    isPushSupported() &&
    notificationPermission !== 'granted' &&
    notificationPermission !== 'unsupported';

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
        setError(linksError);
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
          setError(groupLinksError);
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
        setError(messagesError);
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
    return (
      <>
        <AppNavbar brand={`${APP_NAME} — Portal`} onSignOut={onSignOut} />
        <LoadingPanel message="Akışınız yükleniyor…" />
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppNavbar brand={`${APP_NAME} — Portal`} onSignOut={onSignOut} />
        <main className="dash-page dash-error-page">
          <ErrorMessage
            error={error}
            context="parent"
            onRetry={() => window.location.reload()}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <AppNavbar brand={`${APP_NAME} — Portal`} onSignOut={onSignOut} />

      <main className="dash-page dash-page--flush">
        <section className="welcome-card">
          <h1 className="welcome-card-title">Hoş geldiniz, {displayName}</h1>
          {studentNames.length > 0 ? (
            <p className="welcome-card-text">{formatChildTrackingTr(studentNames)}</p>
          ) : (
            <p className="welcome-card-text">
              Henüz hesabınıza bağlı bir çocuk bulunmuyor.
            </p>
          )}
        </section>

        {showNotificationPrompt && (
          <section className="notify-prompt-card">
            <p className="notify-prompt-text">
              Kreşten gelen güncellemeleri telefonunuza anında almak için bildirimleri
              açın.
            </p>
            <button
              type="button"
              className="notify-prompt-btn"
              onClick={handleEnableNotifications}
              disabled={pushSubscribing}
            >
              {pushSubscribing ? 'Açılıyor…' : '🔔 Anlık Bildirimleri Aç'}
            </button>
            {pushError && <InlineError error={pushError} context="subscribe" />}
          </section>
        )}

        {pushSuccess && <SuccessMessage message={pushSuccess} />}

        {students.length === 0 ? (
          <section className="empty-card">
            <h2 className="empty-title">Bağlı çocuk yok</h2>
            <p className="empty-text">
              Hesabınız henüz bir öğrenciyle eşleştirilmemiş. Lütfen kreş
              yöneticinizle iletişime geçin.
            </p>
          </section>
        ) : messages.length === 0 ? (
          <section className="empty-card">
            <h2 className="empty-title">Henüz mesaj yok</h2>
            <p className="empty-text">
              Kreş çocuğunuz için bildirim gönderdiğinde mesajlar burada anında
              görünecek.
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
    </>
  );
}
