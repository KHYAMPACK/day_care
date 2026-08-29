import { useMemo } from 'react';
import { formatClassLabel } from '../../lib/curriculum';

export default function CounselorStudentsTab({ students = [], classes = [], rankings = [] }) {
  const latestByStudent = useMemo(() => {
    const map = new Map();
    for (const row of rankings) {
      const heldOn = row.exam_sessions?.held_on ?? '';
      const existing = map.get(row.student_id);
      if (!existing || heldOn > (existing.heldOn ?? '')) {
        map.set(row.student_id, {
          totalNet: row.total_net,
          lgsScore: row.lgs_score,
          heldOn,
          title: row.exam_sessions?.title,
        });
      }
    }
    return map;
  }, [rankings]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Öğrenciler</h1>
        <p className="dash-subtitle">Okul geneli liste ve son deneme özeti</p>
      </header>

      <section className="dash-card">
        {students.length === 0 ? (
          <p className="dash-hint">Kayıtlı öğrenci yok.</p>
        ) : (
          <table className="exam-ranking-table">
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>Okul No</th>
                <th>Şube</th>
                <th>Son net</th>
                <th>LGS</th>
                <th>Son sınav</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const klass = classMap.get(student.class_id);
                const latest = latestByStudent.get(student.id);
                return (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>{student.student_number ?? '—'}</td>
                    <td>{klass ? formatClassLabel(klass.grade, klass.name) : '—'}</td>
                    <td>{latest?.totalNet != null ? Number(latest.totalNet).toFixed(2) : '—'}</td>
                    <td>{latest?.lgsScore != null ? Math.round(latest.lgsScore) : '—'}</td>
                    <td>{latest?.title ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
