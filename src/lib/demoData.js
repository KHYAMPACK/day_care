export const DEMO_GROUPS = ['Papatya', 'Lale', 'Papatya', 'Lale', 'Sardunya'];

export const DEMO_ROSTER = [
  { id: 'demo-1', name: 'Elif Arslan' },
  { id: 'demo-2', name: 'Mira Yıldız' },
  { id: 'demo-3', name: 'Arda Kılıç' },
  { id: 'demo-4', name: 'Defne Koç' },
  { id: 'demo-5', name: 'Emir Bozkurt' },
  { id: 'demo-6', name: 'Eylül Öztürk' },
  { id: 'demo-7', name: 'Kerem Yalçın' },
  { id: 'demo-8', name: 'Ada Şahin' },
  { id: 'demo-9', name: 'Kaan Özkan' },
  { id: 'demo-10', name: 'Lina Acar' },
  { id: 'demo-11', name: 'Yiğit Sezer' },
  { id: 'demo-12', name: 'Nehir Polat' },
];

const ATTENDANCE_CYCLE = [
  { status: 'present', time: '08:42' },
  { status: 'present', time: '08:51' },
  { status: 'late', time: '09:18' },
  { status: 'present', time: '08:36' },
  { status: 'absent', time: '—' },
  { status: 'present', time: '08:47' },
  { status: 'leave', time: '—' },
  { status: 'present', time: '08:55' },
];

export const ATTENDANCE_LABELS = {
  present: { label: 'Geldi', tint: 'mint' },
  late: { label: 'Geç', tint: 'peach' },
  absent: { label: 'Gelmedi', tint: 'rose' },
  leave: { label: 'İzinli', tint: 'sky' },
};

export const ATTENDANCE_ORDER = ['present', 'late', 'absent', 'leave'];

export function buildRoster(students) {
  const source =
    students?.length > 0
      ? students.map((student) => ({ id: student.id, name: student.full_name }))
      : DEMO_ROSTER;

  return source.map((student, index) => {
    const stamp = ATTENDANCE_CYCLE[index % ATTENDANCE_CYCLE.length];
    return {
      ...student,
      group: DEMO_GROUPS[index % DEMO_GROUPS.length],
      status: stamp.status,
      time: stamp.time,
    };
  });
}

export function firstName(fullName, fallback = 'Elif') {
  const trimmed = fullName?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0];
}

export const DEMO_GALLERY = [
  {
    id: 'g1',
    title: 'Parmak boyası',
    caption: 'Papatya sınıfı renkleri karıştırdı.',
    time: '10:42',
    src: 'https://images.unsplash.com/photo-1596464716127-f2a82984de30?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'g2',
    title: 'Bahçe zamanı',
    caption: 'Sabah enerjisini bahçede attık.',
    time: '09:20',
    src: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'g3',
    title: 'Müzik köşesi',
    caption: 'Ritim çubuklarıyla mini konser.',
    time: '11:05',
    src: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'g4',
    title: 'Kitap saati',
    caption: 'Bugünün hikâyesi: Küçük Kuş.',
    time: '14:50',
    src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'g5',
    title: 'Hamur işi',
    caption: 'Şekil açmak herkesin favorisi.',
    time: 'Dün',
    src: 'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'g6',
    title: 'Blok kule',
    caption: 'En yüksek kule yarışması.',
    time: 'Dün',
    src: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=800&q=80',
  },
];

export const DEMO_ANNOUNCEMENTS = [
  {
    id: 'a1',
    pinned: true,
    title: 'Cuma pijama partisi',
    body: 'Cuma günü pijama partisi var. Yedek kıyafet ve terlik getirmeyi unutmayın.',
    author: 'Müdür',
    time: 'Bugün · 08:10',
  },
  {
    id: 'a2',
    pinned: false,
    title: 'Aile katılımı — 28 Ağustos',
    body: 'Bahçe pikniğine veliler davetlidir. Katılım formunu Menü > Onay Formları üzerinden doldurabilirsiniz.',
    author: 'Ayşe Öğretmen',
    time: 'Dün · 16:40',
  },
  {
    id: 'a3',
    pinned: false,
    title: 'Servis saati güncellemesi',
    body: 'Papatya hattı sabah kalkış saati 07:55 olarak güncellendi.',
    author: 'Müdür',
    time: '2 gün önce',
  },
];

