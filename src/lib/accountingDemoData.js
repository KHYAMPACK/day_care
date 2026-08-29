const DEMO_CATEGORIES = [
  { id: 'demo-cat-1', name: 'Kırtasiye', sort_order: 1, color: 'lavender', isDemo: true },
  { id: 'demo-cat-2', name: 'Temizlik', sort_order: 2, color: 'mint', isDemo: true },
  { id: 'demo-cat-3', name: 'Bakım', sort_order: 3, color: 'peach', isDemo: true },
  { id: 'demo-cat-4', name: 'Yemek', sort_order: 4, color: 'sky', isDemo: true },
  { id: 'demo-cat-5', name: 'Eğitim Materyali', sort_order: 5, color: 'rose', isDemo: true },
  { id: 'demo-cat-6', name: 'Diğer', sort_order: 6, color: 'lavender', isDemo: true },
];

const DEMO_SUPPLIERS = [
  {
    id: 'demo-sup-1',
    name: 'Kırtasiye Dünyası',
    contact_name: 'Ayşe Yılmaz',
    phone: '5321234567',
    email: 'info@kirtasiye.example',
    notes: 'Aylık kırtasiye siparişleri',
    is_active: true,
    isDemo: true,
  },
  {
    id: 'demo-sup-2',
    name: 'Temizlik Pro',
    contact_name: 'Mehmet Kaya',
    phone: '5339876543',
    email: null,
    notes: 'Haftalık temizlik malzemeleri',
    is_active: true,
    isDemo: true,
  },
];

function monthAgo(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

export function getDemoCategories() {
  return DEMO_CATEGORIES.map((row) => ({ ...row }));
}

export function getDemoSuppliers() {
  return DEMO_SUPPLIERS.map((row) => ({ ...row }));
}

export function getDemoExpenses() {
  return [
    {
      id: 'demo-exp-1',
      category_id: 'demo-cat-1',
      supplier_id: 'demo-sup-1',
      class_id: null,
      title: 'Eylül kırtasiye alımı',
      description: 'Defter, kalem, boya seti',
      amount: 4250,
      expense_date: monthAgo(12),
      procurement_status: 'received',
      reference_no: 'PO-2025-091',
      isDemo: true,
    },
    {
      id: 'demo-exp-2',
      category_id: 'demo-cat-2',
      supplier_id: 'demo-sup-2',
      class_id: null,
      title: 'Temizlik malzemeleri',
      description: 'Dezenfektan ve bez',
      amount: 1850,
      expense_date: monthAgo(8),
      procurement_status: 'received',
      reference_no: 'FTR-8821',
      isDemo: true,
    },
    {
      id: 'demo-exp-3',
      category_id: 'demo-cat-5',
      supplier_id: null,
      class_id: null,
      title: 'Fen laboratuvarı kitleri',
      description: '5. sınıf deney setleri — sipariş verildi',
      amount: 6200,
      expense_date: monthAgo(3),
      procurement_status: 'ordered',
      reference_no: 'PO-2025-112',
      isDemo: true,
    },
    {
      id: 'demo-exp-4',
      category_id: 'demo-cat-4',
      supplier_id: null,
      class_id: null,
      title: 'Ekim yemek planı',
      description: 'Aylık catering',
      amount: 9800,
      expense_date: monthAgo(5),
      procurement_status: 'received',
      reference_no: null,
      isDemo: true,
    },
  ];
}

export function getDemoBudgetPeriod() {
  const year = new Date().getFullYear();
  return {
    id: 'demo-period-1',
    name: `${year}–${year + 1}`,
    start_date: `${year}-09-01`,
    end_date: `${year + 1}-06-30`,
    is_active: true,
    isDemo: true,
  };
}

export function getDemoBudgetLines() {
  return [
    { id: 'demo-line-1', period_id: 'demo-period-1', category_id: 'demo-cat-1', planned_amount: 12000, notes: '', isDemo: true },
    { id: 'demo-line-2', period_id: 'demo-period-1', category_id: 'demo-cat-2', planned_amount: 8000, notes: '', isDemo: true },
    { id: 'demo-line-3', period_id: 'demo-period-1', category_id: 'demo-cat-3', planned_amount: 15000, notes: 'Bina bakımı', isDemo: true },
    { id: 'demo-line-4', period_id: 'demo-period-1', category_id: 'demo-cat-4', planned_amount: 45000, notes: '', isDemo: true },
    { id: 'demo-line-5', period_id: 'demo-period-1', category_id: 'demo-cat-5', planned_amount: 20000, notes: '', isDemo: true },
    { id: 'demo-line-6', period_id: 'demo-period-1', category_id: 'demo-cat-6', planned_amount: 5000, notes: '', isDemo: true },
  ];
}

export function isAccountingEmpty({ expenses, periods }) {
  return (expenses?.length ?? 0) === 0 && (periods?.length ?? 0) === 0;
}

export function buildDemoAccountingBundle() {
  return {
    categories: getDemoCategories(),
    suppliers: getDemoSuppliers(),
    expenses: getDemoExpenses(),
    periods: [getDemoBudgetPeriod()],
    budgetLines: getDemoBudgetLines(),
    billing: getDemoStudentBilling(),
    tuitionCycles: getDemoTuitionCycles(),
    isDemo: true,
  };
}

function demoDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString().slice(0, 10);
}

function demoPeriodStart() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

export function getDemoStudentBilling() {
  return [
    {
      id: 'demo-bill-1',
      student_id: 'demo-student-1',
      monthly_amount: 8500,
      billing_start_date: demoPeriodStart(),
      is_active: true,
      isDemo: true,
      students: { id: 'demo-student-1', full_name: 'Demo Öğrenci', class_id: null, classes: null },
    },
  ];
}

export function getDemoTuitionCycles() {
  const due = demoDueDate();
  const start = demoPeriodStart();
  return [
    {
      id: 'demo-cycle-1',
      student_id: 'demo-student-1',
      period_start: start,
      period_end: due,
      due_date: due,
      amount: 8500,
      status: 'pending',
      paid_at: null,
      isDemo: true,
      students: { id: 'demo-student-1', full_name: 'Demo Öğrenci' },
    },
  ];
}

export function isTuitionEmpty({ billing }) {
  return (billing?.length ?? 0) === 0;
}
