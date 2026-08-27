export const ATLAS_CALENDAR_SOURCE = 'atlas-2026-2027';

function holiday(startsOn, endsOn, title, body, notify = true) {
  return {
    title,
    body,
    event_type: 'holiday',
    starts_on: startsOn,
    ends_on: endsOn ?? startsOn,
    starts_at: null,
    audience_grades: null,
    notify,
  };
}

function exam(startsOn, grades, endsOn = null) {
  const label = formatGradeLabel(grades);
  return {
    title: `${label} deneme sınavı`,
    body:
      grades.includes(8)
        ? `${label} deneme sınavı. 8. sınıf sınavı saat 10:00'da başlar.`
        : `${label} deneme sınavı.`,
    event_type: 'exam',
    starts_on: startsOn,
    ends_on: endsOn ?? startsOn,
    starts_at: grades.includes(8) ? '10:00' : null,
    audience_grades: grades,
    notify: true,
  };
}

function event(type, startsOn, title, body, options = {}) {
  return {
    title,
    body,
    event_type: type,
    starts_on: startsOn,
    ends_on: options.ends_on ?? startsOn,
    starts_at: options.starts_at ?? null,
    audience_grades: options.audience_grades ?? null,
    notify: options.notify ?? true,
  };
}

export function formatGradeLabel(grades) {
  const sorted = [...new Set(grades)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'Okul';
  if (sorted.length === 1) return `${sorted[0]}. sınıf`;
  if (sorted.length === 2) return `${sorted[0]}. ve ${sorted[1]}. sınıf`;
  const last = sorted.at(-1);
  return `${sorted.slice(0, -1).join(', ')} ve ${last}. sınıf`;
}

/** ATLAS 2026–2027 year, transcribed from the official color calendar. */
export const ATLAS_CALENDAR_EVENTS = [
  event('course_start', '2026-09-07', 'Kurs başlıyor', 'ATLAS kursu başlıyor.'),
  event('school_start', '2026-09-14', 'Okul açılıyor', '2026–2027 eğitim öğretim yılı birinci dönemi başlıyor.'),
  exam('2026-09-12', [8]),
  exam('2026-09-19', [5, 6, 7, 8]),
  event('parent_meeting', '2026-09-26', '1. veli toplantısı', 'Birinci dönem veli toplantısı.'),
  event('important_day', '2026-09-30', 'Psikolojik Danışmanlar Günü', 'Psikolojik Danışmanlar Günü.', {
    notify: false,
  }),

  exam('2026-10-03', [8]),
  exam('2026-10-10', [7, 8]),
  exam('2026-10-17', [5, 6, 8]),
  exam('2026-10-24', [7, 8]),
  holiday('2026-10-29', '2026-10-29', 'Cumhuriyet Bayramı', '29 Ekim Cumhuriyet Bayramı. Kurum tatil.'),
  exam('2026-10-31', [8]),

  exam('2026-11-07', [5, 6, 7, 8]),
  event('important_day', '2026-11-10', "Atatürk'ü Anma Günü", "10 Kasım Atatürk'ü Anma Günü.", {
    notify: false,
  }),
  holiday(
    '2026-11-13',
    '2026-11-22',
    'Ara tatil',
    'Birinci dönem ara tatili. Kurum 13–22 Kasım arasında kapalıdır.'
  ),
  exam('2026-11-16', [8], '2026-11-18'),
  event('school_start', '2026-11-23', 'Okul açılıyor', 'Ara tatil sonrası dersler başlıyor. 23 Kasım Fibonacci Günü.'),
  event('important_day', '2026-11-23', 'Fibonacci Günü', 'Fibonacci Günü.', { notify: false }),
  event('important_day', '2026-11-24', 'Öğretmenler Günü', '24 Kasım Öğretmenler Günü.', { notify: false }),
  exam('2026-11-28', [7, 8]),

  exam('2026-12-05', [5, 6, 8]),
  exam('2026-12-12', [7, 8]),
  event(
    'activity',
    '2026-12-18',
    'Yılbaşı çekilişi',
    'Yılbaşı çekilişi (ücret sınırlamalı).'
  ),
  exam('2026-12-19', [8]),
  exam('2026-12-26', [8]),
  event('activity', '2026-12-30', 'Hediyeleşme', 'Yıl sonu hediyeleşme.'),
  holiday('2026-12-31', '2026-12-31', 'Yılbaşı gecesi', 'Yılbaşı gecesi. Kurum tatil.'),

  holiday('2027-01-01', '2027-01-03', 'Yılbaşı tatili', 'Yılbaşı tatili. Kurum tatil.'),
  exam('2027-01-09', [5, 6, 7, 8]),
  exam('2027-01-16', [8]),
  event('school_end', '2027-01-22', 'Dönem bitişi', 'Birinci dönem sona eriyor.'),
  exam('2027-01-29', [8]),

  holiday(
    '2027-02-01',
    '2027-02-07',
    'Yarıyıl tatili',
    'Kurum yarıyıl tatili. 2. dönem 8 Şubat’ta başlar.'
  ),
  event(
    'school_start',
    '2027-02-08',
    '2. dönem başlangıcı',
    'İkinci dönem başlıyor. Aynı gün Ramazan başlangıcı.'
  ),
  event('important_day', '2027-02-08', 'Ramazan başlangıcı', 'Ramazan ayı başlıyor.', { notify: false }),
  exam('2027-02-13', [5, 6, 7, 8]),
  exam('2027-02-20', [8]),
  exam('2027-02-27', [8]),

  holiday(
    '2027-03-05',
    '2027-03-14',
    '2. dönem ara tatili ve Ramazan Bayramı',
    'Ara tatil 5 Mart’ta başlar. 8 Mart arife ve Kadınlar Günü, 9–11 Mart Ramazan Bayramı, 14 Mart tatil bitişi.'
  ),
  event('activity', '2027-03-05', 'Bayramlaşma', 'Bayramlaşma etkinliği.', { notify: false }),
  exam('2027-03-06', [7, 8]),
  event('important_day', '2027-03-08', 'Kadınlar Günü', '8 Mart Dünya Kadınlar Günü.', { notify: false }),
  event('important_day', '2027-03-14', 'Pi Günü ve Doktorlar Günü', '14 Mart Pi Günü ve Doktorlar Günü.', {
    notify: false,
  }),
  event('school_start', '2027-03-15', 'Okul başlıyor', 'Ara tatil sonrası dersler başlıyor.'),
  exam('2027-03-20', [5, 6, 7, 8]),
  event('parent_meeting', '2027-03-27', '2. veli toplantısı', 'İkinci dönem veli toplantısı.'),

  exam('2027-04-03', [8]),
  exam('2027-04-10', [7, 8]),
  event('important_day', '2027-04-10', 'Polis Haftası', 'Polis Haftası.', { notify: false }),
  exam('2027-04-17', [5, 6, 8]),
  holiday(
    '2027-04-23',
    '2027-04-23',
    'Ulusal Egemenlik ve Çocuk Bayramı',
    '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı. Kurum tatil.'
  ),
  exam('2027-04-24', [8]),

  holiday('2027-05-01', '2027-05-01', 'Emek ve Dayanışma Günü', '1 Mayıs Emek ve Dayanışma Günü. Kurum tatil.'),
  exam('2027-05-08', [5, 6, 7, 8]),
  event(
    'important_day',
    '2027-05-12',
    'Dünya Kadın Matematikçiler Günü',
    '12 Mayıs Dünya Kadın Matematikçiler Günü.',
    { notify: false }
  ),
  event('activity', '2027-05-14', 'Bayramlaşma', 'Kurban Bayramı öncesi bayramlaşma.'),
  holiday(
    '2027-05-15',
    '2027-05-19',
    'Kurban Bayramı',
    '15 Mayıs arefe, 16–19 Mayıs Kurban Bayramı. 19 Mayıs aynı zamanda Atatürk’ü Anma, Gençlik ve Spor Bayramı.'
  ),
  event(
    'camp',
    '2027-05-20',
    '8. sınıf deneme ve konu tekrarı kampı',
    'Mayıs–Haziran sarı günleri 8. sınıfların deneme, soru çözümü ve konu tekrarı kampıdır. Ara sınıflar derslere devam eder.',
    { ends_on: '2027-06-11', audience_grades: [8] }
  ),

  exam('2027-06-05', [5, 6, 7]),
  event('school_end', '2027-06-25', 'Okulların kapanması', '2026–2027 eğitim öğretim yılı sona eriyor.'),

  event('course_start', '2027-07-05', 'Yaz kursu açılıyor', 'Yaz kursu başlıyor.'),
  holiday('2027-07-15', '2027-07-15', 'Demokrasi Bayramı', '15 Temmuz Demokrasi ve Millî Birlik Günü. Kurum tatil.'),

  holiday('2027-08-30', '2027-08-30', 'Zafer Bayramı', '30 Ağustos Zafer Bayramı. Kurum tatil.'),
];
