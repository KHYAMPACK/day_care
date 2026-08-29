import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { getSupabaseAdmin } from './webPush.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');

export const DEFAULT_TENANT = {
  id: null,
  name: 'OkulTakip',
  short_name: 'OkulTakip',
  logo_url: null,
  primary_color: '#5b21b6',
  secondary_color: '#faf9f7',
  custom_domain: null,
  theme_color: '#5b21b6',
  background_color: '#faf9f7',
};

const ALLOWED_ICON_SIZES = new Set([16, 32, 180, 192, 512]);

export function normalizeHostname(rawHost) {
  if (!rawHost || typeof rawHost !== 'string') return '';
  let host = rawHost.split(',')[0].trim().toLowerCase();
  if (!host) return '';
  host = host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');
  return host;
}

export function getRequestHostname(req) {
  const forwarded = req.headers['x-forwarded-host'];
  const host = forwarded ?? req.headers.host ?? '';
  return normalizeHostname(host);
}

export function getRequestOrigin(req) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = protoHeader?.split(',')[0]?.trim() || 'https';
  const host = getRequestHostname(req);
  if (!host) return null;
  return `${proto}://${host}`;
}

function getSupabaseAnon() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase anon credentials are not configured on the server');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEV_SCHOOL_CODE = 'DEMO123';

async function querySchoolByDomain(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.rpc('resolve_school_by_domain', {
    p_host: normalized,
  });

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

async function querySchoolByCode(schoolCode) {
  const supabase = getSupabaseAnon();

  const { data, error } = await supabase.rpc('resolve_school_by_code', {
    p_code: schoolCode,
  });

  if (error) {
    // RPC may not exist until migration 038 is applied — fall back to id-only lookup
    if (/resolve_school_by_code|could not find the function/i.test(error.message ?? '')) {
      const { data: schoolId, error: idError } = await supabase.rpc('resolve_school_id_by_code', {
        p_code: schoolCode,
      });
      if (idError) throw idError;
      if (!schoolId) return null;
      return {
        id: schoolId,
        name: 'Yıldızlar Demo Kreşi',
        logo_url: null,
        primary_color: null,
        secondary_color: null,
        custom_domain: null,
      };
    }
    throw error;
  }

  return data?.[0] ?? null;
}

export function buildTenantPayload(school) {
  if (!school?.id) {
    return { ...DEFAULT_TENANT, resolved: false };
  }

  const themeColor = school.primary_color?.trim() || DEFAULT_TENANT.theme_color;
  const backgroundColor = school.secondary_color?.trim() || DEFAULT_TENANT.background_color;
  const name = school.name?.trim() || DEFAULT_TENANT.name;
  const shortName = name.length > 12 ? name.slice(0, 12).trim() : name;

  return {
    id: school.id,
    name,
    short_name: shortName,
    logo_url: school.logo_url ?? null,
    primary_color: school.primary_color ?? null,
    secondary_color: school.secondary_color ?? null,
    custom_domain: school.custom_domain ?? null,
    theme_color: themeColor,
    background_color: backgroundColor,
    resolved: true,
  };
}

export async function resolveTenantByHost(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return buildTenantPayload(null);
  }

  try {
    if (DEV_HOSTS.has(normalized)) {
      const school = await querySchoolByCode(DEV_SCHOOL_CODE);
      return buildTenantPayload(school);
    }

    const school = await querySchoolByDomain(normalized);
    return buildTenantPayload(school);
  } catch (error) {
    console.error('resolveTenantByHost:', error.message);
    return buildTenantPayload(null);
  }
}

export async function resolveTenantFromRequest(req) {
  return resolveTenantByHost(getRequestHostname(req));
}

export function buildManifest(tenant, origin) {
  const iconBase = origin ? `${origin}/api/branding/icon` : '/api/branding/icon';

  return {
    name: tenant.name,
    short_name: tenant.short_name,
    description: `${tenant.name} — okul bildirimleri ve veli takip uygulaması`,
    lang: 'tr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: tenant.theme_color,
    background_color: tenant.background_color,
    categories: ['education', 'productivity'],
    icons: [
      {
        src: `${iconBase}?size=192`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconBase}?size=512`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconBase}?size=512`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

async function readDefaultIconPng(size) {
  const fileBySize = {
    16: 'favicon-16x16.png',
    32: 'favicon-32x32.png',
    180: 'apple-touch-icon.png',
    192: 'pwa-192x192.png',
    512: 'pwa-512x512.png',
  };
  const filename = fileBySize[size] ?? 'pwa-192x192.png';
  return readFile(path.join(publicDir, filename));
}

async function fetchLogoBuffer(logoUrl) {
  const response = await fetch(logoUrl, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Logo fetch failed: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Logo is not an image: ${contentType}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function renderTenantIconPng(tenant, size) {
  const parsedSize = Number(size);
  if (!ALLOWED_ICON_SIZES.has(parsedSize)) {
    throw new Error('Invalid icon size');
  }

  if (tenant.logo_url) {
    try {
      const logoBuffer = await fetchLogoBuffer(tenant.logo_url);
      return sharp(logoBuffer)
        .resize(parsedSize, parsedSize, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
    } catch (error) {
      console.error('renderTenantIconPng:', error.message);
    }
  }

  const fallback = await readDefaultIconPng(parsedSize);
  return sharp(fallback).resize(parsedSize, parsedSize, { fit: 'cover' }).png().toBuffer();
}

export async function fetchSchoolBrandingById(schoolId) {
  if (!schoolId) return buildTenantPayload(null);

  try {
    const { adminDb } = getSupabaseAdmin();
    const { data, error } = await adminDb
      .from('schools')
      .select('id, name, logo_url, primary_color, secondary_color, custom_domain')
      .eq('id', schoolId)
      .maybeSingle();

    if (error) throw error;
    return buildTenantPayload(data);
  } catch (error) {
    console.error('fetchSchoolBrandingById:', error.message);
    return buildTenantPayload(null);
  }
}

export function buildPushIconUrl(origin, tenant) {
  if (!origin) return null;
  if (tenant?.resolved && tenant.logo_url) {
    return `${origin}/api/branding/icon?size=192`;
  }
  return `${origin}/pwa-192x192.png`;
}
