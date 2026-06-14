export function formatRelativeTimeTr(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'Az önce';
  if (diffMin < 60) return `${diffMin} dakika önce`;
  if (diffHour < 24) return `${diffHour} saat önce`;
  if (diffDay < 7) return `${diffDay} gün önce`;

  return date.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatChildTrackingTr(names) {
  if (names.length === 0) return '';
  if (names.length === 1) {
    return `${names[0]} için gelen güncellemeleri takip ediyorsunuz.`;
  }
  if (names.length === 2) {
    return `${names[0]} ve ${names[1]} için gelen güncellemeleri takip ediyorsunuz.`;
  }
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(', ');
  return `${rest} ve ${last} için gelen güncellemeleri takip ediyorsunuz.`;
}
