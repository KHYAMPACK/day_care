import { supabase } from './supabase';
import { parseGenericExamCsv, matchStudentsToCsvEntries } from './examImport';
import { deriveSubjectResultsFromAnswers } from './examAnalysis';
import { computeExamRankings, computeNet, LGS_SUBJECTS } from './lgsExam';

const CHOICE_PATTERN = /^[A-Ea-e]$/;

function normalizeChoice(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === '-' || raw === '0' || raw === 'X') return null;
  if (CHOICE_PATTERN.test(raw)) return raw;
  return null;
}

function isQuestionHeader(header) {
  if (!header) return false;
  if (/^s(?:oru)?[_-]?\d+$/.test(header)) return true;
  if (/^q[_-]?\d+$/.test(header)) return true;
  if (/^s\d+$/.test(header)) return true;
  if (/^\d+$/.test(header)) {
    const num = Number(header);
    return num >= 1 && num <= 120;
  }
  for (const subject of LGS_SUBJECTS) {
    if (new RegExp(`^${subject.code}[_-]?\\d+$`).test(header)) return true;
  }
  return false;
}

function questionIndexFromHeader(header) {
  const match =
    header.match(/^s(?:oru)?[_-]?(\d+)$/) ??
    header.match(/^q[_-]?(\d+)$/) ??
    header.match(/^s(\d+)$/) ??
    header.match(/^(\d+)$/);
  if (match) return Number(match[1]);

  for (const subject of LGS_SUBJECTS) {
    const subjectMatch = header.match(new RegExp(`^${subject.code}[_-]?(\\d+)$`));
    if (subjectMatch) {
      let offset = 0;
      for (const item of LGS_SUBJECTS) {
        if (item.code === subject.code) return offset + Number(subjectMatch[1]);
        offset += item.questions;
      }
    }
  }
  return null;
}

export function previewOptikEntryStats(entry, questions) {
  const questionByIndex = Object.fromEntries(
    (questions ?? []).map((question) => [question.question_index, question])
  );

  const bySubject = {};
  for (const subject of LGS_SUBJECTS) {
    bySubject[subject.code] = { correct: 0, wrong: 0, blank: 0, questionCount: subject.questions };
  }

  for (const [indexKey, choice] of Object.entries(entry.choices ?? {})) {
    const question = questionByIndex[Number(indexKey)];
    if (!question) continue;
    const bucket = bySubject[question.subject_code];
    if (!bucket) continue;
    if (!choice) bucket.blank += 1;
    else if (choice === question.correct_choice) bucket.correct += 1;
    else bucket.wrong += 1;
  }

  const subjects = LGS_SUBJECTS.map((subject) => {
    const bucket = bySubject[subject.code];
    return {
      subject_code: subject.code,
      label: subject.label,
      shortLabel: subject.shortLabel,
      correct: bucket.correct,
      wrong: bucket.wrong,
      blank: bucket.blank,
      net: computeNet(bucket.correct, bucket.wrong),
    };
  });

  const totals = subjects.reduce(
    (acc, row) => ({
      correct: acc.correct + row.correct,
      wrong: acc.wrong + row.wrong,
      blank: acc.blank + row.blank,
    }),
    { correct: 0, wrong: 0, blank: 0 }
  );

  return {
    subjects,
    totalNet: computeNet(totals.correct, totals.wrong),
    totalCorrect: totals.correct,
    totalWrong: totals.wrong,
    totalBlank: totals.blank,
  };
}

export function parseOptikExamCsv(text) {
  const { headers, rows } = parseGenericExamCsv(text);

  const studentNumberHeader =
    headers.find((header) =>
      ['student_number', 'okul_no', 'numara', 'no', 'ogrenci_no'].includes(header)
    ) ?? null;
  const studentNameHeader =
    headers.find((header) =>
      ['student_name', 'ad_soyad', 'ogrenci', 'name', 'adsoyad'].includes(header)
    ) ?? null;

  const questionHeaders = headers
    .map((header) => ({ header, questionIndex: questionIndexFromHeader(header) }))
    .filter((item) => item.questionIndex != null && isQuestionHeader(item.header));

  if (!questionHeaders.length) {
    throw new Error(
      'Optik dosyada soru sütunları bulunamadı. s1…s90 veya 1…90 formatını kullanın.'
    );
  }

  const entries = rows.map((record, rowIndex) => {
    const choices = {};
    for (const item of questionHeaders) {
      choices[item.questionIndex] = normalizeChoice(record[item.header]);
    }

    return {
      rowNumber: rowIndex + 2,
      student_number: studentNumberHeader ? String(record[studentNumberHeader] ?? '').trim() : '',
      student_name: studentNameHeader ? String(record[studentNameHeader] ?? '').trim() : '',
      choices,
    };
  });

  return {
    questionHeaders: questionHeaders.map((item) => item.questionIndex),
    entries,
  };
}

