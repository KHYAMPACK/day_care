const EMOJI_TO_NAME = {
  '🏠': 'home',
  '🏫': 'school',
  '📅': 'calendar',
  '📚': 'book',
  '📢': 'megaphone',
  '💬': 'message',
  '✅': 'check',
  '📊': 'chart',
  '👶': 'child',
  '📋': 'clipboard',
  '👩‍🏫': 'teacher',
  '🤝': 'users',
  '✨': 'sparkle',
  '💌': 'mail',
  '🍽️': 'utensils',
  '🌙': 'moon',
  '🚗': 'car',
  '💚': 'heart',
  '🎒': 'backpack',
  '🌸': 'flower',
  '🍼': 'bottle',
  '☀️': 'sun',
  '📡': 'wifi',
  '🔐': 'lock',
  '🔔': 'bell',
  '📱': 'phone',
  '🌿': 'leaf',
  '💭': 'thought',
  '📐': 'ruler',
  '🧪': 'flask',
  '🌍': 'globe',
  '📖': 'book',
  '🏖️': 'sun',
  '📝': 'file',
  '⛺': 'tent',
  '📗': 'book',
  '👨‍👩‍👧': 'users',
  '🎉': 'sparkle',
  '⭐': 'star',
  '🔗': 'link',
};

export const TEMPLATE_ICON_NAMES = [
  'mail',
  'utensils',
  'moon',
  'car',
  'heart',
  'backpack',
  'school',
  'sparkle',
  'flower',
  'megaphone',
  'bottle',
  'sun',
];

export function resolveIconName(name) {
  if (!name) return 'sparkle';
  if (EMOJI_TO_NAME[name]) return EMOJI_TO_NAME[name];
  return name;
}

