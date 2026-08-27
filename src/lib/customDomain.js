export function normalizeCustomDomain(value) {
  if (!value || typeof value !== 'string') return '';

  let domain = value.trim().toLowerCase();
  if (!domain) return '';

  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.split('/')[0];
  domain = domain.replace(/:\d+$/, '');
  domain = domain.replace(/\.$/, '');

  return domain;
}

export function isValidCustomDomain(value) {
  const domain = normalizeCustomDomain(value);
  if (!domain) return true;

  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}