export const DEMO_MENU_WEEK = [
  {
    day: 'Pazartesi',
    today: false,
    items: ['Mercimek çorbası', 'Tavuklu şehriye', 'Yoğurt', 'Mevsim meyvesi'],
    allergens: ['Gluten', 'Süt'],
  },
  {
    day: 'Salı',
    today: false,
    items: ['Ezogelin', 'Ispanaklı börek', 'Ayran', 'Muz'],
    allergens: ['Gluten', 'Süt'],
  },
  {
    day: 'Çarşamba',
    today: true,
    items: ['Domates çorbası', 'Fırın makarna', 'Salatalık', 'Elma'],
    allergens: ['Gluten'],
  },
  {
    day: 'Perşembe',
    today: false,
    items: ['Yayla çorbası', 'Köfte + pilav', 'Cacık', 'Armut'],
    allergens: ['Süt'],
  },
  {
    day: 'Cuma',
    today: false,
    items: ['Sebze çorbası', 'Peynirli tost', 'Ayran', 'Komposto'],
    allergens: ['Gluten', 'Süt'],
  },
];

export const DEMO_PAYMENTS = [
  { id: 'p1', title: 'Ağustos aidatı', amount: '₺4.500', due: '5 Ağustos', status: 'paid' },
  { id: 'p2', title: 'Eylül aidatı', amount: '₺4.500', due: '5 Eylül', status: 'open' },
  { id: 'p3', title: 'Ekim aidatı', amount: '₺4.500', due: '5 Ekim', status: 'open' },
  { id: 'p4', title: 'Kültür gezi katkısı', amount: '₺350', due: '22 Ağustos', status: 'open' },
];

export const DEMO_GROWTH = [
  { month: 'Mar', height: 92, weight: 13.4 },
  { month: 'Nis', height: 93, weight: 13.6 },
  { month: 'May', height: 94, weight: 13.8 },
  { month: 'Haz', height: 95, weight: 14.0 },
  { month: 'Tem', height: 96, weight: 14.1 },
  { month: 'Ağu', height: 97, weight: 14.3 },
];

export const DEMO_EVENTS = [
  { id: 'e1', date: '19 Ağu', title: 'Müzik atölyesi', time: '10:00', place: 'Papatya sınıfı' },
  { id: 'e2', date: '22 Ağu', title: 'Mini kültür gezisi', time: '09:30', place: 'Şehir parkı' },
  { id: 'e3', date: '28 Ağu', title: 'Aile katılımı pikniği', time: '11:00', place: 'Bahçe' },
  { id: 'e4', date: '1 Eyl', title: 'Veli toplantısı', time: '18:30', place: 'Online' },
];

export const DEMO_MEDS = [
  { id: 'm1', name: 'Vitamin şurubu', dose: '5 ml', time: '12:00', done: true },
  { id: 'm2', name: 'Alerji damlası', dose: '1 damla', time: '15:30', done: false },
];

export const DEMO_AWARDS = [
  { id: 'w1', title: 'Paylaşmayı seven', stars: 3, note: 'Oyuncaklarını arkadaşlarıyla paylaştı.' },
  { id: 'w2', title: 'Sabırlı dinleyici', stars: 2, note: 'Kitap saatinde yerinde bekledi.' },
  { id: 'w3', title: 'Tabak kahramanı', stars: 4, note: 'Öğle yemeğini kendi başına bitirdi.' },
];

export const DEMO_FORMS = [
  { id: 'f1', title: 'Fotoğraf paylaşım izni', status: 'signed' },
  { id: 'f2', title: 'Kültür gezisi onay formu', status: 'pending' },
  { id: 'f3', title: 'Servis kullanım taahhüdü', status: 'signed' },
];

