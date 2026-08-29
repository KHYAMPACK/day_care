import { studentAssignmentStatus, totalsFromResults } from './homework';

export function buildClassHomeworkReport({
  students,
  assignments,
  links,
  testLinks,
  results,
  tests,
  topics,
}) {
  const studentRows = students.map((student) => {
    const studentAssignments = assignments.filter((assignment) =>
      links.some((link) => link.assignment_id === assignment.id && link.student_id === student.id)
    );
    const studentResults = results.filter((row) => row.student_id === student.id);
    const totals = totalsFromResults(studentResults);
    const asked = studentResults.reduce((sum, row) => {
      const test = tests.find((item) => item.id === row.book_test_id);
      return sum + (test?.question_count ?? row.correct_count + row.wrong_count + row.blank_count);
    }, 0);

    let overdue = 0;
    let done = 0;
    studentAssignments.forEach((assignment) => {
      const status = studentAssignmentStatus({
        assignment,
        studentId: student.id,
        testLinks,
        results: studentResults,
      });
      if (status.key === 'overdue') overdue += 1;
      if (status.key === 'done') done += 1;
    });

    return {
      student,
      assignmentCount: studentAssignments.length,
      doneCount: done,
      overdueCount: overdue,
      totals,
      asked,
      percent: asked > 0 ? Math.round((totals.correct / asked) * 100) : null,
    };
  });

  const classTotals = studentRows.reduce(
    (acc, row) => {
      acc.correct += row.totals.correct;
      acc.wrong += row.totals.wrong;
      acc.blank += row.totals.blank;
      acc.asked += row.asked;
      return acc;
    },
    { correct: 0, wrong: 0, blank: 0, asked: 0 }
  );

  const topicStats = topics
    .map((topic) => {
      const topicTests = tests.filter((test) => test.topic_id === topic.id);
      const topicTestIds = new Set(topicTests.map((test) => test.id));
      const topicResults = results.filter((row) => topicTestIds.has(row.book_test_id));
      const totals = totalsFromResults(topicResults);
      const asked = totals.correct + totals.wrong + totals.blank;
      return {
        topic,
        totals,
        asked,
        percent: asked > 0 ? Math.round((totals.correct / asked) * 100) : null,
        submitted: topicResults.length,
      };
    })
    .filter((row) => row.asked > 0)
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  return {
    studentRows,
    classTotals,
    classPercent:
      classTotals.asked > 0 ? Math.round((classTotals.correct / classTotals.asked) * 100) : null,
    topicStats,
  };
}

export function buildSchoolHomeworkOverview({ classes, assignments, links, testLinks, results }) {
  return classes.map((klass) => {
    const classAssignments = assignments.filter((row) => row.class_id === klass.id);
    const assignmentIds = new Set(classAssignments.map((row) => row.id));
    const classLinks = links.filter((row) => assignmentIds.has(row.assignment_id));
    const uniqueStudents = new Set(classLinks.map((row) => row.student_id));
    let completedPairs = 0;
    let totalPairs = 0;

    classLinks.forEach((link) => {
      const assignment = classAssignments.find((row) => row.id === link.assignment_id);
      if (!assignment) return;
      const status = studentAssignmentStatus({
        assignment,
        studentId: link.student_id,
        testLinks,
        results,
      });
      totalPairs += 1;
      if (status.key === 'done') completedPairs += 1;
    });

    return {
      klass,
      assignmentCount: classAssignments.length,
      studentCount: uniqueStudents.size,
      completedPairs,
      totalPairs,
      percent: totalPairs > 0 ? Math.round((completedPairs / totalPairs) * 100) : null,
    };
  });
}
