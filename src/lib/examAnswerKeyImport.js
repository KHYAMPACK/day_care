import { parseGenericExamCsv } from './examImport';
import { LGS_SUBJECTS, subjectByCode } from './lgsExam';
import { subjectForGlobalIndex } from './examAnalysis';

const CHOICE_PATTERN = /^[A-Ea-e]$/;

const INDEX_HEADERS = new Set([
  'question_index',
  'soru_no',
  'soru',
  'no',
  'index',
  'sira',
]);

const SUBJECT_HEADERS = new Set(['subject_code', 'ders', 'subject', 'ders_kodu']);

const CHOICE_HEADERS = new Set(['correct_choice', 'cevap', 'dogru', 'answer', 'cvap', 'sik']);

const TOPIC_HEADERS = new Set(['topic_label', 'konu', 'kazanim', 'topic', 'kazanım']);

const BOOKLET_A_HEADERS = new Set(['booklet_a_no', 'a_kitapcik', 'kitapcik_a', 'a']);
const BOOKLET_B_HEADERS = new Set(['booklet_b_no', 'b_kitapcik', 'kitapcik_b', 'b']);

const SUBJECT_ALIASES = {
  turkce: 'turkce',
  turk: 'turkce',
  tr: 'turkce',
  matematik: 'matematik',
  mat: 'matematik',
  fen: 'fen',
  fen_bilimleri: 'fen',
  inkilap: 'inkilap',
  inkilap_tarihi: 'inkilap',
  sosyal: 'inkilap',
  sosyal_bilgiler: 'inkilap',
  din: 'din',
  din_kulturu: 'din',
  ingilizce: 'ingilizce',
  ing: 'ingilizce',
  yabanci_dil: 'ingilizce',
};

function pickHeader(headers, candidates) {
  return headers.find((header) => candidates.has(header)) ?? null;
}

function normalizeChoice(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || !CHOICE_PATTERN.test(raw)) return null;
  return raw;
}

function normalizeSubjectCode(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (!raw) return null;
  return SUBJECT_ALIASES[raw] ?? (subjectByCode(raw) ? raw : null);
}

function localIndexForSubject(subjectCode, globalIndex) {
  const info = subjectForGlobalIndex(globalIndex);
  if (!info || info.subject.code !== subjectCode) return globalIndex;
  return info.localIndex;
}

export function parseAnswerKeyCsv(text) {
  const { headers, rows } = parseGenericExamCsv(text);
  if (!rows.length) {
    throw new Error('Cevap anahtarı CSV dosyası boş veya geçersiz.');
  }

  const indexHeader = pickHeader(headers, INDEX_HEADERS);
  const subjectHeader = pickHeader(headers, SUBJECT_HEADERS);
  const choiceHeader = pickHeader(headers, CHOICE_HEADERS);
  const topicHeader = pickHeader(headers, TOPIC_HEADERS);
  const bookletAHeader = pickHeader(headers, BOOKLET_A_HEADERS);
  const bookletBHeader = pickHeader(headers, BOOKLET_B_HEADERS);

  if (!choiceHeader && !headers.some((header) => CHOICE_HEADERS.has(header))) {
    throw new Error(
      'Cevap anahtarı CSV dosyasında doğru şık sütunu bulunamadı (correct_choice, cevap, dogru…).'
    );
  }

  const warnings = [];
  const questions = [];
  const seenIndices = new Set();

  rows.forEach((record, rowIndex) => {
    const rowNumber = rowIndex + 2;
    let questionIndex = indexHeader ? Number(record[indexHeader]) : rowIndex + 1;
    if (!Number.isFinite(questionIndex) || questionIndex <= 0) {
      questionIndex = rowIndex + 1;
      warnings.push(`Satır ${rowNumber}: soru numarası okunamadı, ${questionIndex} atandı.`);
    }

    if (seenIndices.has(questionIndex)) {
      warnings.push(`Satır ${rowNumber}: soru ${questionIndex} tekrar ediyor.`);
    }
    seenIndices.add(questionIndex);

    let subjectCode = subjectHeader ? normalizeSubjectCode(record[subjectHeader]) : null;
    if (!subjectCode) {
      const inferred = subjectForGlobalIndex(questionIndex);
      subjectCode = inferred?.subject.code ?? null;
      if (!subjectHeader) {
        warnings.push(`Satır ${rowNumber}: ders kodu yok, ${subjectCode ?? '?'} çıkarıldı.`);
      }
    }

    const correctChoice = normalizeChoice(record[choiceHeader]);
    if (!correctChoice) {
      warnings.push(`Satır ${rowNumber}: geçerli cevap şıkkı yok (A–E).`);
    }

    const topicLabel = topicHeader ? String(record[topicHeader] ?? '').trim() : '';
    if (!topicLabel) {
      warnings.push(`Satır ${rowNumber}: konu etiketi boş.`);
    }

    const localIndex = subjectCode ? localIndexForSubject(subjectCode, questionIndex) : questionIndex;

    questions.push({
      question_index: questionIndex,
      subject_code: subjectCode ?? 'turkce',
      booklet_a_no: bookletAHeader ? Number(record[bookletAHeader]) || localIndex : localIndex,
      booklet_b_no: bookletBHeader ? Number(record[bookletBHeader]) || localIndex : localIndex,
      correct_choice: correctChoice ?? '',
      topic_label: topicLabel,
    });
  });

  questions.sort((a, b) => a.question_index - b.question_index);

  if (!questions.length) {
    throw new Error('Cevap anahtarı CSV dosyasında soru satırı bulunamadı.');
  }

  const validChoices = questions.filter((row) => row.correct_choice).length;
  if (!validChoices) {
    throw new Error('Hiçbir satırda geçerli cevap şıkkı (A–E) bulunamadı.');
  }

  return { questions, warnings };
}

export function buildAnswerKeyTemplateCsv(questionCount = 90) {
  const headers = ['question_index', 'subject_code', 'correct_choice', 'topic_label'];
  const lines = [headers.join(',')];

  let globalIndex = 0;
  for (const subject of LGS_SUBJECTS) {
    for (let i = 1; i <= subject.questions; i += 1) {
      globalIndex += 1;
      if (globalIndex > questionCount) break;
      lines.push(
        [globalIndex, subject.code, 'A', `${subject.label} örnek konu`].join(',')
      );
    }
    if (globalIndex >= questionCount) break;
  }

  return `\uFEFF${lines.join('\n')}`;
}

export function downloadAnswerKeyTemplate(questionCount = 90) {
  const csv = buildAnswerKeyTemplateCsv(questionCount);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cevap-anahtari-sablonu.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function emptyQuestionsFromSubjects() {
  const rows = [];
  let globalIndex = 0;
  for (const subject of LGS_SUBJECTS) {
    for (let i = 1; i <= subject.questions; i += 1) {
      globalIndex += 1;
      rows.push({
        question_index: globalIndex,
        subject_code: subject.code,
        booklet_a_no: i,
        booklet_b_no: i,
        correct_choice: '',
        topic_label: '',
      });
    }
  }
  return rows;
}
