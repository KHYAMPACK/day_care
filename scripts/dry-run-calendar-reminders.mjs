import { ATLAS_CALENDAR_EVENTS } from '../src/lib/atlasCalendar2026.js';
import { addDaysIso, buildReminderBody, istanbulDateIso } from '../src/lib/calendar.js';

const today = istanbulDateIso();
const tomorrow = addDaysIso(today, 1);
const sampleDay = '2026-09-18';
const sampleTomorrow = addDaysIso(sampleDay, 1);

function startingOn(iso) {
  return ATLAS_CALENDAR_EVENTS.filter((event) => event.starts_on === iso && event.notify);
}

console.log(JSON.stringify({
  today,
  tomorrow,
  tomorrowMatches: startingOn(tomorrow).map((event) => ({
    title: event.title,
    body: buildReminderBody(event),
  })),
  sampleEvening: sampleDay,
  sampleMatches: startingOn(sampleTomorrow).map((event) => ({
    title: event.title,
    body: buildReminderBody(event),
  })),
}, null, 2));
