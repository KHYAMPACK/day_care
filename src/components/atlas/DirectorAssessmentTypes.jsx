import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

function slugify(value) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export default function DirectorAssessmentTypes({ schoolId }) {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await withSchoolFilter(
        supabase
          .from('assessment_types')
          .select('id, name, slug, sort_order, is_active')
          .order('sort_order'),
        schoolId
      );
      if (loadError) throw loadError;
      setTypes(data ?? []);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const slug = slugify(trimmed) || `type_${Date.now()}`;
      const sortOrder = types.length ? Math.max(...types.map((t) => t.sort_order)) + 1 : 1;
      const { error: insertError } = await supabase.from('assessment_types').insert({
        school_id: schoolId,
        name: trimmed,
        slug,
        sort_order: sortOrder,
      });
      if (insertError) throw insertError;
      setName('');
      setSuccess('Değerlendirme türü eklendi.');
      await load();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('assessment_types')
        .update({ is_active: !row.is_active })
        .eq('id', row.id);
      if (updateError) throw updateError;
      await load();
    } catch (updateError) {
      setError(updateError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <details className="cal-collapsible-form dash-card">
        <summary className="cal-collapsible-form__summary cal-browser__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="cal-browser__summary-text">
            <span className="dash-section-title">Değerlendirme türleri</span>
            <span className="dash-hint">Yükleniyor…</span>
          </span>
        </summary>
      </details>
    );
  }

  return (
    <details className="cal-collapsible-form dash-card">
      <summary className="cal-collapsible-form__summary cal-browser__summary">
        <span className="cal-collapsible-form__chevron" aria-hidden="true" />
        <span className="cal-browser__summary-text">
          <span className="dash-section-title">Değerlendirme türleri</span>
          <span className="dash-hint">Quiz, Konu Ölçme gibi test kategorilerini yönetin.</span>
        </span>
      </summary>

      <div className="cal-collapsible-form__body">
        {error && <InlineError error={error} context="general" />}
        {success && <SuccessMessage message={success} />}

        <ul className="atlas-type-list">
          {types.map((row) => (
            <li key={row.id} className="atlas-type-list__row">
              <span>{row.name}</span>
              <button
                type="button"
                className="demo-btn demo-btn--ghost"
                disabled={saving}
                onClick={() => toggleActive(row)}
              >
                {row.is_active ? 'Pasifleştir' : 'Etkinleştir'}
              </button>
            </li>
          ))}
        </ul>

        <form className="dash-form" onSubmit={handleAdd}>
          <label className="dash-label">
            Yeni tür
            <input
              className="dash-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Örn. Deneme"
              disabled={saving}
            />
          </label>
          <SendButton sending={saving} label="Ekle" sendingLabel="Ekleniyor…" />
        </form>
      </div>
    </details>
  );
}
