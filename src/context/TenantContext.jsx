import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applySchoolTheme, clearSchoolTheme } from '../lib/schoolTheme';

const DEFAULT_TENANT = {
  id: null,
  name: 'OkulTakip',
  short_name: 'OkulTakip',
  logo_url: null,
  primary_color: '#5b21b6',
  secondary_color: '#faf9f7',
  custom_domain: null,
  theme_color: '#5b21b6',
  background_color: '#faf9f7',
  resolved: false,
};

const TenantContext = createContext(null);

function upsertLink(rel, href, extra = {}) {
  if (!href) return;

  const selector = extra.sizes
    ? `link[rel="${rel}"][sizes="${extra.sizes}"]`
    : `link[rel="${rel}"]`;
  let link = document.head.querySelector(selector);

  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
  if (extra.type) link.type = extra.type;
  if (extra.sizes) link.sizes = extra.sizes;
}

function applyTenantDocumentHead(tenant) {
  if (typeof document === 'undefined') return;

  document.title = tenant.resolved ? tenant.name : 'OkulTakip';

  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = tenant.theme_color;

  upsertLink('manifest', '/api/manifest.webmanifest');
  upsertLink('icon', '/api/branding/icon?size=32', { type: 'image/png', sizes: '32x32' });
  upsertLink('icon', '/api/branding/icon?size=16', { type: 'image/png', sizes: '16x16' });
  upsertLink('apple-touch-icon', '/api/branding/icon?size=180');
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(DEFAULT_TENANT);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadTenant() {
      setTenantLoading(true);
      setTenantError(null);

      try {
        const response = await fetch('/api/tenant');
        if (!response.ok) {
          throw new Error('Okul markası yüklenemedi.');
        }

        const data = await response.json();
        if (!mounted) return;

        const nextTenant = { ...DEFAULT_TENANT, ...data };
        setTenant(nextTenant);

        if (nextTenant.resolved) {
          applySchoolTheme(nextTenant);
        } else {
          clearSchoolTheme();
        }

        applyTenantDocumentHead(nextTenant);
      } catch (error) {
        if (!mounted) return;
        setTenant(DEFAULT_TENANT);
        setTenantError(error);
        clearSchoolTheme();
        applyTenantDocumentHead(DEFAULT_TENANT);
      } finally {
        if (mounted) setTenantLoading(false);
      }
    }

    loadTenant();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      tenantSchoolId: tenant.resolved ? tenant.id : null,
      tenantLoading,
      tenantError,
    }),
    [tenant, tenantLoading, tenantError]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