export const DEMO_SURVEY = {
  title: 'Cuma etkinliği hangisi olsun?',
  options: [
    { id: 's1', label: 'Pijama partisi', votes: 18 },
    { id: 's2', label: 'Bahçe pikniği', votes: 11 },
    { id: 's3', label: 'Film saati', votes: 6 },
  ],
};

export const DEMO_MEETINGS = [
  { id: 't1', title: 'Eylül veli toplantısı', when: '1 Eylül · 18:30', who: 'Papatya sınıfı', status: 'upcoming' },
  { id: 't2', title: 'Gelişim görüşmesi', when: '4 Eylül · 17:00', who: 'Bireysel', status: 'upcoming' },
];

export const DEMO_PREREG = [
  { id: 'r1', name: 'Asya Güneş', age: '2 yaş 2 ay', status: 'Bekliyor', date: '12 Ağu' },
  { id: 'r2', name: 'Baran Tekin', age: '3 yaş', status: 'Görüşme', date: '14 Ağu' },
  { id: 'r3', name: 'Cemre Uçar', age: '1 yaş 11 ay', status: 'Onaylandı', date: '8 Ağu' },
];

export const DEMO_LEDGER = [
  { id: 'l1', label: 'Aidat gelirleri', amount: '₺182.000', tint: 'mint' },
  { id: 'l2', label: 'Personel gideri', amount: '₺96.400', tint: 'peach' },
  { id: 'l3', label: 'Mutfak / malzeme', amount: '₺21.750', tint: 'sky' },
  { id: 'l4', label: 'Bekleyen tahsilat', amount: '₺13.500', tint: 'rose' },
];

export const DEMO_BUS_STOPS = [
  { id: 'b1', name: 'Başlangıç — Garaj', time: '07:40', done: true },
  { id: 'b2', name: 'Çınar Sokak', time: '07:52', done: true },
  { id: 'b3', name: 'Park Caddesi', time: '08:04', done: false, current: true },
  { id: 'b4', name: 'Kreş bahçesi', time: '08:18', done: false },
];

export const DEMO_CHAT_THREADS = [
  {
    id: 'c1',
    name: 'Ayşe Yılmaz',
    role: 'Papatya öğretmeni',
    preview: 'Bugün çok keyifliydi, parmak boyasına bayıldı.',
    time: '14:32',
    unread: 1,
  },
  {
    id: 'c2',
    name: 'Papatya Sınıfı',
    role: 'Grup',
    preview: 'Yarın bahçe etkinliği var, şapka getirelim.',
    time: 'Dün',
    unread: 0,
  },
  {
    id: 'c3',
    name: 'Müdür',
    role: 'Yönetim',
    preview: 'Eylül aidat dökümü paylaşıldı.',
    time: 'Pzt',
    unread: 0,
  },
];

export const DEMO_CHAT_MESSAGES = [
  { id: 'cm1', from: 'them', text: 'Günaydın, Elif bugün çok keyifli başladı 🌸', time: '09:12' },
  { id: 'cm2', from: 'me', text: 'Harika, teşekkürler Ayşe öğretmenim.', time: '09:18' },
  { id: 'cm3', from: 'them', text: 'Parmak boyası etkinliğine bayıldı. Öğleden sonra 3 fotoğraf paylaşacağım.', time: '14:32' },
];

export function buildDayTimeline(childName) {
  const name = childName || 'Elif';
  return [
    {
      id: 'd1',
      time: '08:42',
      icon: '✅',
      tint: 'mint',
      title: 'Yoklama',
      detail: `${name} giriş yaptı · Geldi`,
    },
    {
      id: 'd2',
      time: '09:15',
      icon: '🥐',
      tint: 'peach',
      title: 'Kahvaltı',
      detail: 'Peynir, zeytin, pekmez · iyi yedi',
    },
    {
      id: 'd3',
      time: '10:40',
      icon: '🎨',
      tint: 'lavender',
      title: 'Etkinlik',
      detail: 'Parmak boyası — renkleri karıştırdı',
    },
    {
      id: 'd4',
      time: '12:20',
      icon: '🍽️',
      tint: 'peach',
      title: 'Öğle yemeği',
      detail: 'Domates çorbası, fırın makarna · tabağını bitirdi',
    },
    {
      id: 'd5',
      time: '12:50',
      icon: '🌙',
      tint: 'lavender',
      title: 'Uyku',
      detail: '12:50 — 14:20 · 1s 30dk',
    },
    {
      id: 'd7',
      time: '14:05',
      icon: '🚽',
      tint: 'sky',
      title: 'Tuvalet',
      detail: 'Kendi gitti · hatırlatma ile',
    },
    {
      id: 'd6',
      time: '14:32',
      icon: '💬',
      tint: 'sky',
      title: 'Ayşe Öğretmen',
      detail: `Bugün çok keyifliydi, parmak boyasına bayıldı.`,
    },
  ];
}

