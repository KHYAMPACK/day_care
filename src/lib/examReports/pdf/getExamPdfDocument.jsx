import { toExamPdfModel } from './adapters';
import { registerPdfFonts } from './registerFonts';
import { ClassCombinedPdf } from './documents/ClassCombinedPdf';
import { ClassAveragePdf } from './documents/ClassAveragePdf';
import { MultiExamAveragePdf } from './documents/MultiExamAveragePdf';
import { QuestionFrequencyPdf } from './documents/QuestionFrequencyPdf';
import { StudentAllExamsPdf } from './documents/StudentAllExamsPdf';

/** @param {import('../reportSchemas').ExamPdfModel | any} reportOrModel */
export function getExamPdfDocument(reportOrModel) {
  registerPdfFonts();
  const model = reportOrModel?.header ? reportOrModel : toExamPdfModel(reportOrModel);

  switch (model.type) {
    case 'class_combined':
      return <ClassCombinedPdf model={model} />;
    case 'question_frequency':
      return <QuestionFrequencyPdf model={model} />;
    case 'student_all_exams':
      return <StudentAllExamsPdf model={model} />;
    case 'class_average':
      return <ClassAveragePdf model={model} />;
    case 'multi_exam_average':
      return <MultiExamAveragePdf model={model} />;
    default:
      throw new Error(`Unknown PDF model type: ${model.type}`);
  }
}
