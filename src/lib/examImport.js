import { LGS_SUBJECTS, computeNet, normalizeSubjectRow } from './lgsExam';

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const SUBJECT_ALIASES = {
  turkce: 'turkce',
  turkce_net: 'turkce',
  matematik: 'matematik',
  mat: 'matematik',
  fen: 'fen',
  fen_bilimleri: 'fen',
  inkilap: 'inkilap',
  inkilap_tarihi: 'inkilap',
  din: 'din',
  din_kulturu: 'din',
  ingilizce: 'ingilizce',
  ing: 'ingilizce',
};

export function parseGenericExamCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });

  return { headers, rows };
}

export function mapCsvRowToEntry(row) {
  const studentName = row.student_name ?? row.ad_soyad ?? row.ogrenci ?? row.name ?? '';
  const studentNumber = row.student_number ?? row.okul_no ?? row.numara ?? row.no ?? '';
  const subjects = {};

  for (const subject of LGS_SUBJECTS) {
    const netKey = Object.keys(row).find((key) => {
      const alias = SUBJECT_ALIASES[key];
      return alias === subject.code && key.endsWith('net');
    }) ?? `${subject.code}_net`;

    const directNet = row[netKey] ?? row[subject.code] ?? row[`${subject.code}_n`];
    const correct = row[`${subject.code}_d`] ?? row[`${subject.code}_dogru`];
    const wrong = row[`${subject.code}_y`] ?? row[`${subject.code}_yanlis`];
    const blank = row[`${subject.code}_b`] ?? row[`${subject.code}_bos`];

    if (directNet !== '' && directNet != null) {
      subjects[subject.code] = normalizeSubjectRow(subject.code, { net: directNet });
    } else if (correct !== '' || wrong !== '' || blank !== '') {
      subjects[subject.code] = normalizeSubjectRow(subject.code, {
        correct_count: correct,
        wrong_count: wrong,
        blank_count: blank,
      });
    }
  }

  const totalNet = row.total_net ?? row.toplam_net ?? row.net;
  return {
    studentName: studentName.trim(),
    studentNumber: String(studentNumber).trim(),
    subjects,
    totalNet: totalNet !== '' && totalNet != null ? Number(totalNet) : null,
  };
}

export function matchStudentsToCsvEntries(entries, students) {
  return entries.map((entry) => {
    const byNumber =
      entry.studentNumber &&
      students.find((s) => String(s.student_number ?? '') === entry.studentNumber);
    const byName =
      !byNumber &&
      entry.studentName &&
      students.find(
        (s) => s.full_name?.localeCompare(entry.studentName, 'tr', { sensitivity: 'base' }) === 0
      );
    const fuzzy =
      !byNumber &&
      !byName &&
      entry.studentName &&
      students.find((s) =>
        s.full_name?.toLowerCase().includes(entry.studentName.toLowerCase())
      );

    return {
      ...entry,
      matchedStudent: byNumber ?? byName ?? fuzzy ?? null,
      matchStatus: byNumber ? 'number' : byName ? 'exact' : fuzzy ? 'fuzzy' : 'unmatched',
    };
  });
}

export function entriesToSavePayload(matchedEntries, mode = 'detailed') {
  return matchedEntries
    .filter((entry) => entry.matchedStudent)
    .map((entry) => ({
      student_id: entry.matchedStudent.id,
      subjects: entry.subjects,
      totalNet: entry.totalNet,
      mode,
    }));
}

export function parseAtlasExamCsv(text) {
  // Placeholder until example folder — falls back to generic parser
  return parseGenericExamCsv(text);
}
