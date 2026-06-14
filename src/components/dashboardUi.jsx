const CHIP_VARIANTS = ['lavender', 'mint', 'peach', 'sky'];

export function getTemplateChipVariant(index) {
  return CHIP_VARIANTS[index % CHIP_VARIANTS.length];
}

const CATEGORIES = {
  lunch: { key: 'lunch', label: 'Lunch', icon: '🍽️' },
  nap: { key: 'nap', label: 'Nap Time', icon: '🌙' },
  pickup: { key: 'pickup', label: 'Pickup', icon: '🚗' },
  health: { key: 'health', label: 'Health', icon: '💚' },
  trip: { key: 'trip', label: 'Outing', icon: '🎒' },
  group: { key: 'group', label: 'Classroom', icon: '🏫' },
  individual: { key: 'individual', label: 'Personal', icon: '✨' },
  default: { key: 'default', label: 'Update', icon: '💌' },
};

export function getMessageCategory(message) {
  const text = (message.body ?? '').toLowerCase();

  if (/lunch|snack|meal|ate/.test(text)) return CATEGORIES.lunch;
  if (/nap|rest|sleep/.test(text)) return CATEGORIES.nap;
  if (/pick\s?up|collect|pm today/.test(text)) return CATEGORIES.pickup;
  if (/ill|sick|symptom|unwell|health/.test(text)) return CATEGORIES.health;
  if (/field trip|outing|excursion/.test(text)) return CATEGORIES.trip;
  if (message.group_id && !message.student_id) return CATEGORIES.group;
  if (message.student_id) return CATEGORIES.individual;

  return CATEGORIES.default;
}

export function LoadingPanel({ message = 'Loading…' }) {
  return (
    <main className="dash-page">
      <div className="dash-loading">
        <div className="dash-spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </main>
  );
}

export function SendButton({ sending, disabled, label = 'Send message' }) {
  return (
    <button className="dash-send-btn" type="submit" disabled={disabled || sending}>
      {sending && <span className="dash-spinner" aria-hidden="true" />}
      {sending ? 'Sending…' : label}
    </button>
  );
}