export const DEMO_TOILET = [
  { id: 'tv1', time: '09:40', note: 'Kendi gitti', wet: false },
  { id: 'tv2', time: '11:15', note: 'Hatırlatıldı', wet: false },
  { id: 'tv3', time: '14:05', note: 'Kendi gitti', wet: false },
];

export const DEMO_SCHEDULE = [
  { time: '09:00', title: 'Serbest oyun', place: 'Sınıf' },
  { time: '09:40', title: 'Kahvaltı', place: 'Yemekhane' },
  { time: '10:15', title: 'Müzik / ritim', place: 'Atölye' },
  { time: '11:00', title: 'Bahçe', place: 'Bahçe' },
  { time: '12:00', title: 'Öğle yemeği', place: 'Yemekhane' },
  { time: '12:45', title: 'Uyku / dinlenme', place: 'Sınıf' },
  { time: '14:30', title: 'Kitap saati', place: 'Sınıf' },
  { time: '15:15', title: 'İkindi kahvaltısı', place: 'Yemekhane' },
];

export const DEMO_HOMEWORK = [
  { id: 'h1', title: 'Doğa koleksiyonu', due: 'Cuma', done: false, note: 'Parkta 3 yaprak toplayıp getirin.' },
  { id: 'h2', title: 'Aile fotoğrafı', due: 'Pazartesi', done: true, note: 'Birlikte çekilmiş bir kare.' },
];

export const DEMO_BIRTHDAYS = [
  { id: 'bd1', name: 'Ada Şahin', date: '22 Ağu', when: '3 gün sonra', group: 'Papatya' },
  { id: 'bd2', name: 'Kerem Yalçın', date: '26 Ağu', when: '1 hafta', group: 'Lale' },
  { id: 'bd3', name: 'Elif Arslan', date: '14 Mar', when: 'Bu yıl kutlandı', group: 'Papatya' },
];

export const DEMO_NEWSLETTER = {
  title: 'Ağustos bülteni',
  body: 'Bu ay parmak boyası, bahçe pikniği ve pijama partisi var. Veliler Cuma etkinliğine davetlidir. Eylül aidatları 5’ine kadar açık.',
  file: 'agustos-bulteni.pdf',
};

export const DEMO_SHIFTS = [
  { id: 'sh1', name: 'Ayşe Yılmaz', role: 'Papatya', hours: '08:00 — 16:00', status: 'Görevde' },
  { id: 'sh2', name: 'Fatma Demir', role: 'Lale', hours: '08:00 — 16:00', status: 'Görevde' },
  { id: 'sh3', name: 'Zeynep Kaya', role: 'Sardunya', hours: '11:00 — 18:00', status: 'Öğleden sonra' },
  { id: 'sh4', name: 'Murat Çelik', role: 'Servis', hours: '07:30 — 09:30 / 16:00 — 18:00', status: 'Yolda' },
];

export const DEMO_REPORTS = [
  { id: 'rp1', label: 'Devam oranı', value: '94%', hint: 'Bu ay' },
  { id: 'rp2', label: 'Aidat tahsilatı', value: '₺182B', hint: 'Ağustos' },
  { id: 'rp3', label: 'Geciken ödeme', value: '3 veli', hint: 'Hatırlatma gitti' },
  { id: 'rp4', label: 'Fotoğraf paylaşımı', value: '86', hint: 'Bu hafta' },
];

