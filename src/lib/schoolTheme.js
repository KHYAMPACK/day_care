export const DEFAULT_THEME = {
  primary: '#c4b5fd',
  primaryHover: '#a78bfa',
  primaryText: '#4c1d95',
  secondary: '#ede9fe',
  secondaryText: '#6d28d9',
  accentSoft: '#e9d5ff',
  accentBorder: '#ddd6fe',
};

export const THEME_CSS_VARS = [
  '--theme-primary',
  '--theme-primary-hover',
  '--theme-primary-text',
  '--theme-on-light',
  '--theme-secondary',
  '--theme-secondary-text',
  '--theme-accent-soft',
  '--theme-accent-border',
];

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
  return relativeLuminance(rgb) > 0.62 ? '#3d3a36' : '#ffffff';
}

function inkOnLight(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return DEFAULT_THEME.primaryText;
  if (relativeLuminance(rgb) > 0.45) {
    return mixHex(hex, '#1c1917', 0.58);
  }
  return toHex(rgb);
}

export function buildThemeFromSchool(school) {
  const primary = school?.primary_color?.trim() || DEFAULT_THEME.primary;
  const secondary = school?.secondary_color?.trim() || DEFAULT_THEME.secondary;

  return {
    primary,
    primaryHover: mixHex(primary, '#000000', 0.14),
    primaryText: contrastText(primary),
    onLight: inkOnLight(primary),
    secondary,
    secondaryText: contrastText(secondary) === '#ffffff' ? mixHex(secondary, '#000000', 0.55) : contrastText(secondary),
    accentSoft: mixHex(secondary, '#ffffff', 0.35),
    accentBorder: mixHex(primary, '#ffffff', 0.45),
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
  root.style.setProperty('--theme-accent-soft', theme.accentSoft);
  root.style.setProperty('--theme-accent-border', theme.accentBorder);
}

export function clearSchoolTheme() {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  THEME_CSS_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
}

export function getSchoolNavBrand(school, roleSuffix) {
  const name = school?.name?.trim();
  if (!name) return `KreşTakip — ${roleSuffix}`;
  return `${name} — ${roleSuffix}`;
}
