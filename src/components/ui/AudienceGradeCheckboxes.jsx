import { STUDENT_GRADES, formatStudentGrade, isAllGradesSelected } from '../../lib/calendar';

export default function AudienceGradeCheckboxes({
  value = [],
  onChange,
  label = 'Hedef kitle',
  hint = 'Seçim yapmazsanız etkinlik tüm okulda görünür.',
  requireSelection = false,
}) {
  const selected = Array.isArray(value) ? value : [];
  const allSelected = isAllGradesSelected(selected);

  function setSelected(next) {
    onChange([...next].sort((a, b) => a - b));
  }

  function toggleAll(checked) {
    setSelected(checked ? [...STUDENT_GRADES] : []);
  }

  function toggleGrade(grade, checked) {
    if (checked) {
      setSelected([...selected, grade]);
      return;
    }
    setSelected(selected.filter((item) => item !== grade));
  }

  return (
    <div className="audience-grade-checkboxes">
      <p className="dash-label">{label}</p>
      {hint ? <p className="audience-grade-checkboxes__hint">{hint}</p> : null}
      <ul className="audience-grade-checkboxes__list">
        <li>
          <label className="audience-grade-checkboxes__item">
            <input
              type="checkbox"
              className="audience-grade-checkboxes__input"
              checked={allSelected}
              onChange={(event) => toggleAll(event.target.checked)}
            />
            <span>Tüm sınıflar</span>
          </label>
        </li>
        {STUDENT_GRADES.map((grade) => (
          <li key={grade}>
            <label className="audience-grade-checkboxes__item">
              <input
                type="checkbox"
                className="audience-grade-checkboxes__input"
                checked={selected.includes(grade)}
                onChange={(event) => toggleGrade(grade, event.target.checked)}
              />
              <span>{formatStudentGrade(grade)}</span>
            </label>
          </li>
        ))}
      </ul>
      {requireSelection && selected.length === 0 ? (
        <p className="dash-field-error">En az bir sınıf seçin.</p>
      ) : null}
    </div>
  );
}