export const PARENT_TABS = [
  { id: 'home', label: 'Gün', icon: '🏠' },
  { id: 'gallery', label: 'Galeri', icon: '📸' },
  { id: 'chat', label: 'Mesaj', icon: '💬' },
  { id: 'more', label: 'Menü', icon: '▦' },
];

export const TEACHER_TABS = [
  { id: 'home', label: 'Sınıf', icon: '🏫' },
  { id: 'attendance', label: 'Yoklama', icon: '✅' },
  { id: 'messages', label: 'Mesaj', icon: '💬' },
  { id: 'more', label: 'Menü', icon: '▦' },
];

export const PARENT_MODULES = [
  { id: 'announcements', label: 'Duyurular', icon: '📢', tint: 'lavender' },
  { id: 'report', label: 'Günlük Karne', icon: '📝', tint: 'peach' },
  { id: 'attendance', label: 'Yoklama', icon: '✅', tint: 'mint' },
  { id: 'meals', label: 'Yemek', icon: '🍽️', tint: 'peach' },
  { id: 'sleep', label: 'Uyku', icon: '🌙', tint: 'lavender' },
  { id: 'toilet', label: 'Tuvalet', icon: '🚽', tint: 'sky' },
  { id: 'health', label: 'Sağlık', icon: '💚', tint: 'mint' },
  { id: 'medicine', label: 'İlaç', icon: '💊', tint: 'rose' },
  { id: 'pickup', label: 'Teslim', icon: '🚪', tint: 'rose' },
  { id: 'payments', label: 'Ödemeler', icon: '💳', tint: 'sky' },
  { id: 'growth', label: 'Gelişim', icon: '📏', tint: 'sky' },
  { id: 'bus', label: 'Servis', icon: '🚌', tint: 'peach' },
  { id: 'schedule', label: 'Ders programı', icon: '📚', tint: 'lavender' },
  { id: 'homework', label: 'Ödevler', icon: '✏️', tint: 'peach' },
  { id: 'calendar', label: 'Ajanda', icon: '📅', tint: 'lavender' },
  { id: 'survey', label: 'Anket', icon: '📊', tint: 'sky' },
  { id: 'awards', label: 'Ödüller', icon: '⭐', tint: 'peach' },
  { id: 'birthdays', label: 'Doğum günü', icon: '🎂', tint: 'rose' },
  { id: 'newsletter', label: 'Bülten', icon: '🗞️', tint: 'sky' },
  { id: 'meeting', label: 'Toplantı', icon: '🎥', tint: 'mint' },
  { id: 'forms', label: 'Onay Formları', icon: '📋', tint: 'lavender' },
];

export const TEACHER_MODULES = [
  { id: 'gallery', label: 'Galeri', icon: '📸', tint: 'peach' },
  { id: 'meals', label: 'Yemek', icon: '🍽️', tint: 'peach' },
  { id: 'sleep', label: 'Uyku', icon: '🌙', tint: 'lavender' },
  { id: 'toilet', label: 'Tuvalet', icon: '🚽', tint: 'sky' },
  { id: 'announcements', label: 'Duyurular', icon: '📢', tint: 'lavender' },
  { id: 'report', label: 'Günlük Karne', icon: '📝', tint: 'mint' },
  { id: 'health', label: 'Sağlık', icon: '💚', tint: 'mint' },
  { id: 'medicine', label: 'İlaç', icon: '💊', tint: 'rose' },
  { id: 'pickup', label: 'Teslim', icon: '🚪', tint: 'rose' },
  { id: 'chat', label: 'Veliler', icon: '💬', tint: 'sky' },
  { id: 'schedule', label: 'Ders programı', icon: '📚', tint: 'lavender' },
  { id: 'homework', label: 'Ödevler', icon: '✏️', tint: 'peach' },
  { id: 'calendar', label: 'Ajanda', icon: '📅', tint: 'lavender' },
  { id: 'birthdays', label: 'Doğum günü', icon: '🎂', tint: 'rose' },
  { id: 'awards', label: 'Ödüller', icon: '⭐', tint: 'peach' },
  { id: 'survey', label: 'Anket', icon: '📊', tint: 'sky' },
  { id: 'newsletter', label: 'Bülten', icon: '🗞️', tint: 'sky' },
  { id: 'bus', label: 'Servis', icon: '🚌', tint: 'peach' },
];

