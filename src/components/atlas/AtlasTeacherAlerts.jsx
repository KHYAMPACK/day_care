import { useCallback, useEffect, useState } from 'react';
import { istanbulDateIso } from '../../lib/calendar';
import {
  ensureMissedDayPrompts,
  formatEmptySlotsList,
  loadAllPendingMissedDayPrompts,
  loadIncompleteActivities,
  resolveMissedDayPrompt,
  saveTeacherWasAbsent,
} from '../../lib/atlasAlerts';
import { formatClassLabel } from '../../lib/curriculum';
import { recordSchoolActivity } from '../../lib/activityLog';
import { supabase } from '../../lib/supabase';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';

export function useAtlasTeacherAlerts(teacherId) {
  const [missedPrompts, setMissedPrompts] = useState([]);
  const [incomplete, setIncomplete] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(teacherId));

  const refresh = useCallback(async () => {
    if (!teacherId) {
      setMissedPrompts([]);
      setIncomplete([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await ensureMissedDayPrompts(istanbulDateIso());
      const [prompts, activities] = await Promise.all([
        loadAllPendingMissedDayPrompts(teacherId),
        loadIncompleteActivities(teacherId),
      ]);
      setMissedPrompts(prompts);
      setIncomplete(activities);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalCount = missedPrompts.length + incomplete.length;

  return { missedPrompts, incomplete, error, loading, refresh, totalCount };
}

export function AtlasTeacherAlertsView({
  missedPrompts,
  incomplete,
  error,
  loading,
  hideQuestionAlerts = false,
  showEmptyState = false,
  onCatchUp,
  onRefresh,
  profile,
  schoolId,
}) {
  async function handleWasAbsent(promptDate, promptId) {
    try {
      await saveTeacherWasAbsent(promptDate);
      await resolveMissedDayPrompt(promptId);
      if (schoolId) {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'alert',
          action: 'responded',
          summary: 'Atlas uyarısı yanıtlandı: Okulda değildim',
          metadata: { promptDate },
        });
      }
      await onRefresh?.();
    } catch (actionError) {
      // Parent hook owns error state; refresh will surface failures on next load if needed.
      console.error('Atlas alert action failed', actionError);
    }
  }

  const visibleIncomplete = hideQuestionAlerts ? [] : incomplete;

  if (loading) {
    return showEmptyState ? <p className="dash-hint">Bildirimler yükleniyor…</p> : null;
  }

  if (!missedPrompts.length && !visibleIncomplete.length) {
    if (showEmptyState) {
      return <p className="dash-hint atlas-notifications-empty">Bildirim yok.</p>;
    }
    return null;
  }

  return (
    <div className="atlas-alerts">
      {error && <InlineError error={error} context="general" />}

      {missedPrompts.map((prompt) => (
        <article key={prompt.id} className="atlas-alert atlas-alert--missed">
          <Icon name="bell" size={18} />
          <div className="atlas-alert__body">
            <p className="atlas-alert__title">Yoklama girilmedi</p>
            <p className="atlas-alert__text">
              {new Date(`${prompt.prompt_date}T12:00:00`).toLocaleDateString('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              hiç yoklama girmediniz. Boş ders saatleri:{' '}
              <strong>{formatEmptySlotsList(prompt.empty_slots)}</strong>
            </p>
            <div className="atlas-alert__actions">
              {(prompt.empty_slots ?? []).map((slot, index) => (
                <button
                  key={`${slot.class_id}-${slot.slot_index}-${index}`}
                  type="button"
                  className="demo-btn"
                  onClick={() =>
                    onCatchUp?.({
                      sessionDate: prompt.prompt_date,
                      classId: slot.class_id,
                      slotIndex: slot.slot_index,
                    })
                  }
                >
                  {slot.class_label} · {slot.slot_index}. ders
                </button>
              ))}
              <button
                type="button"
                className="demo-btn demo-btn--ghost"
                onClick={() => handleWasAbsent(prompt.prompt_date, prompt.id)}
              >
                Okulda değildim
              </button>
            </div>
          </div>
        </article>
      ))}

      {visibleIncomplete.map((session) => (
        <article key={session.id} className="atlas-alert atlas-alert--activity">
          <Icon name="book" size={18} />
          <div className="atlas-alert__body">
            <p className="atlas-alert__title">Sorular girilmedi</p>
            <p className="atlas-alert__text">
              {formatClassLabel(session.classes?.grade, session.classes?.name)} · {session.slot_index}. ders (
              {session.curriculum_subjects?.name}) için soru girişi yapmadınız.
            </p>
            <div className="atlas-alert__actions">
              <button
                type="button"
                className="demo-btn"
                onClick={() =>
                  onCatchUp?.({
                    sessionId: session.id,
                    resumeActivity: true,
                    classId: session.class_id,
                    subjectId: session.subject_id,
                    slotIndex: session.slot_index,
                    sessionDate: session.session_date,
                  })
                }
              >
                Soru gir
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AtlasTeacherAlerts(props) {
  const alerts = useAtlasTeacherAlerts(props.teacherId);
  return (
    <AtlasTeacherAlertsView
      {...alerts}
      hideQuestionAlerts={props.hideQuestionAlerts}
      showEmptyState={props.showEmptyState}
      onCatchUp={props.onCatchUp}
      onRefresh={alerts.refresh}
      profile={props.profile}
      schoolId={props.schoolId}
    />
  );
}
