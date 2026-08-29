import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAppError, useOnlineStatus } from '../lib/errorMessages';
import { Avatar } from './ui/Avatar';
import { Icon } from './ui/Icon';

const CHIP_VARIANTS = ['lavender', 'mint', 'peach', 'sky'];

export function getTemplateChipVariant(index) {
  return CHIP_VARIANTS[index % CHIP_VARIANTS.length];
}

const CATEGORIES = {
  lunch: { key: 'lunch', label: 'Öğle Yemeği', icon: 'utensils' },
  nap: { key: 'nap', label: 'Uyku Saati', icon: 'moon' },
  pickup: { key: 'pickup', label: 'Alma Zamanı', icon: 'car' },
  health: { key: 'health', label: 'Sağlık', icon: 'heart' },
  trip: { key: 'trip', label: 'Gezi', icon: 'backpack' },
  group: { key: 'group', label: 'Sınıf', icon: 'school' },
  individual: { key: 'individual', label: 'Kişisel', icon: 'sparkle' },
  default: { key: 'default', label: 'Güncelleme', icon: 'mail' },
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
  className,
}) {
  return (
    <button
      className={['dash-send-btn', className].filter(Boolean).join(' ')}
      type="submit"
      disabled={disabled || sending}
    >
      {sending && <span className="dash-spinner" aria-hidden="true" />}
      {sending ? sendingLabel : label}
    </button>
  );
}

export function PageHeader({
  brand,
  schoolName,
  roleLabel,
  logoUrl,
  userName,
  onSignOut,
  signOutLabel = 'Çıkış Yap',
  onNotificationsClick,
  notificationCount = 0,
  notificationsOpen = false,
  notificationsLabel = 'Bildirimler',
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const profileRef = useRef(null);

  const parsed = useMemo(() => {
    if (schoolName) {
      return { name: schoolName.trim(), role: roleLabel?.trim() || null };
    }
    if (!brand) return { name: 'OkulTakip', role: null };
    const parts = brand.split(' — ');
    if (parts.length >= 2) {
      return { name: parts.slice(0, -1).join(' — ').trim(), role: parts.at(-1).trim() };
    }
    return { name: brand.trim(), role: null };
  }, [brand, roleLabel, schoolName]);

  const profileName = userName?.trim() || parsed.name;

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="page-header">
      <div className="page-header__profile" ref={profileRef}>
        <button
          type="button"
          className="page-header__brand page-header__brand-btn"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Profil menüsü"
        >
          <div className="page-header__logo-wrap" aria-hidden={logoUrl ? undefined : true}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="page-header__logo" />
            ) : (
              <span className="page-header__logo-fallback">
                <Avatar name={parsed.name} size={40} />
              </span>
            )}
          </div>
          <div className="page-header__titles">
            <p className="page-header__school">{parsed.name}</p>
            {parsed.role ? <p className="page-header__role">{parsed.role}</p> : null}
          </div>
        </button>
        {menuOpen ? (
          <div className="page-header__menu" role="menu">
            <p className="page-header__menu-name">{profileName}</p>
            {parsed.role ? <p className="page-header__menu-role">{parsed.role}</p> : null}
            {onSignOut ? (
              <button
                type="button"
                className="page-header__menu-signout"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
              >
                <Icon name="logout" size={16} />
                {signOutLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {onNotificationsClick ? (
        <button
          className="page-header__icon-btn page-header__icon-btn--notify"
          type="button"
          onClick={onNotificationsClick}
          aria-label={notificationsOpen ? 'Bildirimleri kapat' : notificationsLabel}
          title={notificationsOpen ? 'Bildirimleri kapat' : notificationsLabel}
          aria-expanded={notificationsOpen}
        >
          <Icon name={notificationsOpen ? 'x' : 'bell'} size={18} />
          {!notificationsOpen && notificationCount > 0 ? (
            <span className="page-header__notify-badge" aria-hidden="true">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </header>
  );
}

export function AppNavbar(props) {
  return <PageHeader {...props} />;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      <Icon name="wifi" size={16} />
      Çevrimdışısınız — internet bağlantınızı kontrol edin.
    </div>
  );
}

export function ErrorMessage({ error, context = 'general', onRetry, retryLabel = 'Tekrar Dene' }) {
  const formatted = formatAppError(error, context);

  return (
    <div className={`error-card error-card--${formatted.type}`} role="alert">
      <span className="error-card__icon" aria-hidden="true">
        <Icon name={formatted.icon} size={22} />
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
        <Icon name={formatted.icon} size={16} />
      </span>
      <span>{formatted.message}</span>
    </p>
  );
}

export function SuccessMessage({ message }) {
  if (!message) return null;

  return (
    <p className="success-message" role="status">
      <Icon name="check" size={16} />
      {message}
    </p>
  );
}