export const DIRECTOR_MODULES = [
  { id: 'announcements', label: 'Duyurular', icon: '📢', tint: 'lavender' },
  { id: 'attendance', label: 'Yoklama', icon: '✅', tint: 'mint' },
  { id: 'gallery', label: 'Galeri', icon: '📸', tint: 'peach' },
  { id: 'meals', label: 'Yemek listesi', icon: '🍽️', tint: 'peach' },
  { id: 'payments', label: 'Aidatlar', icon: '💳', tint: 'sky' },
  { id: 'accounting', label: 'Muhasebe', icon: '💰', tint: 'mint' },
  { id: 'reports', label: 'Raporlar', icon: '📈', tint: 'sky' },
  { id: 'bus', label: 'Servis', icon: '🚌', tint: 'peach' },
  { id: 'schedule', label: 'Ders programı', icon: '📚', tint: 'lavender' },
  { id: 'calendar', label: 'Ajanda', icon: '📅', tint: 'lavender' },
  { id: 'survey', label: 'Anket', icon: '📊', tint: 'sky' },
  { id: 'prereg', label: 'Ön Kayıt', icon: '📝', tint: 'sky' },
  { id: 'shifts', label: 'Vardiya', icon: '👩‍🏫', tint: 'peach' },
  { id: 'pickup', label: 'Teslim', icon: '🚪', tint: 'rose' },
  { id: 'meeting', label: 'Toplantı', icon: '🎥', tint: 'mint' },
  { id: 'health', label: 'Sağlık', icon: '💚', tint: 'mint' },
  { id: 'medicine', label: 'İlaç takip', icon: '💊', tint: 'rose' },
  { id: 'birthdays', label: 'Doğum günü', icon: '🎂', tint: 'rose' },
  { id: 'newsletter', label: 'Bülten', icon: '🗞️', tint: 'sky' },
  { id: 'awards', label: 'Ödüller', icon: '⭐', tint: 'peach' },
  { id: 'forms', label: 'Onay formları', icon: '📋', tint: 'lavender' },
  { id: 'chat', label: 'Mesajlar', icon: '💬', tint: 'sky' },
];

export const SCREEN_TITLES = {
  gallery: 'Galeri',
  chat: 'Mesajlar',
  announcements: 'Duyurular',
  report: 'Günlük Karne',
  attendance: 'Yoklama',
  meals: 'Yemek Listesi',
  sleep: 'Uyku',
  toilet: 'Tuvalet',
  health: 'Sağlık',
  medicine: 'İlaç Takibi',
  payments: 'Ödemeler',
  growth: 'Gelişim',
  bus: 'Servis Takip',
  calendar: 'Ajanda',
  survey: 'Anket',
  awards: 'Ödüller',
  bell: 'Kurum Zili',
  pickup: 'Güvenli Teslim',
  meeting: 'Online Toplantı',
  forms: 'Onay Formları',
  accounting: 'Muhasebe',
  prereg: 'Ön Kayıt',
  schedule: 'Ders Programı',
  homework: 'Ödevler',
  birthdays: 'Doğum Günleri',
  newsletter: 'Aylık Bülten',
  shifts: 'Personel Vardiyası',
  reports: 'Kurum Raporları',
};

