import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatStudentGrade } from '../../lib/calendar';
import {
  sectionOptionsForUnit,
  unitsForSubjectAndGrades,
} from '../../lib/examKonuMapping';
import { subjectByCode } from '../../lib/lgsExam';

function KonuMappingRow({ item, units, grades, value, onChange }) {
  const subjectUnits = useMemo(
    () => unitsForSubjectAndGrades(units, item.subject_code, grades),
    [units, item.subject_code, grades]
  );
  const selectedUnit = subjectUnits.find((unit) => unit.id === value.unitId) ?? null;
  const sections = sectionOptionsForUnit(selectedUnit);
  const subjectLabel = subjectByCode(item.subject_code)?.label ?? item.subject_code;

  return (
    <article className="exam-konu-map-row">
      <div className="exam-konu-map-row__source">
        <p className="exam-konu-map-row__label">{item.topicLabel}</p>
        <p className="exam-konu-map-row__meta">
          {subjectLabel} · {item.questionCount} soru
        </p>
      </div>
      <div className="exam-konu-map-row__target">
        <label className="dash-label">
          Ünite
          <select
            className="dash-input"
            value={value.unitId ?? ''}
            onChange={(event) => {
              const unitId = event.target.value || null;
              onChange({ unitId, sectionLabel: null, skipped: false });
            }}
          >
            <option value="">Seçin…</option>
            {subjectUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {formatStudentGrade(unit.curriculum_subjects?.grade)} · {unit.title}
              </option>
            ))}
          </select>
        </label>
        {sections.length ? (
          <label className="dash-label">
            Alt konu
            <select
              className="dash-input"
              value={value.sectionLabel ?? ''}
              disabled={!value.unitId}
              onChange={(event) =>
                onChange({
                  ...value,
                  sectionLabel: event.target.value || null,
                  skipped: false,
                })
              }
            >
              <option value="">Ünite geneli</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="exam-konu-map-row__skip">
          <input
            type="checkbox"
            checked={Boolean(value.skipped)}
            onChange={(event) =>
              onChange({
                unitId: null,
                sectionLabel: null,
                skipped: event.target.checked,
              })
            }
          />
          Eşleme yok (atla)
        </label>
      </div>
    </article>
  );
}

export default function KonuEslestirmeDialog({
  open,
  unknownItems = [],
  units = [],
  grades = [],
  saving = false,
  onCancel,
  onConfirm,
}) {
  const [choices, setChoices] = useState({});

  useEffect(() => {
    if (!open) return;
    const initial = {};
    for (const item of unknownItems) {
      const key = `${item.subject_code}::${item.topicLabel}`;
      initial[key] = { unitId: null, sectionLabel: null, skipped: false };
    }
    setChoices(initial);
  }, [open, unknownItems]);

  const pendingCount = unknownItems.length;
  const resolvedCount = unknownItems.filter((item) => {
    const key = `${item.subject_code}::${item.topicLabel}`;
    const choice = choices[key];
    return choice?.skipped || choice?.unitId;
  }).length;
  const canConfirm = pendingCount > 0 && resolvedCount === pendingCount;

  if (!open) return null;

  return createPortal(
    <div className="app-dialog" role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className="app-dialog__panel exam-konu-map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="konu-map-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="konu-map-title" className="app-dialog__title">
          Konuları müfredata bağla
        </h2>
        <p className="app-dialog__lead">
          {pendingCount} yeni konu etiketi bulundu. Her birini ilgili üniteye bağlayın; bir kez
          kaydedince sonraki denemelerde otomatik eşleşir.
          {grades.length ? (
            <>
              {' '}
              Sınıflar: {grades.map((grade) => formatStudentGrade(grade)).join(', ')}
            </>
          ) : null}
        </p>

        <div className="exam-konu-map-dialog__list">
          {unknownItems.map((item) => {
            const key = `${item.subject_code}::${item.topicLabel}`;
            return (
              <KonuMappingRow
                key={key}
                item={item}
                units={units}
                grades={grades}
                value={choices[key] ?? { unitId: null, sectionLabel: null, skipped: false }}
                onChange={(next) =>
                  setChoices((current) => ({
                    ...current,
                    [key]: next,
                  }))
                }
              />
            );
          })}
        </div>

        <p className="dash-hint exam-konu-map-dialog__progress">
          {resolvedCount}/{pendingCount} konu çözüldü
        </p>

        <div className="app-dialog__actions">
          <button type="button" className="demo-btn demo-btn--ghost" disabled={saving} onClick={onCancel}>
            İptal
          </button>
          <button
            type="button"
            className="demo-btn demo-btn--primary"
            disabled={saving || !canConfirm}
            onClick={() =>
              onConfirm(
                unknownItems.map((item) => {
                  const key = `${item.subject_code}::${item.topicLabel}`;
                  const choice = choices[key] ?? {};
                  return {
                    subject_code: item.subject_code,
                    topicLabel: item.topicLabel,
                    unitId: choice.skipped ? null : choice.unitId ?? null,
                    sectionLabel: choice.skipped ? null : choice.sectionLabel ?? null,
                  };
                })
              )
            }
          >
            {saving ? 'Kaydediliyor…' : 'Eşleştir ve devam et'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
