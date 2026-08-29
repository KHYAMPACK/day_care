import { buildQuestionFrequencyReport } from '../examAnalysis';

export function buildQuestionFrequencyReportData({
  session,
  questions,
  answers,
  classStudentIds,
  classLabel,
  schoolName,
}) {
  const frequencyRows = buildQuestionFrequencyReport({
    questions,
    answers,
    classStudentIds,
  });

  return {
    type: 'question_frequency',
    schoolName,
    sessionTitle: session?.title,
    sessionDate: session?.held_on,
    classLabel,
    rows: frequencyRows,
  };
}