function Glyph({ name }) {
  switch (name) {
    case 'home':
      return (
        <>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </>
      );
    case 'school':
      return (
        <>
          <path d="M3 10 12 4l9 6" />
          <path d="M5 11v8h14v-8" />
          <path d="M10 19v-5h4v5" />
        </>
      );
    case 'calendar':
      return (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z" />
          <path d="M5 5.5v16" />
        </>
      );
    case 'megaphone':
      return (
        <>
          <path d="M4 10v4h3l8 4V6L7 10z" />
          <path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" />
        </>
      );
    case 'message':
      return (
        <>
          <path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
        </>
      );
    case 'check':
      return <path d="M5 12.5 9.5 17 19 7" />;
    case 'chart':
      return (
        <>
          <path d="M4 19h16" />
          <path d="M7 16v-5" />
          <path d="M12 16V8" />
          <path d="M17 16v-8" />
        </>
      );
    case 'child':
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M6 20c.8-3.5 3-5.5 6-5.5s5.2 2 6 5.5" />
        </>
      );
    case 'clipboard':
      return (
        <>
          <rect x="6" y="5" width="12" height="16" rx="2" />
          <path d="M9 5V4h6v1" />
          <path d="M9 11h6M9 15h4" />
        </>
      );
    case 'users':
      return (
        <>
          <circle cx="9" cy="8" r="2.5" />
          <path d="M4.5 19c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5" />
          <circle cx="16.5" cy="9" r="2" />
          <path d="M15 19c.4-2.2 1.6-3.4 3.2-3.6" />
        </>
      );
    case 'teacher':
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c1-3.8 3.4-6 7-6s6 2.2 7 6" />
          <path d="M16 4.5 19 6l-3 1.5" />
        </>
      );
    case 'link':
      return (
        <>
          <path d="M10 13a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1" />
          <path d="M14 11a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1" />
        </>
      );
    case 'sparkle':
      return (
        <>
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
          <path d="M7.5 7.5 10 10M14 14l2.5 2.5M16.5 7.5 14 10M10 14l-2.5 2.5" />
        </>
      );
    case 'mail':
      return (
        <>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </>
      );
    case 'utensils':
      return (
        <>
          <path d="M7 4v16" />
          <path d="M5 4v5a2 2 0 0 0 4 0V4" />
          <path d="M16 4v6h3" />
          <path d="M17.5 10v10" />
        </>
      );
    case 'moon':
      return <path d="M16 4.5A8 8 0 1 0 19.5 16 6.2 6.2 0 0 1 16 4.5z" />;
    case 'car':
      return (
        <>
          <path d="M4 14h16l-1.5-5.5A2 2 0 0 0 16.6 7H7.4a2 2 0 0 0-1.9 1.5z" />
          <path d="M5 17h14v2H5z" />
          <circle cx="7.5" cy="14.5" r="1.2" />
          <circle cx="16.5" cy="14.5" r="1.2" />
        </>
      );
    case 'heart':
      return (
        <path d="M12 19s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.8C19 14.6 12 19 12 19z" />
      );
    case 'backpack':
      return (
        <>
          <path d="M8 8h8v12H8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          <path d="M8 13h8" />
        </>
      );
    case 'star':
      return (
        <path d="m12 4 2.1 5.2 5.6.5-4.3 3.7 1.3 5.4L12 16.2 7.3 18.8l1.3-5.4-4.3-3.7 5.6-.5z" />
      );
    case 'tent':
      return (
        <>
          <path d="m4 19 8-14 8 14z" />
          <path d="M12 19v-8" />
        </>
      );
    case 'file':
      return (
        <>
          <path d="M7 4h7l5 5v11H7z" />
          <path d="M14 4v5h5" />
          <path d="M9 13h6M9 16h4" />
        </>
      );
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
        </>
      );
    case 'flower':
      return (
        <>
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="6.5" r="2" />
          <circle cx="12" cy="17.5" r="2" />
          <circle cx="6.5" cy="12" r="2" />
          <circle cx="17.5" cy="12" r="2" />
        </>
      );
    case 'bottle':
      return (
        <>
          <path d="M10 4h4v3l2 3v10H8V10l2-3z" />
          <path d="M9 13h6" />
        </>
      );
    case 'wifi':
      return (
        <>
          <path d="M5 10a10 10 0 0 1 14 0" />
          <path d="M8 13a6 6 0 0 1 8 0" />
          <path d="M11 16a2 2 0 0 1 2 0" />
          <path d="M4 18 20 6" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="6" y="11" width="12" height="9" rx="2" />
          <path d="M9 11V8a3 3 0 0 1 6 0v3" />
        </>
      );
    case 'bell':
      return (
        <>
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </>
      );
    case 'phone':
      return (
        <>
          <rect x="8" y="3" width="8" height="18" rx="2" />
          <path d="M11 18h2" />
        </>
      );
    case 'leaf':
      return <path d="M5 19c8-1 13-8 14-14-6 1-13 6-14 14z" />;
    case 'thought':
      return (
        <>
          <path d="M7 14a5 5 0 1 1 3.8-8.3A5.5 5.5 0 0 1 20 11a4 4 0 0 1-1 7.8H9a4 4 0 0 1-2-4.8z" />
          <circle cx="8" cy="20" r="0.8" />
          <circle cx="5.5" cy="21.5" r="0.5" />
        </>
      );
    case 'globe':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.5 2.8 3.8 5.5 3.8 8S14.5 17.2 12 20M12 4c-2.5 2.8-3.8 5.5-3.8 8S9.5 17.2 12 20" />
        </>
      );
    case 'flask':
      return (
        <>
          <path d="M10 4h4v6l4 8H6l4-8z" />
          <path d="M9 4h6" />
        </>
      );
    case 'ruler':
      return (
        <>
          <path d="m4 16 12-12 4 4-12 12z" />
          <path d="m8 12 1.5 1.5M11 9l1.5 1.5M14 6l1.5 1.5" />
        </>
      );
    case 'more':
      return (
        <>
          <circle cx="6" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="18" cy="12" r="1.2" />
        </>
      );
    case 'logout':
      return (
        <>
          <path d="M10 5H6v14h4" />
          <path d="m14 8 5 4-5 4" />
          <path d="M19 12H10" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </>
      );
    case 'plus':
      return <path d="M12 6v12M6 12h12" />;
    case 'x':
      return <path d="M8 8l8 8M16 8l-8 8" />;
    default:
      return (
        <>
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
          <path d="M7.5 7.5 10 10M14 14l2.5 2.5M16.5 7.5 14 10M10 14l-2.5 2.5" />
        </>
      );
  }
}

export function Icon({ name = 'sparkle', size = 20, className, title }) {
  const resolved = resolveIconName(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <Glyph name={resolved} />
    </svg>
  );
}

export function IconWell({ name, variant = 'lavender', size = 18, className = '' }) {
  return (
    <span className={`icon-well icon-well--${variant}${className ? ` ${className}` : ''}`}>
      <Icon name={name} size={size} />
    </span>
  );
}
