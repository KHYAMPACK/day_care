/**
 * Update school branding fields (admin / service role only).
 *
 * Usage:
 *   node scripts/update-school-branding.mjs --school-code ATLASVIP \
 *     --logo-url /branding/atlas-vip.png \
 *     --primary-color "#1b2431" --secondary-color "#c23b3b"
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--school-code') args.schoolCode = value;
    if (key === '--school-id') args.schoolId = value;
    if (key === '--primary-color') args.primaryColor = value;
    if (key === '--secondary-color') args.secondaryColor = value;
    if (key === '--logo-url') args.logoUrl = value;
    if (key === '--custom-domain') args.customDomain = value;
  }
  return args;
}

function normalizeHexColor(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toLowerCase() : null;
}

function normalizeCustomDomain(value) {
  if (!value || typeof value !== 'string') return '';
  let domain = value.trim().toLowerCase();
  if (!domain) return '';
  domain = domain.replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
  return domain;
}

function isValidCustomDomain(value) {
  const domain = normalizeCustomDomain(value);
  if (!domain) return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

loadEnv();

const args = parseArgs(process.argv);
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!args.schoolCode?.trim() && !args.schoolId?.trim()) {
  console.error(
    'Usage: node scripts/update-school-branding.mjs --school-code ATLASVIP [--logo-url /branding/atlas-vip.png] [--primary-color "#1b2431"] ...'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const primary = args.primaryColor ? normalizeHexColor(args.primaryColor) : undefined;
  const secondary = args.secondaryColor ? normalizeHexColor(args.secondaryColor) : undefined;

  if (args.primaryColor && primary === null) {
    throw new Error('Invalid --primary-color (use hex, e.g. #1b2431)');
  }
  if (args.secondaryColor && secondary === null) {
    throw new Error('Invalid --secondary-color (use hex, e.g. #c23b3b)');
  }
  if (args.customDomain && !isValidCustomDomain(args.customDomain)) {
    throw new Error('Invalid --custom-domain');
  }

  let query = supabase.from('schools').select('id, name, school_code, logo_url, primary_color, secondary_color');
  if (args.schoolId?.trim()) {
    query = query.eq('id', args.schoolId.trim());
  } else {
    query = query.eq('school_code', args.schoolCode.trim().toUpperCase());
  }

  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) {
    throw new Error(args.schoolId ? `School not found: ${args.schoolId}` : `School not found: ${args.schoolCode}`);
  }

  const payload = {};
  if (args.logoUrl !== undefined) payload.logo_url = args.logoUrl?.trim() || null;
  if (primary !== undefined) payload.primary_color = primary;
  if (secondary !== undefined) payload.secondary_color = secondary;
  if (args.customDomain !== undefined) {
    payload.custom_domain = args.customDomain ? normalizeCustomDomain(args.customDomain) : null;
  }

  if (!Object.keys(payload).length) {
    throw new Error('Nothing to update — pass at least one of --logo-url, --primary-color, --secondary-color, --custom-domain');
  }

  const { data, error } = await supabase
    .from('schools')
    .update(payload)
    .eq('id', existing.id)
    .select('id, name, school_code, logo_url, primary_color, secondary_color, custom_domain')
    .single();
  if (error) throw error;

  console.log('\nSchool branding updated:\n');
  console.log(`  ID:       ${data.id}`);
  console.log(`  Name:     ${data.name}`);
  console.log(`  Code:     ${data.school_code ?? '—'}`);
  console.log(`  Logo:     ${data.logo_url ?? '(none)'}`);
  console.log(`  Primary:  ${data.primary_color ?? '(none)'}`);
  console.log(`  Secondary:${data.secondary_color ?? '(none)'}`);
  if (data.custom_domain) console.log(`  Domain:   ${data.custom_domain}`);
  console.log('');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
