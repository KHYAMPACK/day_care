export const DEFAULT_THEME = {
  primary: '#334155',
  primaryHover: '#1e293b',
  primaryText: '#ffffff',
  secondary: '#f1f5f9',
  accent: '#64748b',
  accentSoft: '#e2e8f0',
  accentBorder: '#cbd5e1',
  onLight: '#1c1c1e',
  secondaryText: '#3a3a3c',
};

export const THEME_CSS_VARS = [
  '--theme-primary',
  '--theme-primary-hover',
  '--theme-primary-text',
  '--theme-on-light',
  '--theme-secondary',
  '--theme-secondary-text',
  '--theme-accent',
  '--theme-accent-strong',
  '--theme-accent-soft',
  '--theme-accent-border',
];

const NEUTRAL_PAGE_BG = '#f7f6f4';
const NEUTRAL_TEXT_PRIMARY = '#1c1c1e';
const NEUTRAL_TEXT_SECONDARY = '#3a3a3c';

function parseHexColor(value) {
  if (!value || typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;

  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixHex(baseHex, targetHex, amount) {
  const base = parseHexColor(baseHex);
  const target = parseHexColor(targetHex);
  if (!base || !target) return baseHex;

  const ratio = Math.max(0, Math.min(1, amount));
  return toHex({
    r: base.r + (target.r - base.r) * ratio,
    g: base.g + (target.g - base.g) * ratio,
    b: base.b + (target.b - base.b) * ratio,
  });
}

function relativeLuminance({ r, g, b }) {
  const transform = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function contrastText(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return DEFAULT_THEME.primaryText;
  return relativeLuminance(rgb) > 0.62 ? '#1c1c1e' : '#ffffff';
}

export function buildThemeFromSchool(school) {
  const primary = school?.primary_color?.trim() || DEFAULT_THEME.primary;
  const accentRaw = school?.secondary_color?.trim() || DEFAULT_THEME.accent;
  const secondaryWash = mixHex(accentRaw, '#ffffff', 0.88);

  return {
    primary,
    primaryHover: mixHex(primary, '#000000', 0.14),
    primaryText: contrastText(primary),
    onLight: NEUTRAL_TEXT_PRIMARY,
    secondary: secondaryWash,
    secondaryText: NEUTRAL_TEXT_SECONDARY,
    accent: accentRaw,
    accentStrong: mixHex(accentRaw, '#000000', 0.22),
    accentSoft: mixHex(accentRaw, '#ffffff', 0.82),
    accentBorder: mixHex(primary, '#ffffff', 0.45),
    pageBackground: mixHex(NEUTRAL_PAGE_BG, accentRaw, 0.15),
  };
}

export function applySchoolTheme(school) {
  if (typeof document === 'undefined') return;

  const theme = buildThemeFromSchool(school);
  const root = document.documentElement;

  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-primary-hover', theme.primaryHover);
  root.style.setProperty('--theme-primary-text', theme.primaryText);
  root.style.setProperty('--theme-on-light', theme.onLight);
  root.style.setProperty('--theme-secondary', theme.secondary);
  root.style.setProperty('--theme-secondary-text', theme.secondaryText);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-accent-strong', theme.accentStrong);
  root.style.setProperty('--theme-accent-soft', theme.accentSoft);
  root.style.setProperty('--theme-accent-border', theme.accentBorder);
  root.style.setProperty('--bg-page', theme.pageBackground);
}

export function normalizeHexColor(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return parseHexColor(withHash) ? withHash.toLowerCase() : null;
}

export function clearSchoolTheme() {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  THEME_CSS_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
  root.style.removeProperty('--bg-page');
}

export function getSchoolNavBrand(school, roleSuffix) {
  const name = school?.name?.trim();
  if (!name) return `OkulTakip — ${roleSuffix}`;
  return `${name} — ${roleSuffix}`;
}
