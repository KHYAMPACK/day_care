/** Staff branş options when creating or editing a teacher (not the müfredat catalog). */

export const REHBERLIK_BRANCH_SLUG = 'rehberlik';

export const TEACHER_BRANCH_DEFS = [
  { slug: 'matematik', name: 'Matematik', color: '#e11d48', icon: 'ruler' },
  { slug: 'turkce', name: 'Türkçe', color: '#ca8a04', icon: 'book' },
  { slug: 'fen', name: 'Fen', color: '#ea580c', icon: 'flask' },
  { slug: 'sosyal', name: 'Sosyal', color: '#0284c7', icon: 'globe' },
  { slug: 'ingilizce', name: 'İngilizce', color: '#0d9488', icon: 'message' },
  { slug: 'rehberlik', name: 'Rehberlik', color: '#7c3aed', icon: 'child' },
];

export const TEACHER_BRANCH_SLUGS = TEACHER_BRANCH_DEFS.map((row) => row.slug);

/** Subjects that can appear in the weekly class timetable (not Rehberlik). */
export const TIMETABLE_SUBJECT_DEFS = TEACHER_BRANCH_DEFS.filter(
  (row) => row.slug !== REHBERLIK_BRANCH_SLUG
);

export function isRehberlikBranch(slug) {
  return slug === REHBERLIK_BRANCH_SLUG;
}

export function teacherBranchBySlug(slug) {
  if (!slug) return null;
  return TEACHER_BRANCH_DEFS.find((row) => row.slug === slug) ?? null;
}

export function teacherBranchLabel(slug) {
  return teacherBranchBySlug(slug)?.name ?? slug ?? '';
}
