import { STAFF_ROLES } from './roles';
import { normalizeProfileRoles } from './profileRoles';

/**
 * Staff-only release notes. Add a new entry at the top whenever you ship
 * panel changes staff should know about.
 *
 * - id: unique string (e.g. YYYY-MM-DD slug). Bump when publishing.
 * - roles: omit or null = all staff; otherwise limit to listed roles.
 * - items[].roles: optional per-item role filter.
 */
export const STAFF_CHANGELOG = [
  {
    id: '2026-09-08-panel-updates',
    title: 'Panel güncellemeleri',
    publishedOn: '2026-09-08',
    intro:
      'Deneme import, müdür yetkileri ve takvimle ilgili son değişiklikler. Her madde yalnızca bir kez gösterilir.',
    items: [
      {
        title: 'Öğrenci cevap onayı artık pencerede',
        summary:
          'CSV import adımında öğrenci eşleştirmesi sayfa içinde değil, ayrı bir onay penceresinde açılır.',
        steps: [
          'Denemeler → CSV import → öğrenci cevapları CSV dosyasını yükleyin.',
          'Açılan pencerede eşleşmeyen satırlar için okul listesinden öğrenci seçin.',
          'Filtreler (Tümü / Eşleşenler / Sorunlu) ile listeyi daraltabilirsiniz.',
          'Pencereyi kapatırsanız, aynı adımdan «Öğrenci eşleştirmesini aç» ile geri dönebilirsiniz.',
        ],
        roles: ['director', 'counselor'],
      },
      {
        title: 'Konu eşleştirme penceresi',
        summary:
          'Cevap anahtarı kaydedilirken tanınmayan konu etiketleri müfredat ünitelerine bağlanmak üzere açılır.',
        steps: [
          'Cevap anahtarı CSV yükleyin ve onaylayın.',
          'Bilinmeyen konu varsa eşleştirme penceresi otomatik açılır.',
          'Her etiket için ünite (ve varsa alt konu) seçin veya «Atla» ile geçin.',
        ],
        roles: ['director', 'counselor'],
      },
      {
        title: 'Tüm müdürler tam yetkili',
        summary:
          'Sonradan müdür yapılan personel de artık asıl müdürle aynı yetkilere sahip (personel silme, rol yönetimi, öğrenci silme).',
        steps: [
          'Personel sekmesinden öğretmen veya rehber personele «Müdür» rolü ekleyebilirsiniz.',
          'Eklenen müdürler tüm yönetim işlemlerini yapabilir.',
        ],
        roles: ['director'],
      },
      {
        title: 'Atlas yıllık takvim',
        summary: '2026–2027 Atlas akademik takvimi güncellendi ve yeniden yüklendi.',
        steps: [
          'Takvim sekmesinden tatil, deneme ve etkinlik tarihlerini kontrol edin.',
          'Müfredat yıllık planı takvimdeki okul günlerine göre hafta sayısını kullanır.',
        ],
        roles: ['director', 'teacher', 'counselor'],
      },
    ],
  },
];

const STORAGE_PREFIX = 'staffChangelogSeen:';

function readSeenIds(profileId) {
  if (!profileId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${profileId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeenIds(profileId, ids) {
  if (!profileId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${profileId}`, JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

function roleMatchesFilter(userStaffRoles, filterRoles) {
  if (!filterRoles?.length) return true;
  return userStaffRoles.some((role) => filterRoles.includes(role));
}

function visibleItemsForRoles(entry, userStaffRoles) {
  return (entry.items ?? []).filter((item) => roleMatchesFilter(userStaffRoles, item.roles));
}

export function isStaffProfile(profile) {
  return normalizeProfileRoles(profile).some((role) => STAFF_ROLES.includes(role));
}

export function getUnseenStaffChangelog(profile, userStaffRoles = []) {
  if (!profile?.id || !userStaffRoles.length) return [];

  const seen = readSeenIds(profile.id);

  return STAFF_CHANGELOG.filter((entry) => !seen.has(entry.id))
    .map((entry) => {
      const items = visibleItemsForRoles(entry, userStaffRoles);
      if (!roleMatchesFilter(userStaffRoles, entry.roles) && !items.length) return null;
      if (!items.length) return null;
      return { ...entry, items };
    })
    .filter(Boolean);
}

export function markStaffChangelogSeen(profileId, entryIds) {
  if (!profileId || !entryIds?.length) return;
  const seen = readSeenIds(profileId);
  for (const id of entryIds) seen.add(id);
  writeSeenIds(profileId, seen);
}

/** Dev / support: clear seen state for current user (optional export). */
export function resetStaffChangelogSeen(profileId) {
  if (!profileId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${profileId}`);
  } catch {
    // ignore
  }
}
