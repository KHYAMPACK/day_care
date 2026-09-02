/** Derslig-style 5–8 catalog: subjects + unit definitions from Atlas weekly plans. */

import atlasWeeklyUnits from '../../data/curriculum/atlas-weekly-units.json';

export const CURRICULUM_SUBJECT_DEFS = [
  { slug: 'matematik', name: 'Matematik', color: '#e11d48', icon: 'ruler', sort_order: 1 },
  { slug: 'fen', name: 'Fen Bilimleri', color: '#ea580c', icon: 'flask', sort_order: 2 },
  { slug: 'turkce', name: 'Türkçe', color: '#ca8a04', icon: 'book', sort_order: 3 },
  { slug: 'sosyal', name: 'Sosyal Bilgiler', color: '#0284c7', icon: 'globe', sort_order: 4 },
  { slug: 'ingilizce', name: 'İngilizce', color: '#0d9488', icon: 'message', sort_order: 5 },
  { slug: 'din', name: 'Din Kültürü ve Ahlak Bilgisi', color: '#1e3a8a', icon: 'book', sort_order: 6 },
];

export const GRADE5_TURKCE_UNITS = [
  { title: 'Sözcükte Anlam', duration_weeks: 2 },
  { title: 'Cümlede Anlam', duration_weeks: 2 },
  { title: 'Deyim ve Atasözleri', duration_weeks: 2 },
  { title: 'Paragrafta Anlam', duration_weeks: 6 },
  { title: 'Hikaye', duration_weeks: 3 },
  { title: 'Şiir ve Söz Sanatları', duration_weeks: 3 },
  { title: 'İsimler', duration_weeks: 3 },
  { title: 'Sıfatlar', duration_weeks: 4 },
  { title: 'Zamirler', duration_weeks: 4 },
  { title: 'Yazım - Noktalama', duration_weeks: 3 },
  { title: 'Görsel Okuma', duration_weeks: 2 },
  { title: 'Sözel Mantık', duration_weeks: 2 },
];

function blockToNamedUnits(block) {
  if (block.skip || !block.units?.length) return null;
  return block.units.map((unit) => ({
    title: unit.title,
    duration_weeks: unit.duration_weeks ?? 1,
    sections: unit.sections ?? [],
  }));
}

/** Per grade-slug unit list keyed like "5-matematik". */
export const CURRICULUM_UNITS_BY_KEY = Object.fromEntries(
  atlasWeeklyUnits
    .map((block) => {
      const units = blockToNamedUnits(block);
      if (!units) return null;
      return [`${block.grade}-${block.slug}`, units];
    })
    .filter(Boolean)
);

/** Includes 5. sınıf Türkçe from migration even though JSON skips it. */
export const NAMED_UNITS = {
  '5-turkce': GRADE5_TURKCE_UNITS,
  ...CURRICULUM_UNITS_BY_KEY,
};

/** Fallback unit counts when a grade-slug has no named units. */
export const UNIT_COUNTS_BY_SLUG = {
  matematik: 7,
  fen: 7,
  turkce: 12,
  sosyal: 6,
  ingilizce: 10,
  din: 5,
};

export function namedUnitsKey(grade, slug) {
  return `${grade}-${slug}`;
}

export function getCatalogUnitsForSubject(grade, slug) {
  const key = namedUnitsKey(grade, slug);
  return NAMED_UNITS[key] ?? [];
}

export function buildSubjectUnits(grade, slug) {
  const key = namedUnitsKey(grade, slug);
  const named = NAMED_UNITS[key] ?? [];
  const count = named.length > 0 ? named.length : UNIT_COUNTS_BY_SLUG[slug] ?? 6;
  const units = [];

  for (let index = 1; index <= count; index += 1) {
    const namedUnit = named[index - 1];
    units.push({
      sort_order: index,
      title: namedUnit?.title ?? `Ünite ${index}`,
      sections: namedUnit?.sections ?? [],
      duration_weeks: namedUnit?.duration_weeks ?? 1,
    });
  }

  return units;
}
