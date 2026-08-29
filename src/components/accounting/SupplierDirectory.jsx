import { useState } from 'react';
import { deactivateSupplier, loadSuppliers, saveSupplier } from '../../lib/accounting';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { AnimatedCard } from '../ui/AnimatedCard';

const EMPTY_FORM = {
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  notes: '',
};

export default function SupplierDirectory({
  schoolId,
  suppliers,
  isDemo,
  setSuppliers,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const visibleSuppliers = suppliers.filter((row) => showInactive || row.is_active !== false);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name ?? '',
      contact_name: row.contact_name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      notes: row.notes ?? '',
    });
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isDemo) {
      setError(new Error('Demo modunda tedarikçi kaydedilemez.'));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveSupplier(schoolId, { ...form, id: editingId || undefined });
      const rows = await loadSuppliers(schoolId);
      setSuppliers(rows);
      setSuccess(editingId ? 'Tedarikçi güncellendi.' : 'Tedarikçi eklendi.');
      resetForm();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(supplierId) {
    if (isDemo) return;
    setError(null);
    try {
      await deactivateSupplier(schoolId, supplierId);
      const rows = await loadSuppliers(schoolId);
      setSuppliers(rows);
      setSuccess('Tedarikçi pasifleştirildi.');
    } catch (deactivateError) {
      setError(deactivateError);
    }
  }

  return (
    <div className="demo-stack">
      <AnimatedCard index={0} className="dash-card">
        <h2 className="dash-section-title">{editingId ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi'}</h2>
        <form className="dash-form accounting-form" onSubmit={handleSubmit}>
          <div className="accounting-form__grid">
            <label className="dash-field">
              <span className="dash-label">Firma adı</span>
              <input
                className="dash-input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Yetkili</span>
              <input
                className="dash-input"
                value={form.contact_name}
                onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))}
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Telefon</span>
              <input
                className="dash-input"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">E-posta</span>
              <input
                className="dash-input"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
          </div>
          <label className="dash-field">
            <span className="dash-label">Notlar</span>
            <textarea
              className="dash-input dash-input--area"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="accounting-form__actions">
            {editingId && (
              <button type="button" className="demo-btn demo-btn--ghost" onClick={resetForm}>
                İptal
              </button>
            )}
            <SendButton type="submit" loading={saving} disabled={saving}>
              {editingId ? 'Güncelle' : 'Kaydet'}
            </SendButton>
          </div>
        </form>
        {success && <SuccessMessage message={success} />}
        {error && <InlineError error={error} />}
      </AnimatedCard>

      <AnimatedCard index={1} className="dash-card">
        <div className="accounting-panel__head">
          <h2 className="dash-section-title">Tedarikçi Rehberi</h2>
          <label className="accounting-check">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Pasifleri göster
          </label>
        </div>

        {visibleSuppliers.length === 0 ? (
          <p className="dash-hint">Tedarikçi kaydı yok.</p>
        ) : (
          <ul className="accounting-supplier-list">
            {visibleSuppliers.map((row) => (
              <li key={row.id} className={`accounting-supplier${row.is_active === false ? ' accounting-supplier--inactive' : ''}`}>
                <div>
                  <strong>{row.name}</strong>
                  {row.is_active === false && (
                    <span className="accounting-chip accounting-chip--muted">Pasif</span>
                  )}
                  {row.contact_name && <p className="accounting-supplier__meta">{row.contact_name}</p>}
                  {(row.phone || row.email) && (
                    <p className="accounting-supplier__meta">
                      {[row.phone, row.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {row.notes && <p className="accounting-supplier__notes">{row.notes}</p>}
                </div>
                <div className="accounting-table__actions">
                  <button type="button" className="demo-btn demo-btn--ghost demo-btn--sm" onClick={() => startEdit(row)}>
                    Düzenle
                  </button>
                  {row.is_active !== false && !isDemo && (
                    <button
                      type="button"
                      className="demo-btn demo-btn--ghost demo-btn--sm"
                      onClick={() => handleDeactivate(row.id)}
                    >
                      Pasifleştir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AnimatedCard>
    </div>
  );
}
