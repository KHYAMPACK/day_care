/** Derslig-style 5–8 catalog: subjects + unit counts. Titles beyond known screenshots are placeholders. */

export const CURRICULUM_SUBJECT_DEFS = [
  { slug: 'matematik', name: 'Matematik', color: '#e11d48', icon: 'ruler', sort_order: 1 },
  { slug: 'fen', name: 'Fen Bilimleri', color: '#ea580c', icon: 'flask', sort_order: 2 },
  { slug: 'turkce', name: 'Türkçe', color: '#ca8a04', icon: 'book', sort_order: 3 },
  { slug: 'sosyal', name: 'Sosyal Bilgiler', color: '#0284c7', icon: 'globe', sort_order: 4 },
  { slug: 'ingilizce', name: 'İngilizce', color: '#0d9488', icon: 'message', sort_order: 5 },
  { slug: 'din', name: 'Din Kültürü ve Ahlak Bilgisi', color: '#1e3a8a', icon: 'book', sort_order: 6 },
];

/** 5. sınıf counts from the Derslig subject grid; other grades reuse the same counts until transcribed. */
export const UNIT_COUNTS_BY_SLUG = {
  matematik: 13,
  fen: 7,
  turkce: 6,
  sosyal: 6,
  ingilizce: 23,
  din: 5,
};

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

export const NAMED_UNITS = {
  '5-matematik': [
    {
      title: 'Geometrik Şekiller',
      sections: [
        'Temel Geometrik Kavramlar ve Çizimler',
        'Açıların Ölçüsü',
        'Çokgenler',
      ],
    },
    { title: 'Sayılar ve Nicelikler' },
  ],
  '5-turkce': GRADE5_TURKCE_UNITS,
};

export function namedUnitsKey(grade, slug) {
  return `${grade}-${slug}`;
}

export function buildSubjectUnits(grade, slug) {
  const named = NAMED_UNITS[namedUnitsKey(grade, slug)] ?? [];
  const count = named.length > 0 && slug === 'turkce' && grade === 5
    ? named.length
    : UNIT_COUNTS_BY_SLUG[slug] ?? 6;
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
