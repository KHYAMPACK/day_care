import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withSchoolFilter } from '../lib/tenant';
import { isPushSupported, subscribeToWebPush } from '../lib/pushNotifications';
import { useAuth } from '../context/AuthContext';
import { hasAtlasSchedule, hasAccounting, hasHomeworkTracking } from '../lib/schoolFeatures';
import { usePresence } from '../lib/motion';
import { AppNavbar, ErrorMessage, InlineError, SuccessMessage, getMessageCategory, LoadingPanel } from './dashboardUi';
import { formatChildTrackingTr, formatRelativeTimeTr } from '../utils/formatTime';
import { getParentTabs } from '../lib/demoData';
import { DemoBottomNav, useDemoNav } from './demo/DemoKit';
import { AnimatedView } from './ui/AnimatedView';
import { AvatarStack } from './ui/Avatar';
import { Icon, IconWell } from './ui/Icon';
import ParentAnnouncements from './announcements/ParentAnnouncements';
import ParentTeacherWhatsApp from './announcements/ParentTeacherWhatsApp';
import AcademicCalendar, { TomorrowEventsCard } from './calendar/AcademicCalendar';
import ParentCurriculum, { ParentCurriculumRecap, useParentCurriculumRecap } from './curriculum/ParentCurriculum';
import ParentWeeklyReport from './attendance/ParentWeeklyReport';
import ParentExams from './exams/ParentExams';
import ParentHomework, { ParentHomeworkStrip } from './homework/ParentHomework';
import {
  ParentNotificationsView,
  useParentNotifications,
} from './parent/ParentNotifications';
import ParentTuitionStatus from './parent/ParentTuitionStatus';
import {
  CALENDAR_SELECT,
  addDaysIso,
  eventVisibleForGrades,
  istanbulDateIso,
  uniqueGrades,
} from '../lib/calendar';

const FEED_GROUPS = [
  { key: 'today', label: 'Bugün', variant: 'peach', icon: 'sun' },
  { key: 'yesterday', label: 'Dün', variant: 'lavender', icon: 'moon' },
  { key: 'week', label: 'Bu hafta', variant: 'sky', icon: 'calendar' },
  { key: 'older', label: 'Daha eski', variant: 'gray', icon: 'clock' },
];

function feedGroupKey(createdAt) {
  const day = istanbulDateIso(new Date(createdAt));
  const today = istanbulDateIso();
  if (day === today) return 'today';
  if (day === addDaysIso(today, -1)) return 'yesterday';
  if (day >= addDaysIso(today, -6)) return 'week';
  return 'older';
}

function groupFeedMessages(messages) {
  const buckets = { today: [], yesterday: [], week: [], older: [] };
  messages.forEach((message) => {
    buckets[feedGroupKey(message.created_at)].push(message);
  });
  return FEED_GROUPS.map((group) => ({ ...group, items: buckets[group.key] })).filter(
    (group) => group.items.length > 0
  );
}

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
        <IconWell name={category.icon} variant={category.key} />
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

