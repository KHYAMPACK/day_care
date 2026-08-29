import { supabase } from './supabase';
import { istanbulDateIso } from './calendar';
import { formatClassLabel } from './curriculum';
import { withSchoolFilter } from './tenant';

export const HOMEWORK_COVER_BUCKET = 'homework-covers';

export const BOOK_SELECT =
  'id, school_id, subject_id, grade, title, isbn, publisher, published_on, edition, cover_url, created_by, created_at, updated_at';
export const TOPIC_SELECT = 'id, book_id, topic_code, topic_name, unit_id, sort_order';
export const TEST_SELECT = 'id, topic_id, test_no, test_name, question_count, sort_order';
export const GRANT_SELECT =
  'id, school_id, book_id, academic_year, class_id, student_id, granted_by, created_at';
export const ASSIGNMENT_SELECT =
  'id, school_id, book_id, subject_id, class_id, created_by, starts_on, due_on, notes, created_at, updated_at';
export const RESULT_SELECT =
  'id, school_id, assignment_id, student_id, book_test_id, correct_count, wrong_count, blank_count, submitted_at, submitted_by, verified_at, verified_by';

export function currentAcademicYear(isoDate = istanbulDateIso()) {
  const [year, month] = isoDate.split('-').map(Number);
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function formatDateTr(isoDate) {
  if (!isoDate) return '';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function isMissingHomeworkTable(error) {
  const message = error?.message ?? '';
  return /homework_|schema cache|does not exist/i.test(message);
}

export function compareIsoDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function assignmentWindowStatus(assignment, today = istanbulDateIso()) {
  if (!assignment) return 'upcoming';
  if (compareIsoDate(today, assignment.starts_on) < 0) return 'upcoming';
  if (compareIsoDate(today, assignment.due_on) > 0) return 'overdue';
  return 'open';
}

export function canEnterResults(assignment, today = istanbulDateIso()) {
  return assignmentWindowStatus(assignment, today) === 'open';
}

export function resultKey(assignmentId, studentId, testId) {
  return `${assignmentId}:${studentId}:${testId}`;
}

export function studentHasBookGrant(student, bookId, grants) {
  if (!student || !bookId) return false;
  return grants.some(
    (grant) =>
      grant.book_id === bookId &&
      (grant.student_id === student.id || (grant.class_id && grant.class_id === student.class_id))
  );
}

export async function loadHomeworkBooks(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase
      .from('homework_books')
      .select(BOOK_SELECT)
      .order('grade')
      .order('title'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveHomeworkBook(payload) {
  const row = {
    school_id: payload.school_id,
    subject_id: payload.subject_id,
    grade: payload.grade,
    title: payload.title.trim(),
    isbn: payload.isbn?.trim() || null,
    publisher: payload.publisher?.trim() || null,
    published_on: payload.published_on || null,
    edition: payload.edition?.trim() || null,
    cover_url: payload.cover_url || null,
    created_by: payload.created_by ?? null,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('homework_books')
      .update(row)
      .eq('id', payload.id)
      .select(BOOK_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('homework_books')
    .insert(row)
    .select(BOOK_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHomeworkBook(bookId) {
  const { error } = await supabase.from('homework_books').delete().eq('id', bookId);
  if (error) throw error;
}

export async function uploadBookCover(schoolId, bookId, file) {
  const mime = file.type || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${schoolId}/${bookId}/cover.${ext}`;
  const { error } = await supabase.storage.from(HOMEWORK_COVER_BUCKET).upload(path, file, {
    upsert: true,
    contentType: mime,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(HOMEWORK_COVER_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function loadBookIndex(bookId) {
  const { data: topics, error: topicError } = await supabase
    .from('homework_book_topics')
    .select(TOPIC_SELECT)
    .eq('book_id', bookId)
    .order('sort_order');
  if (topicError) throw topicError;

  const topicIds = (topics ?? []).map((topic) => topic.id);
  let tests = [];
  if (topicIds.length) {
    const { data, error } = await supabase
      .from('homework_book_tests')
      .select(TEST_SELECT)
      .in('topic_id', topicIds)
      .order('sort_order');
    if (error) throw error;
    tests = data ?? [];
  }

  return { topics: topics ?? [], tests };
}

export function groupIndexByTopic(topics, tests) {
  const testsByTopic = {};
  tests.forEach((test) => {
    if (!testsByTopic[test.topic_id]) testsByTopic[test.topic_id] = [];
    testsByTopic[test.topic_id].push(test);
  });
  return topics.map((topic) => ({
    ...topic,
    tests: testsByTopic[topic.id] ?? [],
  }));
}

export async function replaceBookIndex(bookId, groupedTopics) {
  const { error: deleteError } = await supabase
    .from('homework_book_topics')
    .delete()
    .eq('book_id', bookId);
  if (deleteError) throw deleteError;
  return appendBookIndex(bookId, groupedTopics, 0);
}

export async function appendBookIndex(bookId, groupedTopics, startOrder = 0) {
  if (!groupedTopics.length) return { topics: [], tests: [] };

  const topicRows = groupedTopics.map((topic, index) => ({
    book_id: bookId,
    topic_code: topic.topic_code,
    topic_name: topic.topic_name,
    unit_id: topic.unit_id || null,
    sort_order: startOrder + index + 1,
  }));

  const { data: insertedTopics, error: topicError } = await supabase
    .from('homework_book_topics')
    .insert(topicRows)
    .select(TOPIC_SELECT);
  if (topicError) throw topicError;

  const topicByCode = Object.fromEntries(
    (insertedTopics ?? []).map((topic) => [topic.topic_code, topic])
  );

  const testRows = [];
  groupedTopics.forEach((topic) => {
    const inserted = topicByCode[topic.topic_code];
    if (!inserted) return;
    (topic.tests ?? []).forEach((test, index) => {
      testRows.push({
        topic_id: inserted.id,
        test_no: test.test_no,
        test_name: test.test_name,
        question_count: test.question_count,
        sort_order: index + 1,
      });
    });
  });

  if (testRows.length) {
    const { error: testError } = await supabase.from('homework_book_tests').insert(testRows);
    if (testError) throw testError;
  }

  return loadBookIndex(bookId);
}

export async function loadBookGrants(schoolId, academicYear) {
  let query = withSchoolFilter(
    supabase.from('homework_book_grants').select(GRANT_SELECT).order('created_at', { ascending: false }),
    schoolId
  );
  if (academicYear) query = query.eq('academic_year', academicYear);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createBookGrant({
  schoolId,
  bookId,
  academicYear,
  classId = null,
  studentId = null,
  grantedBy,
}) {
  const { data, error } = await supabase
    .from('homework_book_grants')
    .insert({
      school_id: schoolId,
      book_id: bookId,
      academic_year: academicYear,
      class_id: classId,
      student_id: studentId,
      granted_by: grantedBy ?? null,
    })
    .select(GRANT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBookGrant(grantId) {
  const { error } = await supabase.from('homework_book_grants').delete().eq('id', grantId);
  if (error) throw error;
}

export async function loadClassStudents(schoolId, classId) {
  const { data, error } = await withSchoolFilter(
    supabase
      .from('students')
      .select('id, school_id, full_name, grade, class_id, student_number')
      .eq('class_id', classId)
      .order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function loadSchoolStudents(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase
      .from('students')
      .select('id, school_id, full_name, grade, class_id, student_number')
      .order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export function grantedBooksForTargets({ books, grants, classId, studentIds = [] }) {
  const studentSet = new Set(studentIds);
  return books.filter((book) =>
    grants.some(
      (grant) =>
        grant.book_id === book.id &&
        ((classId && grant.class_id === classId) ||
          (grant.student_id && studentSet.has(grant.student_id)))
    )
  );
}

export async function createHomeworkAssignment({
  schoolId,
  bookId,
  subjectId,
  classId,
  createdBy,
  studentIds,
  testIds,
  startsOn,
  dueOn,
  notes,
}) {
  const { data: assignment, error: assignmentError } = await supabase
    .from('homework_assignments')
    .insert({
      school_id: schoolId,
      book_id: bookId,
      subject_id: subjectId,
      class_id: classId || null,
      created_by: createdBy,
      starts_on: startsOn,
      due_on: dueOn,
      notes: notes?.trim() ?? '',
    })
    .select(ASSIGNMENT_SELECT)
    .single();

  if (assignmentError) throw assignmentError;

  try {
    const studentRows = studentIds.map((studentId) => ({
      assignment_id: assignment.id,
      student_id: studentId,
    }));
    const { error: studentError } = await supabase
      .from('homework_assignment_students')
      .insert(studentRows);
    if (studentError) throw studentError;

    const testRows = testIds.map((bookTestId) => ({
      assignment_id: assignment.id,
      book_test_id: bookTestId,
    }));
    const { error: testError } = await supabase
      .from('homework_assignment_tests')
      .insert(testRows);
    if (testError) throw testError;
  } catch (nestedError) {
    await supabase.from('homework_assignments').delete().eq('id', assignment.id);
    throw nestedError;
  }

  return assignment;
}

export async function deleteHomeworkAssignment(assignmentId) {
  const { error } = await supabase.from('homework_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

export async function loadHomeworkAssignments(schoolId, { classId, createdBy } = {}) {
  let query = withSchoolFilter(
    supabase
      .from('homework_assignments')
      .select(ASSIGNMENT_SELECT)
      .order('due_on', { ascending: false }),
    schoolId
  );
  if (classId) query = query.eq('class_id', classId);
  if (createdBy) query = query.eq('created_by', createdBy);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function loadAssignmentStudents(assignmentIds) {
  if (!assignmentIds.length) return [];
  const { data, error } = await supabase
    .from('homework_assignment_students')
    .select('assignment_id, student_id')
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  return data ?? [];
}

export async function loadAssignmentTests(assignmentIds) {
  if (!assignmentIds.length) return [];
  const { data, error } = await supabase
    .from('homework_assignment_tests')
    .select('assignment_id, book_test_id')
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  return data ?? [];
}

export async function loadHomeworkResults({ assignmentIds = [], studentIds = [] } = {}) {
  if (!assignmentIds.length && !studentIds.length) return [];
  let query = supabase.from('homework_results').select(RESULT_SELECT);
  if (assignmentIds.length) query = query.in('assignment_id', assignmentIds);
  if (studentIds.length) query = query.in('student_id', studentIds);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function loadTestsByIds(testIds) {
  if (!testIds.length) return [];
  const { data, error } = await supabase
    .from('homework_book_tests')
    .select(TEST_SELECT)
    .in('id', testIds)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function loadTopicsByIds(topicIds) {
  if (!topicIds.length) return [];
  const { data, error } = await supabase
    .from('homework_book_topics')
    .select(TOPIC_SELECT)
    .in('id', topicIds)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function loadHomeworkBundle(schoolId, { classId, createdBy, studentIds } = {}) {
  const assignments = studentIds?.length
    ? await loadAssignmentsForStudents(studentIds)
    : await loadHomeworkAssignments(schoolId, { classId, createdBy });

  const assignmentIds = assignments.map((row) => row.id);
  const [links, testLinks, results] = await Promise.all([
    loadAssignmentStudents(assignmentIds),
    loadAssignmentTests(assignmentIds),
    loadHomeworkResults({ assignmentIds, studentIds }),
  ]);

  const testIds = [...new Set(testLinks.map((row) => row.book_test_id))];
  const tests = await loadTestsByIds(testIds);
  const topicIds = [...new Set(tests.map((test) => test.topic_id))];
  const topics = await loadTopicsByIds(topicIds);
  const bookIds = [...new Set(assignments.map((row) => row.book_id))];
  const books = bookIds.length
    ? (await loadHomeworkBooks(schoolId)).filter((book) => bookIds.includes(book.id))
    : [];

  return { assignments, links, testLinks, results, tests, topics, books };
}

export async function loadAssignmentsForStudents(studentIds) {
  if (!studentIds.length) return [];
  const { data: links, error: linkError } = await supabase
    .from('homework_assignment_students')
    .select('assignment_id, student_id')
    .in('student_id', studentIds);
  if (linkError) throw linkError;

  const assignmentIds = [...new Set((links ?? []).map((row) => row.assignment_id))];
  if (!assignmentIds.length) return [];

  const { data, error } = await supabase
    .from('homework_assignments')
    .select(ASSIGNMENT_SELECT)
    .in('id', assignmentIds)
    .order('due_on', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertHomeworkResults(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from('homework_results')
    .upsert(rows, { onConflict: 'assignment_id,student_id,book_test_id' })
    .select(RESULT_SELECT);
  if (error) throw error;
  return data ?? [];
}

export function studentAssignmentStatus({
  assignment,
  studentId,
  testLinks,
  results,
  today = istanbulDateIso(),
}) {
  const assignedTests = testLinks.filter((row) => row.assignment_id === assignment.id);
  const submitted = results.filter(
    (row) => row.assignment_id === assignment.id && row.student_id === studentId
  );
  const total = assignedTests.length;
  const done = submitted.length;
  const window = assignmentWindowStatus(assignment, today);

  if (total === 0) return { key: 'empty', label: 'Test yok', done, total };
  if (done >= total) return { key: 'done', label: 'Tamamlandı', done, total };
  if (window === 'upcoming') return { key: 'upcoming', label: 'Başlamadı', done, total };
  if (window === 'overdue') return { key: 'overdue', label: 'Gecikmiş', done, total };
  if (done > 0) return { key: 'progress', label: 'Devam ediyor', done, total };
  return { key: 'open', label: 'Bekliyor', done, total };
}

export function totalsFromResults(results) {
  return results.reduce(
    (acc, row) => {
      acc.correct += Number(row.correct_count) || 0;
      acc.wrong += Number(row.wrong_count) || 0;
      acc.blank += Number(row.blank_count) || 0;
      return acc;
    },
    { correct: 0, wrong: 0, blank: 0 }
  );
}

export function formatGrantLabel(grant, { classes = [], students = [], books = [] } = {}) {
  const book = books.find((row) => row.id === grant.book_id);
  const klass = classes.find((row) => row.id === grant.class_id);
  const student = students.find((row) => row.id === grant.student_id);
  const target = klass
    ? formatClassLabel(klass.grade, klass.name)
    : student?.full_name ?? 'Öğrenci';
  return `${book?.title ?? 'Kitap'} · ${target}`;
}
