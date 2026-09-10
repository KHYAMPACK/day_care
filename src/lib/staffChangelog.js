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
    id: '2026-09-10-rehberlik-ogretmen',
    title: 'Rehberlikçi öğretmen paneline de girer',
    publishedOn: '2026-09-10',
    intro:
      'Rehberlik branşıyla oluşturulan personel hem rehberlikçi hem öğretmen olur; Atlas’ta tüm şubelere erişir.',
    items: [
      {
        title: 'Rehberlik = iki rol',
        summary:
          'Yeni öğretmen oluştururken branş Rehberlik seçilirse hesap hem öğretmen hem rehberlikçi paneline girer. Rol menüsünden paneller arası geçiş yapılır.',
        steps: [
          'Personel → Yeni öğretmen.',
          'Branş olarak Rehberlik seçin ve oluşturun.',
          'Giriş sonrası menüden Öğretmen veya Rehberlikçi panelini seçin.',
        ],
        roles: ['director', 'counselor', 'teacher'],
      },
      {
        title: 'Atlas rehberlikçi şube erişimi',
        summary:
          'Mevcut Atlas rehberlikçi hesapları öğretmen rolü ve tüm şubelere erişimle güncellendi; ders verebilirler.',
        roles: ['director', 'counselor', 'teacher'],
      },
    ],
  },
  {
    id: '2026-09-10-pwa-yukle',
    title: 'Uygulamayı telefona veya bilgisayara yükleme',
    publishedOn: '2026-09-10',
    intro:
      'Paneli ana ekrana ekleyebilirsiniz. Veliler Atlas sitesindeki yükle düğmesiyle aynı ekrana gelir.',
    items: [
      {
        title: 'Girişte yükle',
        summary:
          'Giriş ekranında «Uygulamayı yükle» görünür. Chrome ve Edge kendi onayını açar; iPhone’da Paylaş → Ana Ekrana Ekle adımları çıkar. Yüklü uygulamada düğme gizlenir.',
        steps: [
          'Çıkış yapıp giriş ekranına gidin.',
          '«Uygulamayı yükle»ye dokunun ve tarayıcının onayını kabul edin.',
        ],
        roles: ['director', 'teacher', 'counselor'],
      },
      {
        title: 'Veli yükleme bağlantısı',
        summary:
          'Atlas sitesinden gelen veliler veli adresine ?install=1 ile düşer; giriş yapmadan yükleme paneli açılır.',
        roles: ['director'],
      },
    ],
  },
  {
    id: '2026-09-08-atlas-yonetim',
    title: 'Atlas yönetim ve öğrenci listesi',
    publishedOn: '2026-09-08',
    intro:
      'Haftalık program ayrı sayfada. Atlas’ta tüm öğretmenler tüm şubelere erişir. Öğrenci listesinde veli adı görünür.',
    items: [
      {
        title: 'Haftalık ders programı',
        summary:
          'Program artık Müfredat içinde değil; Yönetim altında kendi sayfası. Rehberlikçi Program sekmesini kullanır.',
        steps: [
          'Yönetim → Haftalık ders programı.',
          'Şube ve hafta seçip Pazartesi–Cuma 4 dersi kaydedin.',
        ],
        roles: ['director', 'counselor', 'teacher'],
      },
      {
        title: 'Atlas şube erişimi',
        summary:
          'Yeni ve mevcut öğretmenler tüm şubelere atanır; yeni şube de tüm öğretmenlere açılır. Şube Atama Atlas’ta gizlenir.',
        steps: ['Öğretmen oluşturduktan sonra Ders ve mesaj için tüm şubeler hazırdır.'],
        roles: ['director', 'teacher'],
      },
      {
        title: 'Öğrenci listesinde veli',
        summary: 'Öğrenci Yönetimi’nde çocuğa bağlı veli varsa adı şube satırının altında görünür.',
        steps: ['Yönetim → Öğrenci Yönetimi → öğrenci satırında «Veli: …».'],
        roles: ['director'],
      },
      {
        title: 'Veli oluşturma',
        summary: 'Veli hesabı oluştururken oluşan sunucu hatası giderildi.',
        roles: ['director'],
      },
    ],
  },
  {
    id: '2026-09-08-branch-timetable',
    title: 'Öğretmen branşları ve haftalık program',
    publishedOn: '2026-09-08',
    intro:
      'Rehberlikçi artık öğretmen gibi eklenir. Atlas okullarında her şube için haftalık 4 derslik program elle girilir.',
    items: [
      {
        title: 'Öğretmen branşları',
        summary:
          'Yeni öğretmen oluştururken branş: Sosyal, İngilizce, Rehberlik, Matematik, Türkçe, Fen. Rehberlik seçilince kişi rehberlikçi paneline de girer.',
        steps: [
          'Personel → Yeni öğretmen formunu açın.',
          'Ad soyad ve branş seçin. Rehberlik branşı ayrı rehberlikçi formu yerine geçer.',
          'Mevcut öğretmende branşı Rehberlik olarak kaydederseniz rehberlikçi rolü eklenir; başka branşa çevirirseniz kalkar.',
        ],
        roles: ['director'],
      },
      {
        title: 'Haftalık ders programı',
        summary:
          'Her şube ve hafta için Pazartesi–Cuma 4 dersi siz seçersiniz. Atlas yoklaması öğretmen branşına göre değil, o saatteki programa göre kaydedilir.',
        steps: [
          'Müdür: Yönetim → Haftalık ders programı. Rehberlikçi: Program sekmesi.',
          'Şube ve hafta seçin, her güne 4 ders atayın, kaydedin.',
          'Aynı programı hızlandırmak için «Önceki haftayı kopyala» kullanın.',
          'Veliler Ders programı sekmesinde çocuğun o haftaki programını görür.',
        ],
        roles: ['director', 'counselor', 'teacher'],
      },
    ],
  },
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

export function getVisibleStaffChangelog(userStaffRoles = []) {
  if (!userStaffRoles.length) return [];

  return STAFF_CHANGELOG.map((entry) => {
    const items = visibleItemsForRoles(entry, userStaffRoles);
    if (!roleMatchesFilter(userStaffRoles, entry.roles) && !items.length) return null;
    if (!items.length) return null;
    return { ...entry, items };
  }).filter(Boolean);
}

export function getUnseenStaffChangelog(profile, userStaffRoles = []) {
  if (!profile?.id || !userStaffRoles.length) return [];

  const seen = readSeenIds(profile.id);
  return getVisibleStaffChangelog(userStaffRoles).filter((entry) => !seen.has(entry.id));
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
