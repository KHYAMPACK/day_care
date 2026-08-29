import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getDemoParentNotifications,
  isMissingParentNotificationsTable,
  loadParentNotifications,
  markParentNotificationRead,
} from '../../lib/parentNotifications';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';

export function useParentNotifications(parentId, { students = [], demoFallback = false } = {}) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(parentId));
  const [usingDemo, setUsingDemo] = useState(false);

  const refresh = useCallback(async () => {
    if (!parentId) {
      setItems([]);
      setLoading(false);
      setUsingDemo(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await loadParentNotifications(parentId);
      if (demoFallback && students.length > 0 && rows.length === 0) {
        setItems(getDemoParentNotifications(students));
        setUsingDemo(true);
        setError(null);
        return;
      }
      setItems(rows);
      setUsingDemo(false);
    } catch (loadError) {
      if (demoFallback && students.length > 0 && isMissingParentNotificationsTable(loadError)) {
        setItems(getDemoParentNotifications(students));
        setUsingDemo(true);
        setError(null);
      } else {
        setError(loadError);
        setItems([]);
        setUsingDemo(false);
      }
    } finally {
      setLoading(false);
    }
  }, [demoFallback, parentId, students]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items]
  );

  const markRead = useCallback(
    async (notificationId) => {
      setItems((current) =>
        current.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
            : item
        )
      );

      if (usingDemo || String(notificationId).startsWith('demo-')) {
        return;
      }

      try {
        await markParentNotificationRead(notificationId);
      } catch (markError) {
        setError(markError);
        await refresh();
      }
    },
    [refresh, usingDemo]
  );

  return { items, unreadCount, error, loading, refresh, markRead, usingDemo };
}

export function ParentNotificationsView({
  items,
  error,
  loading,
  showEmptyState = false,
  onOpenReport,
  onRefresh,
}) {
  if (loading) {
    return showEmptyState ? <p className="dash-hint">Bildirimler yükleniyor…</p> : null;
  }

  if (!items.length) {
    if (showEmptyState) {
      return <p className="dash-hint atlas-notifications-empty">Bildirim yok.</p>;
    }
    return null;
  }

  return (
    <div className="atlas-alerts parent-notifications">
      {error ? <InlineError error={error} context="general" /> : null}

      {items.map((item) => {
        const unread = !item.read_at;
        const studentName =
          item.students?.full_name ?? item.studentName ?? 'Çocuğunuz';
        const isHomework = item.kind === 'homework_assigned';
        const isTuition =
          item.kind === 'tuition_reminder' || item.kind === 'tuition_overdue';
        const actionLabel = isHomework
          ? 'Ödevi gör'
          : isTuition
            ? 'Ödeme durumu'
            : 'Özeti gör';

        return (
          <article
            key={item.id}
            className={`atlas-alert atlas-alert--activity${unread ? ' parent-notification--unread' : ''}`}
          >
            <Icon name={isTuition ? 'chart' : 'bell'} size={18} />
            <div className="atlas-alert__body">
              <p className="atlas-alert__title">{item.title ?? 'Haftalık özet hazır'}</p>
              <p className="atlas-alert__text">
                {item.body ?? `${studentName} için haftalık özet hazır.`}
              </p>
              <div className="atlas-alert__actions">
                {!isTuition ? (
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => onOpenReport?.(item)}
                  >
                    {actionLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => {
                      onOpenReport?.(item);
                      onRefresh?.();
                    }}
                  >
                    {actionLabel}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {onRefresh ? (
        <button type="button" className="demo-btn parent-notifications__refresh" onClick={onRefresh}>
          Yenile
        </button>
      ) : null}
    </div>
  );
}