export function matchOptikEntriesToStudents(entries, students) {
  return matchStudentsToCsvEntries(
    entries.map((entry) => ({
      studentName: entry.student_name,
      studentNumber: entry.student_number,
      subjects: {},
      totalNet: null,
    })),
    students
  ).map((matched, index) => ({
    ...matched,
    student_id: matched.matchedStudent?.id ?? null,
    studentName:
      matched.matchedStudent?.full_name ??
      entries[index]?.student_name ??
      matched.studentName ??
      '',
    student_number: entries[index]?.student_number ?? matched.studentNumber ?? '',
    choices: entries[index]?.choices ?? {},
    rowNumber: entries[index]?.rowNumber,
  }));
}

export async function saveOptikImport({
  sessionId,
  answerKeyId,
  questions,
  matchedEntries,
}) {
  if (!sessionId || !answerKeyId) {
    throw new Error('Sınav oturumu ve cevap anahtarı gerekli.');
  }

  const questionByIndex = Object.fromEntries(
    (questions ?? []).map((question) => [question.question_index, question])
  );

  const studentIds = matchedEntries
    .filter((entry) => entry.student_id)
    .map((entry) => entry.student_id);

  if (!studentIds.length) {
    throw new Error('Eşleşen öğrenci yok.');
  }

  if (studentIds.length) {
    const { error: deleteAnswersError } = await supabase
      .from('exam_student_answers')
      .delete()
      .eq('session_id', sessionId)
      .in('student_id', studentIds);
    if (deleteAnswersError) throw deleteAnswersError;
  }

  const answerPayload = [];
  for (const entry of matchedEntries) {
    if (!entry.student_id) continue;
    for (const [indexKey, choice] of Object.entries(entry.choices ?? {})) {
      const question = questionByIndex[Number(indexKey)];
      if (!question?.id) continue;
      answerPayload.push({
        session_id: sessionId,
        student_id: entry.student_id,
        question_id: question.id,
        choice,
      });
    }
  }

  if (answerPayload.length) {
    const chunkSize = 500;
    for (let offset = 0; offset < answerPayload.length; offset += chunkSize) {
      const chunk = answerPayload.slice(offset, offset + chunkSize);
      const { error } = await supabase.from('exam_student_answers').upsert(chunk, {
        onConflict: 'session_id,student_id,question_id',
      });
      if (error) throw error;
    }
  }

  const subjectPayload = [];
  for (const entry of matchedEntries) {
    if (!entry.student_id) continue;

    const enrichedAnswers = answerPayload
      .filter((row) => row.student_id === entry.student_id)
      .map((row) => {
        const question = questions.find((item) => item.id === row.question_id);
        return {
          student_id: row.student_id,
          question_id: row.question_id,
          choice: row.choice,
          exam_questions: question,
        };
      });

    const subjectRows = deriveSubjectResultsFromAnswers({
      sessionId,
      studentId: entry.student_id,
      questions,
      answers: enrichedAnswers,
    });

    subjectPayload.push(...subjectRows);
  }

  if (subjectPayload.length) {
    const { error } = await supabase.from('exam_subject_results').upsert(subjectPayload, {
      onConflict: 'session_id,student_id,subject_code',
    });
    if (error) throw error;
  }

  await computeExamRankings(sessionId);

  return {
    studentCount: studentIds.length,
    answerCount: answerPayload.length,
  };
}

export function buildOptikTemplateCsv() {
  const headers = ['okul_no', 'ad_soyad'];
  for (let index = 1; index <= 90; index += 1) {
    headers.push(`s${index}`);
  }
  const sample = [
    headers.join(','),
    '1001,Ali Veli,' + Array.from({ length: 90 }, (_, index) => (index % 5 === 0 ? '' : 'A')).join(','),
  ].join('\n');
  return `\uFEFF${sample}`;
}

export function downloadOptikTemplate() {
  const csv = buildOptikTemplateCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'optik-import-sablonu.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
