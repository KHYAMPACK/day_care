export default function AnswerKeyReviewGrid({ questions = [], onPatch }) {
  return (
    <div className="exam-grid-wrap exam-answer-key-grid">
      <table className="exam-entry-grid">
        <thead>
          <tr>
            <th>#</th>
            <th>Ders</th>
            <th>A</th>
            <th>B</th>
            <th>CVP</th>
            <th>Konu</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.question_index}>
              <td>{q.question_index}</td>
              <td>{q.subject_code}</td>
              <td>{q.booklet_a_no}</td>
              <td>{q.booklet_b_no}</td>
              <td>
                <input
                  className="exam-cell-input"
                  maxLength={1}
                  value={q.correct_choice ?? ''}
                  onChange={(e) => onPatch?.(q.question_index, 'correct_choice', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="exam-cell-input exam-cell-input--wide"
                  value={q.topic_label ?? ''}
                  onChange={(e) => onPatch?.(q.question_index, 'topic_label', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
