import { useMemo, useState } from 'react';
import {
  deleteExpense,
  formatCurrency,
  formatExpenseDate,
  loadExpenses,
  PROCUREMENT_LABELS,
  PROCUREMENT_STATUSES,
  saveExpense,
} from '../../lib/accounting';
import { formatClassLabel } from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { AnimatedCard } from '../ui/AnimatedCard';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const EMPTY_FORM = {
  title: '',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  supplier_id: '',
  class_id: '',
  procurement_status: 'none',
  reference_no: '',
};

function procurementChipClass(status) {
  if (status === 'received') return 'accounting-chip--mint';
  if (status === 'ordered') return 'accounting-chip--sky';
  if (status === 'requested') return 'accounting-chip--peach';
  return 'accounting-chip--muted';
}

export default function ExpenseLedger({
  schoolId,
  profile,
  categories,
  suppliers,
  expenses,
  classes,
  isDemo,
  onRefresh,
  setExpenses,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const activeSuppliers = useMemo(
    () => suppliers.filter((row) => row.is_active !== false),
    [suppliers]
  );

  const filteredExpenses = useMemo(() => {
    return expenses.filter((row) => {
      if (filterCategory && row.category_id !== filterCategory) return false;
      if (filterStatus && row.procurement_status !== filterStatus) return false;
      if (filterStart && row.expense_date < filterStart) return false;
      if (filterEnd && row.expense_date > filterEnd) return false;
      return true;
    });
  }, [expenses, filterCategory, filterStatus, filterStart, filterEnd]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      title: row.title ?? '',
      description: row.description ?? '',
      amount: String(row.amount ?? ''),
      expense_date: row.expense_date ?? EMPTY_FORM.expense_date,
      category_id: row.category_id ?? '',
      supplier_id: row.supplier_id ?? '',
      class_id: row.class_id ?? '',
      procurement_status: row.procurement_status ?? 'none',
      reference_no: row.reference_no ?? '',
    });
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isDemo) {
      setError(new Error('Demo modunda kayıt yapılamaz. Gerçek veri eklemek için en az bir gider veya bütçe dönemi oluşturun.'));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveExpense(
        schoolId,
        { ...form, id: editingId || undefined },
        profile?.id
      );
      const rows = await loadExpenses(schoolId);
      setExpenses(rows);
      setSuccess(editingId ? 'Gider güncellendi.' : 'Gider kaydedildi.');
      resetForm();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || isDemo) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteExpense(schoolId, deleteTarget.id);
      const rows = await loadExpenses(schoolId);
      setExpenses(rows);
      setSuccess('Gider silindi.');
      if (editingId === deleteTarget.id) resetForm();
    } catch (deleteError) {
      setError(deleteError);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="demo-stack">
      <AnimatedCard index={0} className="dash-card">
        <h2 className="dash-section-title">{editingId ? 'Gideri Düzenle' : 'Yeni Gider Kaydı'}</h2>
        <form className="dash-form accounting-form" onSubmit={handleSubmit}>
          <div className="accounting-form__grid">
            <label className="dash-field">
              <span className="dash-label">Başlık</span>
              <input
                className="dash-input"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Tutar (₺)</span>
              <input
                className="dash-input"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Tarih</span>
              <input
                className="dash-input"
                type="date"
                value={form.expense_date}
                onChange={(event) => setForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                required
              />
            </label>
            <label className="dash-field">
              <span className="dash-label">Kategori</span>
              <select
                className="dash-input"
                value={form.category_id}
                onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}
                required
              >
                <option value="">Seçin</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-label">Tedarikçi (isteğe bağlı)</span>
              <select
                className="dash-input"
                value={form.supplier_id}
                onChange={(event) => setForm((prev) => ({ ...prev, supplier_id: event.target.value }))}
              >
                <option value="">Yok</option>
                {activeSuppliers.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-label">Maliyet merkezi / şube</span>
              <select
                className="dash-input"
                value={form.class_id}
                onChange={(event) => setForm((prev) => ({ ...prev, class_id: event.target.value }))}
              >
                <option value="">Okul geneli</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatClassLabel(row.grade, row.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-label">Tedarik durumu</span>
              <select
                className="dash-input"
                value={form.procurement_status}
                onChange={(event) => setForm((prev) => ({ ...prev, procurement_status: event.target.value }))}
              >
                {PROCUREMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{PROCUREMENT_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-label">Referans no (PO / fatura)</span>
              <input
                className="dash-input"
                value={form.reference_no}
                onChange={(event) => setForm((prev) => ({ ...prev, reference_no: event.target.value }))}
                placeholder="PO-2025-001"
              />
            </label>
          </div>
          <label className="dash-field">
            <span className="dash-label">Açıklama</span>
            <textarea
              className="dash-input dash-input--area"
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
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
        <h2 className="dash-section-title">Gider Defteri</h2>
        <div className="accounting-filters">
          <select
            className="dash-input"
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value)}
            aria-label="Kategori filtresi"
          >
            <option value="">Tüm kategoriler</option>
            {categories.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
          <select
            className="dash-input"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            aria-label="Tedarik durumu filtresi"
          >
            <option value="">Tüm durumlar</option>
            {PROCUREMENT_STATUSES.map((status) => (
              <option key={status} value={status}>{PROCUREMENT_LABELS[status]}</option>
            ))}
          </select>
          <input
            className="dash-input"
            type="date"
            value={filterStart}
            onChange={(event) => setFilterStart(event.target.value)}
            aria-label="Başlangıç tarihi"
          />
          <input
            className="dash-input"
            type="date"
            value={filterEnd}
            onChange={(event) => setFilterEnd(event.target.value)}
            aria-label="Bitiş tarihi"
          />
        </div>

        {filteredExpenses.length === 0 ? (
          <p className="dash-hint">Kayıt bulunamadı.</p>
        ) : (
          <div className="accounting-table-wrap">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Başlık</th>
                  <th>Kategori</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((row) => {
                  const categoryName =
                    row.accounting_expense_categories?.name
                    ?? categories.find((cat) => cat.id === row.category_id)?.name
                    ?? '—';
                  return (
                    <tr key={row.id}>
                      <td>{formatExpenseDate(row.expense_date)}</td>
                      <td>
                        <strong>{row.title}</strong>
                        {row.reference_no && (
                          <span className="accounting-table__meta">{row.reference_no}</span>
                        )}
                      </td>
                      <td>{categoryName}</td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td>
                        <span className={`accounting-chip ${procurementChipClass(row.procurement_status)}`}>
                          {PROCUREMENT_LABELS[row.procurement_status] ?? row.procurement_status}
                        </span>
                      </td>
                      <td className="accounting-table__actions">
                        <button type="button" className="demo-btn demo-btn--ghost demo-btn--sm" onClick={() => startEdit(row)}>
                          Düzenle
                        </button>
                        {!isDemo && (
                          <button
                            type="button"
                            className="demo-btn demo-btn--ghost demo-btn--sm"
                            onClick={() => setDeleteTarget(row)}
                          >
                            Sil
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedCard>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Gideri sil"
        confirmLabel="Sil"
        confirming={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          <strong>{deleteTarget?.title}</strong> kaydı kalıcı olarak silinecek.
        </p>
      </ConfirmDialog>
    </div>
  );
}
