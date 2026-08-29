import * as XLSX from 'xlsx';

const HEADER_ALIASES = {
  topic_code: ['topic_code', 'konu_kodu', 'kod', 'kazanim_kodu', 'code'],
  topic_name: ['topic_name', 'konu', 'konu_adi', 'unite', 'topic'],
  test_no: ['test_no', 'test_numarasi', 'sira', 'no'],
  test_name: ['test_name', 'test', 'test_adi', 'tarama'],
  question_count: ['question_count', 'soru', 'soru_sayisi', 'adet', 'q'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveColumn(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = headers.find((header) => aliases.includes(header));
    if (match) map[field] = match;
  }
  return map;
}

function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const HOMEWORK_TEMPLATE_HEADERS = [
  'topic_code',
  'topic_name',
  'test_no',
  'test_name',
  'question_count',
];

export function buildHomeworkTemplateCsv() {
  const sample = [
    HOMEWORK_TEMPLATE_HEADERS.join(','),
    'M.5.1.1,Doğal Sayılar,1,Test 1,12',
    'M.5.1.1,Doğal Sayılar,2,Test 2,10',
    'M.5.1.2,Kesirler,1,Tarama 1,15',
  ].join('\n');
  return sample;
}

export function downloadHomeworkTemplate() {
  const csv = buildHomeworkTemplateCsv();
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'odev-kitap-indeks-sablonu.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function rowsFromSheet(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export async function parseHomeworkIndexFile(file) {
  const name = file.name?.toLowerCase() ?? '';
  let rawRows = [];

  if (name.endsWith('.csv') || file.type.includes('csv')) {
    const text = await file.text();
    const workbook = XLSX.read(text, { type: 'string' });
    rawRows = rowsFromSheet(workbook.Sheets[workbook.SheetNames[0]]);
  } else {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    rawRows = rowsFromSheet(workbook.Sheets[workbook.SheetNames[0]]);
  }

  if (!rawRows.length) {
    throw new Error('Dosyada satır bulunamadı.');
  }

  const headers = Object.keys(rawRows[0]).map(normalizeHeader);
  const originalKeys = Object.keys(rawRows[0]);
  const normalizedToOriginal = Object.fromEntries(
    originalKeys.map((key) => [normalizeHeader(key), key])
  );
  const columns = resolveColumn(headers);

  if (!columns.topic_name && !columns.topic_code) {
    throw new Error('Dosyada konu adı veya konu kodu sütunu bulunamadı.');
  }
  if (!columns.question_count) {
    throw new Error('Dosyada soru sayısı sütunu bulunamadı.');
  }

  const rows = rawRows
    .map((row, index) => {
      const read = (field) => {
        const header = columns[field];
        if (!header) return '';
        return row[normalizedToOriginal[header]] ?? row[header] ?? '';
      };
      const topicName = String(read('topic_name')).trim();
      const topicCodeRaw = String(read('topic_code')).trim();
      const testNameRaw = String(read('test_name')).trim();
      const testNoRaw = String(read('test_no')).trim();
      const questionCount = Number(String(read('question_count')).replace(',', '.'));
      const topicCode = topicCodeRaw || topicName || `K${index + 1}`;

      return {
        rowNumber: index + 2,
        topic_code: topicCode,
        topic_name: topicName || topicCodeRaw || `Konu ${index + 1}`,
        test_no: testNoRaw ? Number(testNoRaw) || null : null,
        test_name: testNameRaw || (testNoRaw ? `Test ${testNoRaw}` : `Test ${index + 1}`),
        question_count: questionCount,
      };
    })
    .filter((row) => row.topic_name || row.test_name);

  const invalid = rows.find(
    (row) => !Number.isInteger(row.question_count) || row.question_count < 1 || row.question_count > 200
  );
  if (invalid) {
    throw new Error(`Satır ${invalid.rowNumber}: soru sayısı 1–200 arasında bir tam sayı olmalıdır.`);
  }

  return rows;
}

export function matchIndexToUnits(rows, units = []) {
  const byTitle = new Map();
  const bySection = new Map();

  units.forEach((unit) => {
    const titleKey = normalizeText(unit.title);
    if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, unit);
    (unit.sections ?? []).forEach((section) => {
      const sectionKey = normalizeText(section);
      if (sectionKey && !bySection.has(sectionKey)) bySection.set(sectionKey, unit);
    });
  });

  return rows.map((row) => {
    const nameKey = normalizeText(row.topic_name);
    const codeKey = normalizeText(row.topic_code);
    const unit = byTitle.get(nameKey) ?? byTitle.get(codeKey) ?? bySection.get(nameKey) ?? null;
    return {
      ...row,
      unit_id: unit?.id ?? null,
      unit_title: unit?.title ?? null,
    };
  });
}

export function groupMatchedRows(rows) {
  const groups = [];
  const indexByCode = new Map();

  rows.forEach((row) => {
    const key = row.topic_code || row.topic_name;
    if (!indexByCode.has(key)) {
      indexByCode.set(key, groups.length);
      groups.push({
        topic_code: row.topic_code,
        topic_name: row.topic_name,
        unit_id: row.unit_id,
        unit_title: row.unit_title,
        tests: [],
      });
    }
    const group = groups[indexByCode.get(key)];
    if (!group.unit_id && row.unit_id) {
      group.unit_id = row.unit_id;
      group.unit_title = row.unit_title;
    }
    group.tests.push({
      test_no: row.test_no,
      test_name: row.test_name,
      question_count: row.question_count,
    });
  });

  return groups;
}

export function unmatchedTopicCount(groups) {
  return groups.filter((group) => !group.unit_id).length;
}
