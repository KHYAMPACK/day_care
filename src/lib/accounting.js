import { supabase } from './supabase';
import { withSchoolFilter, requireSchoolId } from './tenant';

export const PROCUREMENT_STATUSES = ['none', 'requested', 'ordered', 'received'];

export const PROCUREMENT_LABELS = {
  none: 'Yok',
  requested: 'Talep edildi',
  ordered: 'Sipariş verildi',
  received: 'Teslim alındı',
};

export const DEFAULT_CATEGORIES = [
  { name: 'Kırtasiye', sort_order: 1, color: 'lavender' },
  { name: 'Temizlik', sort_order: 2, color: 'mint' },
  { name: 'Bakım', sort_order: 3, color: 'peach' },
  { name: 'Yemek', sort_order: 4, color: 'sky' },
  { name: 'Eğitim Materyali', sort_order: 5, color: 'rose' },
  { name: 'Diğer', sort_order: 6, color: 'lavender' },
];

export const CATEGORY_SELECT = 'id, school_id, name, sort_order, color, created_at, updated_at';
export const SUPPLIER_SELECT =
  'id, school_id, name, contact_name, phone, email, notes, is_active, created_at, updated_at';
export const EXPENSE_SELECT = `
  id, school_id, category_id, supplier_id, class_id,
  title, description, amount, expense_date,
  procurement_status, reference_no, created_by, created_at, updated_at,
  accounting_expense_categories ( id, name, color ),
  accounting_suppliers ( id, name ),
  classes ( id, grade, name )
`;
export const PERIOD_SELECT = 'id, school_id, name, start_date, end_date, is_active, created_at, updated_at';
export const BUDGET_LINE_SELECT =
  'id, school_id, period_id, category_id, planned_amount, notes, created_at, updated_at, accounting_expense_categories ( id, name, color )';

