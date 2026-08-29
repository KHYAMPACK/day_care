import { buildTopicAnalysis } from '../examAnalysis';

export function buildClassCombinedReport({
  sessions,
  subjectResults,
  questions,
  answers,
  classLabel,
  schoolName,
}) {
  const sessionIds = new Set((sessions ?? []).map((s) => s.id));
  const filteredSubjects = (subjectResults ?? []).filter((r) => sessionIds.has(r.session_id));

  const examSummaries = (sessions ?? []).map((session, index) => {
    const rows = filteredSubjects.filter((r) => r.session_id === session.id);
    const participants = new Set(rows.map((r) => r.student_id)).size;
    const avgNet = participants
      ? rows.reduce((s, r) => s + (Number(r.net) || 0), 0) / participants
      : 0;
    return {
      order: index + 1,
      title: session.title,
      heldOn: session.held_on,
      participants,
      avgNet: Math.round(avgNet * 100) / 100,
    };
  });

  const topicRows = buildTopicAnalysis({
    questions,
    answers: (answers ?? []).filter((a) => sessionIds.has(a.session_id)),
  });

  return {
    type: 'class_combined',
    schoolName,
    classLabel,
    examSummaries,
    topicRows,
  };
}