export default function ParentDashboard({ profile, schoolId, onSignOut }) {
  const { school } = useAuth();
  const atlasSchedule = hasAtlasSchedule(school);
  const homeworkTracking = hasHomeworkTracking(school);
  const accountingEnabled = hasAccounting(school);
  const parentTabs = useMemo(() => getParentTabs(homeworkTracking), [homeworkTracking]);
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
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPresent = usePresence(notificationsOpen);
  const demoNav = useDemoNav('home');

  const navLogoUrl = school?.logo_url ?? null;
  const schoolName = school?.name ?? 'OkulTakip';
  const displayName = profile?.full_name ?? profile?.email ?? 'Veli';

  const demoFallbackNotifications = /demo/i.test(schoolName);
  const parentNotifications = useParentNotifications(profile.id, {
    students,
    demoFallback: demoFallbackNotifications,
  });
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

  const viewerGrades = useMemo(() => uniqueGrades(students), [students]);
  const curriculumRecap = useParentCurriculumRecap(students);
  const tomorrowEvents = useMemo(() => {
    const tomorrow = addDaysIso(istanbulDateIso(), 1);
    return calendarEvents.filter(
      (event) => event.starts_on === tomorrow && eventVisibleForGrades(event, viewerGrades)
    );
  }, [calendarEvents, viewerGrades]);

  const fetchMessages = useCallback(async (ids, gids) => {
    if (ids.length === 0) {
      return [];
    }

    const filters = [`student_id.in.(${ids.join(',')})`];
    if (gids.length > 0) {
      filters.push(`group_id.in.(${gids.join(',')})`);
    }

    const { data, error: messagesError } = await withSchoolFilter(
      supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .or(filters.join(','))
        .order('created_at', { ascending: false }),
      schoolId
    );

    if (messagesError) throw messagesError;
    return data ?? [];
  }, [schoolId]);

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
    setPushSuccess('Anlık bildirimler açıldı! Haftalık özet ve okul mesajlarını anında alacaksınız.');
  }

  function handleOpenWeeklyReport(notification) {
    parentNotifications.markRead(notification.id);
    setNotificationsOpen(false);
    if (notification.kind === 'homework_assigned') {
      demoNav.selectTab('homework');
      return;
    }
    demoNav.selectTab('home');
  }

  const parentNavbarProps = useMemo(
    () => ({
      schoolName,
      roleLabel: 'Veli',
      logoUrl: navLogoUrl,
      userName: displayName,
      onSignOut,
      onNotificationsClick: () => setNotificationsOpen((open) => !open),
      notificationCount: parentNotifications.unreadCount,
      notificationsOpen,
    }),
    [
      displayName,
      navLogoUrl,
      notificationsOpen,
      onSignOut,
      parentNotifications.unreadCount,
      schoolName,
    ]
  );

  useEffect(() => {
    if (profile?.id) {
      parentNotifications.refresh();
    }
  }, [demoNav.tab, profile?.id, parentNotifications.refresh]);

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
          students!inner (
            id,
            full_name,
            school_id,
            grade,
            class_id
          )
        `
        )
        .eq('parent_id', profile.id)
        .eq('students.school_id', schoolId);

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
  }, [profile.id, schoolId, fetchMessages]);

  useEffect(() => {
    let mounted = true;

    withSchoolFilter(
      supabase
        .from('calendar_events')
        .select(CALENDAR_SELECT)
        .order('starts_on', { ascending: true }),
      schoolId
    ).then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setCalendarEvents([]);
          return;
        }
        setCalendarEvents(data ?? []);
      });

    return () => {
      mounted = false;
    };
  }, [schoolId]);

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

          if (incoming.school_id !== schoolId) {
            return;
          }

          if (!messageAppliesToParent(incoming, studentIds, groupIds)) {
            return;
          }

          const { data: enrichedMessage, error: enrichError } = await withSchoolFilter(
            supabase.from('messages').select(MESSAGE_SELECT).eq('id', incoming.id),
            schoolId
          ).maybeSingle();

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
  }, [feedReady, profile.id, schoolId, studentIds, groupIds]);

  if (loading) {
    return (
      <>
        <AppNavbar {...parentNavbarProps} />
        <LoadingPanel message="Akışınız yükleniyor…" />
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppNavbar {...parentNavbarProps} />
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
      <AppNavbar {...parentNavbarProps} />

      {notificationsPresent ? (
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
            <ParentNotificationsView
              items={parentNotifications.items}
              error={parentNotifications.error}
              loading={parentNotifications.loading}
              showEmptyState
              onOpenReport={handleOpenWeeklyReport}
              onRefresh={parentNotifications.refresh}
            />
          </section>
        </div>
      ) : null}

      <main className="dash-page dash-page--flush dash-page--tabbar">
        <AnimatedView viewKey={demoNav.tab}>
        {demoNav.tab === 'announcements' ? (
          <ParentAnnouncements profile={profile} schoolId={schoolId} />
        ) : demoNav.tab === 'chat' ? (
          <ParentTeacherWhatsApp />
        ) : demoNav.tab === 'calendar' ? (
          <AcademicCalendar schoolId={schoolId} viewerGrades={viewerGrades} />
        ) : demoNav.tab === 'exams' ? (
          <ParentExams students={students} schoolId={schoolId} school={school} />
        ) : demoNav.tab === 'curriculum' ? (
          <ParentCurriculum students={students} />
        ) : demoNav.tab === 'homework' ? (
          <ParentHomework students={students} schoolId={schoolId} />
        ) : (
          <>
            <section className="page-hero">
              <h1 className="page-hero__title">Gün</h1>
              <p className="page-hero__subtitle">
                {new Intl.DateTimeFormat('tr-TR', {
                  timeZone: 'Europe/Istanbul',
                  day: 'numeric',
                  month: 'long',
                }).format(new Date())}
              </p>
              {studentNames.length > 0 ? <AvatarStack names={studentNames} size={42} /> : null}
              {studentNames.length > 0 ? (
                <p className="page-hero__subtitle">{formatChildTrackingTr(studentNames)}</p>
              ) : (
                <p className="page-hero__subtitle">Henüz hesabınıza bağlı bir çocuk bulunmuyor.</p>
              )}
            </section>

            <TomorrowEventsCard
              events={tomorrowEvents}
              onOpenCalendar={() => demoNav.selectTab('calendar')}
            />
            {homeworkTracking ? (
              <ParentHomeworkStrip
                students={students}
                schoolId={schoolId}
                onOpen={() => demoNav.selectTab('homework')}
              />
            ) : null}
            {accountingEnabled ? <ParentTuitionStatus parentId={profile.id} /> : null}
            <ParentWeeklyReport
              students={students}
              schoolId={schoolId}
              atlasSchedule={atlasSchedule}
              demoFallback={demoFallbackNotifications}
            />
            <ParentCurriculumRecap
              childrenData={curriculumRecap}
              onOpen={() => demoNav.selectTab('curriculum')}
            />
            {showNotificationPrompt && (
              <section className="notify-prompt-card">
                <div className="notify-prompt-head">
                  <IconWell name="bell" variant="lavender" />
                  <p className="notify-prompt-text">
                    Okuldan gelen güncellemeleri telefonunuza anında almak için bildirimleri
                    açın.
                  </p>
                </div>
                <button
                  type="button"
                  className="notify-prompt-btn"
                  onClick={handleEnableNotifications}
                  disabled={pushSubscribing}
                >
                  {pushSubscribing ? 'Açılıyor…' : 'Anlık Bildirimleri Aç'}
                </button>
                {pushError && <InlineError error={pushError} context="subscribe" />}
              </section>
            )}

            {pushSuccess && <SuccessMessage message={pushSuccess} />}

            {students.length === 0 ? (
              <section className="empty-card">
                <h2 className="empty-title">Bağlı çocuk yok</h2>
                <p className="empty-text">
                  Hesabınız henüz bir öğrenciyle eşleştirilmemiş. Lütfen okul
                  yöneticinizle iletişime geçin.
                </p>
              </section>
            ) : messages.length === 0 ? (
              <section className="empty-card">
                <h2 className="empty-title">Henüz mesaj yok</h2>
                <p className="empty-text">
                  Okul öğrenciniz için bildirim gönderdiğinde mesajlar burada anında
                  görünecek.
                </p>
              </section>
            ) : (
              groupFeedMessages(messages).map((group) => (
                <section key={group.key} className="feed-group">
                  <div className="feed-group__header">
                    <span className={`section-pill section-pill--${group.variant}`}>
                      <Icon name={group.icon} size={14} />
                      {group.label}
                      <span className="section-pill__count">({group.items.length})</span>
                    </span>
                  </div>
                  <ol className="feed-list">
                    {group.items.map((message) => (
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
                </section>
              ))
            )}
          </>
        )}
        </AnimatedView>
      </main>

      <DemoBottomNav
        tabs={parentTabs}
        active={demoNav.tab}
        onChange={demoNav.selectTab}
      />
    </>
  );
}
