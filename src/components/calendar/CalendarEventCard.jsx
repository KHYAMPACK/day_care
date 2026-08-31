import {
  formatCalendarRangeTr,
  formatStartsAtTr,
  formatStudentGrade,
  getCalendarTypeMeta,
} from '../../lib/calendar';
import { Icon } from '../ui/Icon';

export default function CalendarEventCard({ event, canEdit, onEdit, onDelete, deleting }) {
  const meta = getCalendarTypeMeta(event.event_type);
  const time = formatStartsAtTr(event.starts_at);
  const grades = event.audience_grades?.length
    ? event.audience_grades.map((grade) => formatStudentGrade(grade)).join(', ')
    : 'Tüm okul';
  const dateLabel = formatCalendarRangeTr(event.starts_on, event.ends_on);

  return (
    <article className={`cal-event cal-event--${event.event_type}`}>
      <div className="cal-event__head">
        <div className="cal-event__head-main">
          <h3 className="cal-event__title">{event.title}</h3>
          <p className="cal-event__date">{dateLabel}</p>
        </div>
        <span className={`demo-pill cal-pill cal-pill--${event.event_type}`}>
          <Icon name={meta.icon} size={14} /> {meta.label}
        </span>
      </div>
      <p className="cal-event__meta">
        {time ? `${time} · ` : null}
        {grades}
      </p>
      {event.body ? <p className="cal-event__body">{event.body}</p> : null}
      {canEdit ? (
        <div className="ann-actions">
          <button type="button" className="demo-btn" onClick={() => onEdit(event)}>
            Düzenle
          </button>
          <button
            type="button"
            className="match-item__remove"
            onClick={() => onDelete(event)}
            disabled={deleting}
          >
            {deleting ? 'Siliniyor…' : 'Sil'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
