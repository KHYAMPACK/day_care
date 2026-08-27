const GRADIENTS = [
  ['#FBCFE8', '#FDBA74'],
  ['#C4B5FD', '#93C5FD'],
  ['#6EE7B7', '#67E8F9'],
  ['#FDE68A', '#F9A8D4'],
  ['#A5B4FC', '#F0ABFC'],
  ['#FDBA74', '#FCA5A5'],
  ['#99F6E4', '#BFDBFE'],
  ['#F9A8D4', '#C4B5FD'],
];

function hashName(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function initialsFromName(name, fallback = '?') {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function Avatar({ name = '', src, size = 40, className = '' }) {
  const label = name.trim() || 'K';
  const [start, end] = GRADIENTS[hashName(label) % GRADIENTS.length];
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    overflow: 'hidden',
    lineHeight: 1,
    fontSize: Math.max(11, Math.round(size * 0.36)),
    backgroundImage: src ? `url(${src})` : `linear-gradient(145deg, ${start}, ${end})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <span
      className={`ui-avatar${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {src ? null : initialsFromName(label)}
    </span>
  );
}

export function AvatarStack({ names = [], size = 40, max = 5 }) {
  const shown = names.slice(0, max);
  if (shown.length === 0) return null;

  return (
    <div className="avatar-stack" style={{ paddingLeft: 4 }}>
      {shown.map((name, index) => (
        <Avatar
          key={`${name}-${index}`}
          name={name}
          size={size}
          className="avatar-stack__item"
        />
      ))}
    </div>
  );
}
