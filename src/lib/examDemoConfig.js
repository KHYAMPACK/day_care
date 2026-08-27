const STORAGE_KEY = 'kresTakip.examDemoConfig';

const DEFAULTS = {
  showCommonExams: true,
  showMockExams: true,
  storeResults: false,
  storeCommonResults: false,
  storeMockResults: true,
};

export function readExamDemoConfig() {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeExamDemoConfig(patch) {
  const next = { ...readExamDemoConfig(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function useExamDemoConfig() {
  // Hook-free helper for components: call read on mount + subscribe via custom event
  return readExamDemoConfig();
}

export function notifyExamDemoConfigChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('exam-demo-config'));
  }
}
