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
    id: '2026-09-18-sinif-ogretmeni',
    title: 'Sınıf öğretmeni',
    publishedOn: '2026-09-18',
    intro:
      'Bir şubenin sorumlu öğretmenini belirleyebilirsiniz. Sınıf öğretmeni, kendi şubesini tüm dersleriyle birlikte görür.',
    items: [
      {
        title: 'Sınıf öğretmeni atama',
        summary:
          'Öğretmen Yönetimi’nde ayrı bir «Sınıf öğretmenleri» bölümü var (varsayılan kapalı). Her şubenin yanından bir öğretmen seçilir. Bir şubenin en fazla bir sınıf öğretmeni olur; aynı öğretmen birden fazla şubede olabilir. Atama zorunlu değildir.',
        steps: [
          'Yönetim → Öğretmen Yönetimi → «Sınıf öğretmenleri» bölümünü açın.',
          'Şubenin yanındaki listeden öğretmeni seçin ve Kaydet’e basın.',
          'Sınıf öğretmenini kaldırmak için «Atanmamış» seçip kaydedin.',
        ],
        roles: ['director'],
      },
      {
        title: 'Sınıfım sekmesi',
        summary:
          'Sınıf öğretmeni olan öğretmenin panelinde «Sınıfım» sekmesi görünür. Birden fazla şube varsa üstten şube seçilir.',
        steps: [
          'Yoklama: şubenin tüm derslerdeki yoklaması ve öğrenci devam durumu.',
          'Öğrenciler: şube listesi ve tam öğrenci dosyası.',
          'Rehberlik: haftalık rehberlik planı araçları (geniş tablolar için bilgisayar gerekir).',
          'Raporlar: deneme sonuç raporları. Deneme oluşturma ve düzenleme yoktur.',
        ],
        roles: ['director', 'teacher'],
      },
      {
        title: 'Veliler açısından',
        summary:
          'Sınıf öğretmeni, velilerin «öğretmenle iletişim» listesinde görünür. Duyuruları, o şubede ders vermese bile şubenin velilerine ulaşır.',
        roles: ['director', 'teacher'],
      },
    ],
  },
  {
    id: '2026-09-18-yoklama-guncellemeleri',
    title: 'Yoklama, kayıtlar ve veli bildirimi',
    publishedOn: '2026-09-18',
    intro:
      'Atlas yoklamaları artık Kayıtlar’da görünüyor. Program boşken de yoklama alınabiliyor. Velilere günün ilk dersi bildirimi gidiyor.',
    items: [
      {
        title: 'Kayıtlar → Yoklama Atlas’ta çalışıyor',
        summary:
          'Ders sekmesinden alınan yoklamalar Müdür panelinde Kayıtlar → Yoklama altında listelenir. Atlas’ta «konu tekrarı gereken» bölümü gösterilmez.',
        roles: ['director'],
      },
      {
        title: 'Okul kayıtlarında öğretmen işlemleri',
        summary:
          'Bugüne kadar okul kayıtlarında yalnızca müdür işlemleri görünüyordu. Artık öğretmen ve rehber işlemleri de kaydediliyor. Eski işlemler geriye dönük eklenmez.',
        roles: ['director'],
      },
      {
        title: 'Program boşsa da yoklama alınır',
        summary:
          'Haftalık programda o saat boşsa öğretmen kendi branşıyla yoklama alır ve program o saat için kendiliğinden dolar. Programda başka bir ders yazıyorsa öğretmene onay sorulur; kayıt öğretmenin dersi olarak tutulur ve plan değişmez.',
        steps: [
          'Ders sekmesinden şubeyi seçin ve yoklamayı kaydedin.',
          'Planlı ders farklıysa açılan pencerede onaylayın.',
          'Müdür: Haftalık ders programında o hücrenin altındaki turuncu not, o gün gerçekte hangi dersin işlendiğini gösterir.',
        ],
        roles: ['director', 'counselor', 'teacher'],
      },
      {
        title: 'Velilere günün ilk dersi bildirimi',
        summary:
          'Günün ilk dersinin yoklaması kaydedilince velisine «geldi / gelmedi» bildirimi gider. Yalnızca o günkü canlı kayıtta gönderilir, günde bir kez; sonradan düzeltme veya telafi girişinde tekrar gitmez. Atlas’ta 1. ders, klasik yoklamada günün ilk kaydedilen yoklaması esas alınır. Veli bildirimleri açmış olmalıdır.',
        roles: ['director', 'teacher'],
      },
      {
        title: 'Sekme değişince sayfa başa dönüyor',
        summary:
          'Uzun bir sekmede aşağı kaydırıp kısa bir sekmeye geçince sayfa boş görünüyordu; artık her sekme değişiminde en üste dönüyor.',
        roles: ['director', 'counselor', 'teacher'],
      },
      {
        title: 'Öğretmen panelinden Ödev sekmesi kaldırıldı',
        summary:
          'Öğretmen panelinde artık Ödev sekmesi yok. Veli panelindeki ödev bölümü aynen duruyor.',
        roles: ['director', 'teacher'],
      },
    ],
  },
  {
    id: '2026-09-16-ogrenci-listesi-yoklama',
    title: 'Şubede öğrenci listesi ve yoklama bildirimi düzeltmesi',
    publishedOn: '2026-09-16',
    intro:
      'Bazı öğretmenler şubeyi görüp içindeki öğrencileri göremiyordu; giderildi. Yoklama bildirim kartı da küçültüldü.',
    items: [
      {
        title: 'Şubede öğrenci listesi görünüyor',
        summary:
          'Yetki kaydındaki bir eksiklik yüzünden öğretmenler (örn. İngilizce) şubeyi seçebiliyor ama listede öğrenci göremiyordu; "Bu şubede öğrenci yok" hatalı şekilde gösteriliyordu. Sunucu tarafında düzeltildi, yeniden giriş gerekmiyor.',
        roles: ['director', 'counselor', 'teacher'],
      },
      {
        title: 'Yoklama bildirim kartı küçüldü',
        summary:
          'Panelin üstünde otomatik çıkan «Yoklama girilmedi» kartı gereğinden büyüktü; artık daha küçük ve derli toplu görünüyor. Bildirim zili menüsündeki liste değişmedi.',
        roles: ['director', 'counselor', 'teacher'],
      },
    ],
  },
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