export const PLATFORM_GROUPS = [
  {
    id: 'daily',
    title: 'Günlük yaşam',
    subtitle: 'Velinin “bugün ne yaptı?” sorusunun cevabı',
    items: [
      { id: 'attendance', icon: '✅', title: 'Yoklama', blurb: 'Giriş-çıkış, geç kalanlar, veliye anlık bildirim.' },
      { id: 'meals', icon: '🍽️', title: 'Yemek & alerjen', blurb: 'Haftalık menü, porsiyon ve alerjen uyarısı.' },
      { id: 'sleep', icon: '🌙', title: 'Uyku', blurb: 'Başlangıç, bitiş ve süre kaydı.' },
      { id: 'toilet', icon: '🚽', title: 'Tuvalet', blurb: '2–3 yaş için tuvalet rutini ve hatırlatma.' },
      { id: 'report', icon: '📝', title: 'Günlük karne', blurb: 'Ruh hali, katılım, yemek, uyku — gün sonu özeti.' },
      { id: 'growth', icon: '📏', title: 'Gelişim', blurb: 'Boy-kilo grafiği ve gözlem notları.' },
    ],
  },
  {
    id: 'comms',
    title: 'İletişim',
    subtitle: 'WhatsApp grubunun yerini alan resmi kanal',
    items: [
      { id: 'announcements', icon: '📢', title: 'Duyurular', blurb: 'Sınıf veya tüm okul; sabitlenen önemli notlar.' },
      { id: 'chat', icon: '💬', title: 'Mesajlaşma', blurb: 'Birebir ve grup; öğretmen–veli hattı.' },
      { id: 'gallery', icon: '📸', title: 'Galeri', blurb: 'Etkinlik fotoğrafları yalnızca ilgili veliye.' },
      { id: 'newsletter', icon: '🗞️', title: 'Bülten', blurb: 'Aylık özet PDF, velilere tek tıkla.' },
      { id: 'survey', icon: '📊', title: 'Anket', blurb: 'Etkinlik oylaması, sonuçlar anında.' },
      { id: 'meeting', icon: '🎥', title: 'Toplantı', blurb: 'Online veli görüşmesi ve seminer.' },
    ],
  },
  {
    id: 'safety',
    title: 'Teslim & güvenlik',
    subtitle: 'Kapıdaki kaos yerine kayıtlı teslim',
    items: [
      { id: 'pickup', icon: '🚪', title: 'Güvenli teslim', blurb: 'Yoldayım, kapıdayım, başka biri alacak — QR onay.' },
      { id: 'bus', icon: '🚌', title: 'Servis takip', blurb: 'Güzergâh, duraklar, tahmini varış.' },
      { id: 'health', icon: '💚', title: 'Sağlık', blurb: 'Ateş, ruh hali, olay kaydı.' },
      { id: 'medicine', icon: '💊', title: 'İlaç', blurb: 'Veli talimatı, öğretmen onayı, saatli veriliş.' },
      { id: 'forms', icon: '📋', title: 'Onay formları', blurb: 'Fotoğraf, gezi ve servis izinleri.' },
    ],
  },
  {
    id: 'school',
    title: 'Okul hayatı',
    subtitle: 'Ajanda, ödev, kutlama',
    items: [
      { id: 'schedule', icon: '📚', title: 'Ders programı', blurb: 'Sınıfın günü saat saat velide.' },
      { id: 'homework', icon: '✏️', title: 'Ödev & etkinlik', blurb: 'Eve giden küçük görevler, katılım takibi.' },
      { id: 'calendar', icon: '📅', title: 'Ajanda', blurb: 'Gezi, piknik, veli toplantısı.' },
      { id: 'awards', icon: '⭐', title: 'Ödüller', blurb: 'Davranış yıldızları, veliyle paylaşım.' },
      { id: 'birthdays', icon: '🎂', title: 'Doğum günü', blurb: 'Sınıf kutlamaları, öğretmen hatırlatması.' },
    ],
  },
  {
    id: 'ops',
    title: 'Yönetim & finans',
    subtitle: 'Müdürün sunumda göstereceği kısım',
    items: [
      { id: 'payments', icon: '💳', title: 'Aidat', blurb: 'Taksit, vade, ödendi / açık.' },
      { id: 'accounting', icon: '💰', title: 'Muhasebe', blurb: 'Gelir-gider, banka eşleşme kuyruğu.' },
      { id: 'reports', icon: '📈', title: 'Raporlar', blurb: 'Devam, tahsilat, paylaşım özeti.' },
      { id: 'prereg', icon: '📝', title: 'Ön kayıt', blurb: 'Aday listesi, görüşme, onay.' },
      { id: 'shifts', icon: '👩‍🏫', title: 'Vardiya', blurb: 'Kim görevde, servis şoförü nerede.' },
    ],
  },
];
