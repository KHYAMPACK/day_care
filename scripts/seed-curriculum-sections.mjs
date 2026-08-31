#!/usr/bin/env node
/**
 * Seed curriculum_units.sections from a JSON file.
 *
 * Usage:
 *   node scripts/seed-curriculum-sections.mjs path/to/sections.json
 *
 * JSON format:
 * [
 *   {
 *     "grade": 8,
 *     "slug": "turkce",
 *     "units": [
 *       { "title": "Paragrafta Anlam", "sections": ["Ana Fikir", "Yardımcı Fikir"] }
 *     ]
 *   }
 * ]
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/seed-curriculum-sections.mjs <sections.json>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const payload = JSON.parse(readFileSync(filePath, 'utf8'));

function normalize(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  const { data: subjects, error: subjectError } = await supabase
    .from('curriculum_subjects')
    .select('id, grade, slug, name');
  if (subjectError) throw subjectError;

  let updated = 0;
  let skipped = 0;

  for (const block of payload) {
    const subject = subjects.find(
      (row) => row.grade === block.grade && row.slug === block.slug
    );
    if (!subject) {
      console.warn(`Subject not found: grade ${block.grade} slug ${block.slug}`);
      continue;
    }

    const { data: units, error: unitError } = await supabase
      .from('curriculum_units')
      .select('id, title')
      .eq('subject_id', subject.id);
    if (unitError) throw unitError;

    for (const unitDef of block.units ?? []) {
      const unit = (units ?? []).find(
        (row) => normalize(row.title) === normalize(unitDef.title)
      );
      if (!unit) {
        console.warn(`Unit not found: ${subject.name} · ${unitDef.title}`);
        skipped += 1;
        continue;
      }

      const { error } = await supabase
        .from('curriculum_units')
        .update({ sections: unitDef.sections ?? [] })
        .eq('id', unit.id);
      if (error) throw error;
      updated += 1;
      console.log(`Updated: ${subject.name} · ${unitDef.title} (${(unitDef.sections ?? []).length} konu)`);
    }
  }

  console.log(`Done. ${updated} ünite güncellendi, ${skipped} atlandı.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
