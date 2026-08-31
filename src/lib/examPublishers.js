export const EXAM_PUBLISHERS = [
  'Özdebir',
  'Adrenalin',
  'Pruva',
  'Workwin',
  'Strateji',
  'Limit',
  'Karekök',
  'Palme',
  'Data',
  'Tonguç',
  'Diğer',
];

export const EXAM_PUBLISHER_OTHER = 'Diğer';

export function resolveExamPublisher(publisher, customPublisher) {
  if (publisher === EXAM_PUBLISHER_OTHER) {
    return customPublisher?.trim() || null;
  }
  return publisher?.trim() || null;
}