export function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '₺0';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatExpenseDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00`));
}

export async function loadCategories(schoolId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase.from('accounting_expense_categories').select(CATEGORY_SELECT).order('sort_order'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function ensureDefaultCategories(schoolId) {
  const existing = await loadCategories(schoolId);
  if (existing.length > 0) return existing;

  const rows = DEFAULT_CATEGORIES.map((row) => ({ ...row, school_id: schoolId }));
  const { data, error } = await supabase.from('accounting_expense_categories').insert(rows).select(CATEGORY_SELECT);
  if (error) throw error;
  return data ?? [];
}

export async function loadSuppliers(schoolId, { activeOnly = false } = {}) {
  requireSchoolId(schoolId);
  let query = supabase.from('accounting_suppliers').select(SUPPLIER_SELECT).order('name');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await withSchoolFilter(query, schoolId);
  if (error) throw error;
  return data ?? [];
}

export async function saveSupplier(schoolId, payload) {
  requireSchoolId(schoolId);
  const row = {
    school_id: schoolId,
    name: payload.name?.trim(),
    contact_name: payload.contact_name?.trim() || null,
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    notes: payload.notes?.trim() || null,
    is_active: payload.is_active !== false,
  };

  if (!row.name) throw new Error('Tedarikçi adı gerekli.');

  if (payload.id) {
    const { data, error } = await withSchoolFilter(
      supabase.from('accounting_suppliers').update(row).eq('id', payload.id).select(SUPPLIER_SELECT).single(),
      schoolId
    );
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('accounting_suppliers')
    .insert(row)
    .select(SUPPLIER_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateSupplier(schoolId, supplierId) {
  requireSchoolId(schoolId);
  const { error } = await withSchoolFilter(
    supabase.from('accounting_suppliers').update({ is_active: false }).eq('id', supplierId),
    schoolId
  );
  if (error) throw error;
}

export async function loadExpenses(schoolId, { startDate, endDate, categoryId, classId, supplierId } = {}) {
  requireSchoolId(schoolId);
  let query = supabase
    .from('accounting_expenses')
    .select(EXPENSE_SELECT)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (startDate) query = query.gte('expense_date', startDate);
  if (endDate) query = query.lte('expense_date', endDate);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (classId) query = query.eq('class_id', classId);
  if (supplierId) query = query.eq('supplier_id', supplierId);

  const { data, error } = await withSchoolFilter(query, schoolId);
  if (error) throw error;
  return data ?? [];
}

export async function saveExpense(schoolId, payload, createdBy) {
  requireSchoolId(schoolId);
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Geçerli bir tutar girin.');
  }
  if (!payload.title?.trim()) throw new Error('Gider başlığı gerekli.');
  if (!payload.category_id) throw new Error('Kategori seçin.');
  if (!payload.expense_date) throw new Error('Tarih gerekli.');

  const row = {
    school_id: schoolId,
    category_id: payload.category_id,
    supplier_id: payload.supplier_id || null,
    class_id: payload.class_id || null,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    amount,
    expense_date: payload.expense_date,
    procurement_status: PROCUREMENT_STATUSES.includes(payload.procurement_status)
      ? payload.procurement_status
      : 'none',
    reference_no: payload.reference_no?.trim() || null,
  };

  if (payload.id) {
    const { data, error } = await withSchoolFilter(
      supabase.from('accounting_expenses').update(row).eq('id', payload.id).select(EXPENSE_SELECT).single(),
      schoolId
    );
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('accounting_expenses')
    .insert({ ...row, created_by: createdBy ?? null })
    .select(EXPENSE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(schoolId, expenseId) {
  requireSchoolId(schoolId);
  const { error } = await withSchoolFilter(
    supabase.from('accounting_expenses').delete().eq('id', expenseId),
    schoolId
  );
  if (error) throw error;
}

export async function loadBudgetPeriods(schoolId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase.from('accounting_budget_periods').select(PERIOD_SELECT).order('start_date', { ascending: false }),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveBudgetPeriod(schoolId, payload) {
  requireSchoolId(schoolId);
  if (!payload.name?.trim()) throw new Error('Dönem adı gerekli.');
  if (!payload.start_date || !payload.end_date) throw new Error('Başlangıç ve bitiş tarihi gerekli.');
  if (payload.end_date < payload.start_date) throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');

  const row = {
    school_id: schoolId,
    name: payload.name.trim(),
    start_date: payload.start_date,
    end_date: payload.end_date,
    is_active: Boolean(payload.is_active),
  };

  if (payload.is_active) {
    await withSchoolFilter(
      supabase.from('accounting_budget_periods').update({ is_active: false }),
      schoolId
    );
  }

  if (payload.id) {
    const { data, error } = await withSchoolFilter(
      supabase.from('accounting_budget_periods').update(row).eq('id', payload.id).select(PERIOD_SELECT).single(),
      schoolId
    );
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('accounting_budget_periods')
    .insert(row)
    .select(PERIOD_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function loadBudgetLines(schoolId, periodId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase
      .from('accounting_budget_lines')
      .select(BUDGET_LINE_SELECT)
      .eq('period_id', periodId)
      .order('category_id'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveBudgetLine(schoolId, payload) {
  requireSchoolId(schoolId);
  const plannedAmount = Number(payload.planned_amount);
  if (!Number.isFinite(plannedAmount) || plannedAmount < 0) {
    throw new Error('Planlanan tutar geçersiz.');
  }
  if (!payload.period_id || !payload.category_id) {
    throw new Error('Dönem ve kategori gerekli.');
  }

  const row = {
    school_id: schoolId,
    period_id: payload.period_id,
    category_id: payload.category_id,
    planned_amount: plannedAmount,
    notes: payload.notes?.trim() || null,
  };

  if (payload.id) {
    const { data, error } = await withSchoolFilter(
      supabase.from('accounting_budget_lines').update(row).eq('id', payload.id).select(BUDGET_LINE_SELECT).single(),
      schoolId
    );
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('accounting_budget_lines')
    .upsert(row, { onConflict: 'period_id,category_id' })
    .select(BUDGET_LINE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

function sumAmounts(rows, pick = (row) => row.amount) {
  return (rows ?? []).reduce((total, row) => total + Number(pick(row) || 0), 0);
}

function monthKey(dateStr) {
  return dateStr?.slice(0, 7) ?? 'unknown';
}

function monthLabel(key) {
  if (!key || key === 'unknown') return '—';
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric' }).format(
    new Date(Number(year), Number(month) - 1, 1)
  );
}

export function buildFinanceSummary({ expenses = [], budgetLines = [], categories = [], period = null, classes = [] } = {}) {
  const scopedExpenses = period
    ? expenses.filter(
        (row) => row.expense_date >= period.start_date && row.expense_date <= period.end_date
      )
    : expenses;

  const totalSpent = sumAmounts(scopedExpenses);
  const totalPlanned = sumAmounts(budgetLines, (row) => row.planned_amount);
  const variance = totalPlanned - totalSpent;

  const categoryById = Object.fromEntries((categories ?? []).map((row) => [row.id, row]));
  const classById = Object.fromEntries((classes ?? []).map((row) => [row.id, row]));

  const spentByCategory = new Map();
  for (const expense of scopedExpenses) {
    const key = expense.category_id;
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + Number(expense.amount));
  }

  const plannedByCategory = new Map();
  for (const line of budgetLines ?? []) {
    plannedByCategory.set(line.category_id, Number(line.planned_amount ?? 0));
  }

  const categoryIds = new Set([
    ...spentByCategory.keys(),
    ...plannedByCategory.keys(),
    ...(categories ?? []).map((row) => row.id),
  ]);

  const byCategory = [...categoryIds].map((categoryId) => {
    const category = categoryById[categoryId];
    const actual = spentByCategory.get(categoryId) ?? 0;
    const planned = plannedByCategory.get(categoryId) ?? 0;
    return {
      categoryId,
      name: category?.name ?? 'Diğer',
      color: category?.color ?? 'lavender',
      actual,
      planned,
      variance: planned - actual,
    };
  }).sort((a, b) => b.actual - a.actual);

  const monthBuckets = new Map();
  for (const expense of scopedExpenses) {
    const key = monthKey(expense.expense_date);
    monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + Number(expense.amount));
  }
  const byMonth = [...monthBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amount]) => ({ key, label: monthLabel(key), amount }));

  const supplierBuckets = new Map();
  for (const expense of scopedExpenses) {
    const supplierId = expense.supplier_id ?? 'none';
    const supplierName =
      expense.accounting_suppliers?.name
      ?? (supplierId === 'none' ? 'Tedarikçisiz' : 'Tedarikçi');
    const existing = supplierBuckets.get(supplierId);
    if (existing) {
      existing.amount += Number(expense.amount);
    } else {
      supplierBuckets.set(supplierId, { supplierId, name: supplierName, amount: Number(expense.amount) });
    }
  }
  const topSuppliers = [...supplierBuckets.values()]
    .filter((row) => row.supplierId !== 'none')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const classBuckets = new Map();
  for (const expense of scopedExpenses) {
    if (!expense.class_id) continue;
    const klass = classById[expense.class_id] ?? expense.classes;
    const label = klass ? `${klass.grade}-${klass.name}` : 'Şube';
    classBuckets.set(expense.class_id, {
      classId: expense.class_id,
      label,
      amount: (classBuckets.get(expense.class_id)?.amount ?? 0) + Number(expense.amount),
    });
  }
  const byClass = [...classBuckets.values()].sort((a, b) => b.amount - a.amount);

  return {
    totalSpent,
    totalPlanned,
    variance,
    byCategory,
    byMonth,
    topSuppliers,
    byClass,
    expenseCount: scopedExpenses.length,
  };
}

export function donutSegmentsFromCategories(byCategory) {
  const palette = {
    lavender: '#c4b5fd',
    mint: '#6ec8a0',
    peach: '#f4a574',
    sky: '#7ec8e3',
    rose: '#f0a8b8',
  };
  return byCategory
    .filter((row) => row.actual > 0)
    .map((row) => ({
      key: row.categoryId,
      label: row.name,
      value: row.actual,
      color: palette[row.color] ?? palette.lavender,
    }));
}
