import { formatClassLabel } from '../../lib/curriculum';

export default function ExamRankingTable({ rows = [], students = [], classes = [], showClass = true }) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  if (!rows.length) {
    return <p className="dash-hint">Sıralama için sonuç girilmemiş.</p>;
  }

  return (
    <div className="exam-ranking-wrap">
      <table className="exam-ranking-table">
        <thead>
          <tr>
            <th>Sıra</th>
            <th>Öğrenci</th>
            {showClass ? <th>Şube</th> : null}
            <th>Net</th>
            <th>LGS (tah.)</th>
            <th>Sınıf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const student = studentMap.get(row.student_id);
            const klass = student?.class_id ? classMap.get(student.class_id) : null;
            return (
              <tr key={row.student_id}>
                <td>{row.school_rank ?? '—'}</td>
                <td>{student?.full_name ?? '—'}</td>
                {showClass ? (
                  <td>{klass ? formatClassLabel(klass.grade, klass.name) : '—'}</td>
                ) : null}
                <td>{row.total_net != null ? Number(row.total_net).toFixed(2) : '—'}</td>
                <td>{row.lgs_score != null ? Number(row.lgs_score).toFixed(0) : '—'}</td>
                <td>{row.class_rank ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
