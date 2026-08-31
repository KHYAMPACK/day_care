import { useMemo } from 'react';
import { DEFAULT_THEME, buildThemeFromSchool } from '../../lib/schoolTheme';
import { Avatar } from '../ui/Avatar';

function BrandPreview({ schoolName, logoUrl, primary, secondary }) {
  const theme = useMemo(
    () =>
      buildThemeFromSchool({
        primary_color: primary || DEFAULT_THEME.primary,
        secondary_color: secondary || DEFAULT_THEME.secondary,
      }),
    [primary, secondary]
  );

  return (
    <div className="brand-preview" style={{ '--preview-primary': theme.primary, '--preview-secondary': theme.secondary }}>
      <div className="brand-preview__header">
        <div className="brand-preview__logo">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="brand-preview__logo-img" />
          ) : (
            <Avatar name={schoolName || 'Okul'} size={40} />
          )}
        </div>
        <div>
          <p className="brand-preview__name">{schoolName || 'Okul adı'}</p>
          <p className="brand-preview__role">Önizleme</p>
        </div>
      </div>
      <div className="brand-preview__swatches">
        <span className="brand-preview__swatch" style={{ background: theme.primary }}>
          Birincil
        </span>
        <span className="brand-preview__swatch brand-preview__swatch--secondary" style={{ background: theme.secondary }}>
          İkincil
        </span>
      </div>
      <button type="button" className="brand-preview__btn">
        Örnek buton
      </button>
    </div>
  );
}

export default function SchoolBrandingPanel({ school }) {
  const logoUrl = school?.logo_url?.trim() ?? '';
  const primary = school?.primary_color ?? DEFAULT_THEME.primary;
  const secondary = school?.secondary_color ?? DEFAULT_THEME.secondary;
  const customDomain = school?.custom_domain?.trim() ?? '';

  return (
    <section className="dash-card brand-panel">
      <h2 className="dash-section-title">Okul markası</h2>
      <p className="dash-hint">
        Marka ayarları kurulum sırasında belirlenir. Değişiklik için destek ile iletişime geçin.
      </p>

      {customDomain ? (
        <p className="dash-hint">
          Veli uygulaması alan adı: <strong>{customDomain}</strong>
        </p>
      ) : null}

      <BrandPreview schoolName={school?.name} logoUrl={logoUrl} primary={primary} secondary={secondary} />
    </section>
  );
}
