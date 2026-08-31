/**
 * Create a school with branding fields (admin / service role only).
 *
 * Usage:
 *   node scripts/create-school.mjs --name "Okul Adı" --code OKUL01 \
 *     --primary-color "#7c3aed" --secondary-color "#ede9fe" \
 *     --logo-url "https://example.com/logo.png" \
 *     --custom-domain "veli.example.com"
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
    if (key === '--name') args.name = value;
    if (key === '--code') args.code = value;
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

if (!args.name?.trim()) {
  console.error(
    'Usage: node scripts/create-school.mjs --name "Okul Adı" [--code OKUL01] [--primary-color "#7c3aed"] ...'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const primary = args.primaryColor ? normalizeHexColor(args.primaryColor) : null;
  const secondary = args.secondaryColor ? normalizeHexColor(args.secondaryColor) : null;

  if (args.primaryColor && !primary) {
    throw new Error('Invalid --primary-color (use hex, e.g. #7c3aed)');
  }
  if (args.secondaryColor && !secondary) {
    throw new Error('Invalid --secondary-color (use hex, e.g. #ede9fe)');
  }
  if (args.customDomain && !isValidCustomDomain(args.customDomain)) {
    throw new Error('Invalid --custom-domain');
  }

  const payload = {
    name: args.name.trim(),
    logo_url: args.logoUrl?.trim() || null,
    primary_color: primary,
    secondary_color: secondary,
    custom_domain: args.customDomain ? normalizeCustomDomain(args.customDomain) : null,
  };

  if (args.code?.trim()) {
    payload.school_code = args.code.trim().toUpperCase();
  }

  const { data, error } = await supabase.from('schools').insert(payload).select('id, name, school_code').single();
  if (error) throw error;

  console.log('\nSchool created:\n');
  console.log(`  ID:       ${data.id}`);
  console.log(`  Name:     ${data.name}`);
  console.log(`  Code:     ${data.school_code ?? '(auto-generated)'}`);
  console.log('\nNext: node scripts/create-director.mjs --school-id', data.id, '--name "Müdür Adı"\n');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
