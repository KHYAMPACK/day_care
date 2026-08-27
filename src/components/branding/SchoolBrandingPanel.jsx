import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isValidCustomDomain, normalizeCustomDomain } from '../../lib/customDomain';
import {
  DEFAULT_THEME,
  applySchoolTheme,
  buildThemeFromSchool,
  normalizeHexColor,
} from '../../lib/schoolTheme';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
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

export default function SchoolBrandingPanel({ school, schoolId, onSaved }) {
  const [logoUrl, setLogoUrl] = useState(school?.logo_url ?? '');
  const [primaryColor, setPrimaryColor] = useState(school?.primary_color ?? DEFAULT_THEME.primary);
  const [secondaryColor, setSecondaryColor] = useState(school?.secondary_color ?? DEFAULT_THEME.secondary);
  const [customDomain, setCustomDomain] = useState(school?.custom_domain ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    setLogoUrl(school?.logo_url ?? '');
    setPrimaryColor(school?.primary_color ?? DEFAULT_THEME.primary);
    setSecondaryColor(school?.secondary_color ?? DEFAULT_THEME.secondary);
    setCustomDomain(school?.custom_domain ?? '');
  }, [school]);

  useEffect(() => {
    applySchoolTheme({
      logo_url: logoUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    });
  }, [logoUrl, primaryColor, secondaryColor]);

  async function handleSave(event) {
    event.preventDefault();
    if (!schoolId) return;

    const primary = normalizeHexColor(primaryColor);
    const secondary = normalizeHexColor(secondaryColor);
    if (!primary || !secondary) {
      setError(new Error('Renkler geçerli bir hex kodu olmalıdır (ör. #7c3aed).'));
      return;
    }

    const normalizedDomain = normalizeCustomDomain(customDomain);
    if (customDomain.trim() && !isValidCustomDomain(customDomain)) {
      setError(new Error('Alan adı geçersiz. Örnek: veli.atlasegitimkurumu.com'));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: updateError } = await supabase
        .from('schools')
        .update({
          logo_url: logoUrl.trim() || null,
          primary_color: primary,
          secondary_color: secondary,
          custom_domain: normalizedDomain || null,
        })
        .eq('id', schoolId);
      if (updateError) throw updateError;
      setSuccess('Marka ayarları kaydedildi.');
      await onSaved?.();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-card brand-panel">
      <h2 className="dash-section-title">Okul markası</h2>
      <p className="dash-hint">
        Logo, renkler ve veli uygulaması alan adı tüm ekranlarda ve PWA kurulumunda
        kullanılır. Birincil renk butonlarda, ikincil renk arka plan ve üst barda kullanılır.
      </p>

      {error && <InlineError error={error} context="general" />}
      {success && <SuccessMessage message={success} />}

      <form className="dash-form brand-form" onSubmit={handleSave}>
        <label className="dash-label">
          Logo adresi (URL)
          <input
            className="dash-input"
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://…/logo.png"
            disabled={saving}
          />
        </label>

        <label className="dash-label">
          Veli uygulaması alan adı
          <input
            className="dash-input"
            type="text"
            value={customDomain}
            onChange={(event) => setCustomDomain(event.target.value)}
            placeholder="veli.atlasegitimkurumu.com"
            disabled={saving}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="auth-hint">
            Yalnızca alt alan adı girin (www değil). DNS kaydını Vercel projenize yönlendirin.
          </span>
        </label>

        <div className="brand-form__colors">
          <label className="dash-label">
            Birincil renk
            <div className="brand-color-field">
              <input
                className="brand-color-field__picker"
                type="color"
                value={normalizeHexColor(primaryColor) ?? DEFAULT_THEME.primary}
                onChange={(event) => setPrimaryColor(event.target.value)}
                disabled={saving}
              />
              <input
                className="dash-input"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                placeholder="#7c3aed"
                disabled={saving}
              />
            </div>
          </label>

          <label className="dash-label">
            İkincil renk
            <div className="brand-color-field">
              <input
                className="brand-color-field__picker"
                type="color"
                value={normalizeHexColor(secondaryColor) ?? DEFAULT_THEME.secondary}
                onChange={(event) => setSecondaryColor(event.target.value)}
                disabled={saving}
              />
              <input
                className="dash-input"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.target.value)}
                placeholder="#ede9fe"
                disabled={saving}
              />
            </div>
          </label>
        </div>

        <BrandPreview
          schoolName={school?.name}
          logoUrl={logoUrl.trim()}
          primary={primaryColor}
          secondary={secondaryColor}
        />

        <SendButton sending={saving} label="Markayı kaydet" sendingLabel="Kaydediliyor…" />
      </form>
    </section>
  );
}
