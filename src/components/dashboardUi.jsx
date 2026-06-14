import { APP_ICON, APP_LOGO, APP_NAME } from '../lib/branding';

const CHIP_VARIANTS = ['lavender', 'mint', 'peach', 'sky'];

export function getTemplateChipVariant(index) {
  return CHIP_VARIANTS[index % CHIP_VARIANTS.length];
}

const CATEGORIES = {
  lunch: { key: 'lunch', label: 'Öğle Yemeği', icon: '🍽️' },
  nap: { key: 'nap', label: 'Uyku Saati', icon: '🌙' },
  pickup: { key: 'pickup', label: 'Alma Zamanı', icon: '🚗' },
  health: { key: 'health', label: 'Sağlık', icon: '💚' },
  trip: { key: 'trip', label: 'Gezi', icon: '🎒' },
  group: { key: 'group', label: 'Sınıf', icon: '🏫' },
  individual: { key: 'individual', label: 'Kişisel', icon: '✨' },
  default: { key: 'default', label: 'Güncelleme', icon: '💌' },
};

export function getMessageCategory(message) {
  const text = (message.body ?? '').toLowerCase();

  if (/lunch|snack|meal|ate|öğle|yemek|yedi|atıştırma/.test(text)) return CATEGORIES.lunch;
  if (/nap|rest|sleep|uyku|şekerleme|dinlendi/.test(text)) return CATEGORIES.nap;
  if (/pick\s?up|collect|pm today|alma|alın|topla|teslim/.test(text)) return CATEGORIES.pickup;
  if (/ill|sick|symptom|unwell|health|hasta|rahatsız|sağlık/.test(text)) return CATEGORIES.health;
  if (/field trip|outing|excursion|gezi|piknik/.test(text)) return CATEGORIES.trip;
  if (message.group_id && !message.student_id) return CATEGORIES.group;
  if (message.student_id) return CATEGORIES.individual;

  return CATEGORIES.default;
}

export function LoadingPanel({ message = 'Yükleniyor…' }) {
  return (
    <main className="dash-page">
      <div className="dash-loading">
        <div className="dash-spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </main>
  );
}

export function SendButton({
  sending,
  disabled,
  label = 'Mesaj Gönder',
  sendingLabel = 'Mesaj Gönderiliyor…',
}) {
  return (
    <button className="dash-send-btn" type="submit" disabled={disabled || sending}>
      {sending && <span className="dash-spinner" aria-hidden="true" />}
      {sending ? sendingLabel : label}
    </button>
  );
}

export function AppLogo({ variant = 'icon', className = '', alt = APP_NAME }) {
  const src = variant === 'full' ? APP_LOGO : APP_ICON;

  return (
    <img
      src={src}
      alt={alt}
      className={`app-logo app-logo--${variant}${className ? ` ${className}` : ''}`}
      width={variant === 'full' ? 220 : 32}
      height={variant === 'full' ? 220 : 32}
      decoding="async"
    />
  );
}

export function AppNavbar({ brand, onSignOut, signOutLabel = 'Çıkış Yap' }) {
  return (
    <nav className="app-navbar">
      <div className="app-navbar-brand">
        <AppLogo variant="icon" />
        <span>{brand}</span>
      </div>
      <button className="app-navbar-signout" type="button" onClick={onSignOut}>
        {signOutLabel}
      </button>
    </nav>
  );
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      <span aria-hidden="true">📡</span>
      Çevrimdışısınız — internet bağlantınızı kontrol edin.
    </div>
  );
}

export function ErrorMessage({ error, context = 'general', onRetry, retryLabel = 'Tekrar Dene' }) {
  const formatted = formatAppError(error, context);

  return (
    <div className={`error-card error-card--${formatted.type}`} role="alert">
      <span className="error-card__icon" aria-hidden="true">
        {formatted.icon}
      </span>
      {formatted.title && <h2 className="error-card__title">{formatted.title}</h2>}
      <p className="error-card__text">{formatted.message}</p>
      {onRetry && (
        <button type="button" className="error-card__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function InlineError({ error, context = 'general' }) {
  const formatted = formatAppError(error, context);

  return (
    <p className={`inline-error inline-error--${formatted.type}`} role="alert">
      <span className="inline-error__icon" aria-hidden="true">
        {formatted.icon}
      </span>
      <span>{formatted.message}</span>
    </p>
  );
}

export function SuccessMessage({ message }) {
  if (!message) return null;

  return (
    <p className="success-message" role="status">
      <span aria-hidden="true">✨</span>
      {message}
    </p>
  );
}
