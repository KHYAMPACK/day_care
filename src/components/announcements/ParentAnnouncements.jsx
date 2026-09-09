import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { InlineError } from '../dashboardUi';
import { formatRelativeTimeTr } from '../../utils/formatTime';
import { ANNOUNCEMENT_SELECT, sortAnnouncements } from '../../lib/announcements';
import { getDemoParentAnnouncements } from '../../lib/parentDemoData';

export default function ParentAnnouncements({ profile, schoolId, allowDemo = true }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await withSchoolFilter(
      supabase
        .from('announcements')
        .select(ANNOUNCEMENT_SELECT)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      schoolId
    );

    if (loadError) {
      setError(loadError);
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    setAnnouncements(sortAnnouncements(data ?? []));
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!profile?.id || !schoolId) return undefined;

    const channel = supabase
      .channel(`parent-announcements-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        async (payload) => {
          const incoming = payload.new ?? payload.old;
          if (incoming?.school_id && incoming.school_id !== schoolId) return;

          if (payload.eventType === 'DELETE' && payload.old?.id) {
            setAnnouncements((current) => current.filter((item) => item.id !== payload.old.id));
            return;
          }

          if (!payload.new?.id) return;

          const { data: row } = await withSchoolFilter(
            supabase
              .from('announcements')
              .select(ANNOUNCEMENT_SELECT)
              .eq('id', payload.new.id)
              .maybeSingle(),
            schoolId
          );

          if (!row) return;

          setAnnouncements((current) =>
            sortAnnouncements([row, ...current.filter((item) => item.id !== row.id)])
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, schoolId]);

  const displayAnnouncements =
    announcements.length > 0
      ? announcements
      : allowDemo
        ? getDemoParentAnnouncements()
        : [];
  const showingDemo = announcements.length === 0 && displayAnnouncements.length > 0;

  return (
    <section className="demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Duyurular</h1>
        <p className="dash-subtitle">Öğretmeninizin sınıfına yayınladığı notlar. Yalnızca okuyabilirsiniz.</p>
      </header>

      {error && <InlineError error={error} context="parent" />}

      {loading ? (
        <p className="dash-hint">Duyurular yükleniyor…</p>
      ) : displayAnnouncements.length === 0 ? (
        <p className="dash-hint">Henüz bir duyuru yok.</p>
      ) : (
        <>
          {showingDemo ? (
            <p className="parent-demo-note">
              <span className="demo-pill demo-pill--lavender">Demo önizleme</span>
              Gerçek duyuru geldiğinde bu örnekler otomatik kaybolur.
            </p>
          ) : null}
          {displayAnnouncements.map((item) => (
          <article
            key={item.id}
            className={`dash-card${item.pinned ? ' demo-card-pinned' : ''}`}
          >
            <div className="demo-row-between">
              <h2 className="dash-section-title">{item.title}</h2>
              {item.pinned && <span className="demo-pill demo-pill--lavender">Sabit</span>}
            </div>
            <p className="dash-hint">{item.body}</p>
            <p className="demo-meta">
              {item.author_name || 'Öğretmen'} · {formatRelativeTimeTr(item.created_at)}
            </p>
          </article>
          ))}
        </>
      )}
    </section>
  );
}
