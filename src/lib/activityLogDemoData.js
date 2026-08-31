function hoursAgo(hours) {
  const date = new Date();
  date.setHours(date.getHours() - hours, date.getMinutes(), 0, 0);
  return date.toISOString();
}

function daysAgo(days, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 30, 0, 0);
  return date.toISOString();
}

const DEMO_ACTORS = {
  director: { full_name: 'Ayşe Müdür', email: 'mudur@okul.example' },
  teacher1: { full_name: 'Elif Demir', email: 'elif@okul.example' },
  teacher2: { full_name: 'Mehmet Kaya', email: 'mehmet@okul.example' },
  counselor: { full_name: 'Zeynep Rehber', email: 'rehber@okul.example' },
};

function demoRow(id, createdAt, actorKey, actorRole, category, action, summary, metadata = {}) {
  const actor = DEMO_ACTORS[actorKey] ?? DEMO_ACTORS.teacher1;
  return {
    id: `demo-log-${id}`,
    school_id: 'demo-school',
    actor_id: `demo-actor-${actorKey}`,
    actor_role: actorRole,
    category,
    action,
    summary,
    target_type: null,
    target_id: null,
    metadata,
    created_at: createdAt,
    profiles: actor,
    isDemo: true,
  };
}

export function getDemoActivityLogs() {
  return [
    demoRow(1, hoursAgo(1), 'teacher1', 'teacher', 'message', 'sent', 'Veliye mesaj gönderildi: Ada Şahin', {
      studentName: 'Ada Şahin',
    }),
    demoRow(2, hoursAgo(3), 'teacher2', 'teacher', 'attendance', 'saved', 'Yoklama kaydedildi: 5-A · 24 öğrenci', {
      classLabel: '5-A',
    }),
    demoRow(3, hoursAgo(5), 'director', 'director', 'student', 'created', 'Öğrenci eklendi: Baran Tekin'),
    demoRow(4, hoursAgo(8), 'counselor', 'counselor', 'calendar', 'created', 'Takvim etkinliği eklendi: Veli görüşmesi'),
    demoRow(5, daysAgo(0, 9), 'teacher1', 'teacher', 'announcement', 'created', 'Duyuru oluşturuldu: Veli toplantısı'),
    demoRow(6, daysAgo(1, 11), 'teacher2', 'teacher', 'homework', 'assigned', 'Ödev atandı: 5-A · Matematik'),
    demoRow(7, daysAgo(1, 14), 'director', 'director', 'staff', 'created', 'Öğretmen oluşturuldu: Can Yıldız'),
    demoRow(8, daysAgo(2, 10), 'counselor', 'counselor', 'exam', 'published', 'Sınav sonuçları yayımlandı: 5. Sınıf Deneme-1'),
    demoRow(9, daysAgo(2, 15), 'teacher1', 'teacher', 'curriculum', 'saved', 'Müfredat ilerlemesi kaydedildi: 5-A · Fen'),
    demoRow(10, daysAgo(3, 9), 'director', 'director', 'accounting', 'marked_paid', 'Ödeme alındı: Alp Şimşek · ₺2.500'),
    demoRow(11, daysAgo(3, 13), 'teacher2', 'teacher', 'atlas', 'saved', 'Atlas ders yoklaması kaydedildi: 6-B'),
    demoRow(12, daysAgo(4, 10), 'teacher1', 'teacher', 'alert', 'responded', 'Atlas uyarısı yanıtlandı: Kaçırılan ders'),
    demoRow(13, daysAgo(4, 16), 'counselor', 'counselor', 'exam', 'created', 'Deneme sınavı oluşturuldu: 6. Sınıf Deneme-2'),
    demoRow(14, daysAgo(5, 11), 'director', 'director', 'student', 'updated', 'Öğrenci şubesi güncellendi: Ada Şahin → 5-B'),
    demoRow(15, daysAgo(5, 14), 'teacher2', 'teacher', 'message', 'sent', 'Veliye mesaj gönderildi: Alp Şimşek'),
    demoRow(16, daysAgo(6, 9), 'director', 'director', 'staff', 'assigned', 'Öğretmen ataması güncellendi: Elif Demir · 18 öğrenci'),
    demoRow(17, daysAgo(6, 15), 'teacher1', 'teacher', 'attendance', 'saved', 'Yoklama kaydedildi: 6-B · 22 öğrenci'),
    demoRow(18, daysAgo(7, 10), 'counselor', 'counselor', 'calendar', 'updated', 'Takvim etkinliği güncellendi: Rehberlik günü'),
    demoRow(19, daysAgo(7, 13), 'director', 'director', 'accounting', 'saved', 'Ödeme planı kaydedildi: Baran Tekin'),
    demoRow(20, daysAgo(8, 11), 'teacher2', 'teacher', 'announcement', 'deleted', 'Duyuru silindi: Eski duyuru'),
  ];
}
