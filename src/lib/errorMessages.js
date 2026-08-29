import { useEffect, useState } from 'react';

const CONTEXT_TITLES = {
  auth: 'Giriş yapılamadı',
  profile: 'Profil yüklenemedi',
  admin: 'Panel yüklenemedi',
  parent: 'Akış yüklenemedi',
  send: 'Mesaj gönderilemedi',
  push: 'Bildirim gönderilemedi',
  subscribe: 'Bildirim açılamadı',
  calendar: 'Takvim yüklenemedi',
  curriculum: 'Müfredat yüklenemedi',
  attendance: 'Yoklama yüklenemedi',
  general: 'Bir sorun oluştu',
};

const FRIENDLY_PREFIXES = [
  'Mesaj',
  'Lütfen',
  'Bildirim',
  'Profil',
  'Bağlantı',
  'Giriş',
  'Hesap',
  'Oturum',
  'Push',
  'Anlık',
  'Veli',
  'Grup',
  'Öğrenci',
  'Takvim',
  'Müfredat',
  'Yoklama',
  'Ünite',
  'Şube',
  'Yarın',
  'Sınıf',
  'Şifre',
  'PIN',
  'İzin',
  'Etkinlik',
  'Anket',
  'Soru',
  'Seçenek',
  'En az',
  'En fazla',
  'Bu anket',
  'Bu öğrenci',
  'Yayımlanmış',
  'Taslak',
  'Yayımlamak',
  'Bekleyen',
  'Kağıt',
  'Aydınlatma',
  'İşlem',
  'Mevcut',
  'Geçersiz',
  'No push',
  'Mesaj kaydedildi',
];

function getRawMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  return (error.message ?? '').trim();
}

function isOffline(error, raw) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  const lower = raw.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('net::err_') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('the internet connection appears to be offline') ||
    (error?.name === 'TypeError' && lower.includes('fetch'))
  );
}

function isAuthError(raw) {
  const lower = raw.toLowerCase();
  return (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('email not confirmed') ||
    lower.includes('user already registered') ||
    lower.includes('invalid email') ||
    lower.includes('weak password') ||
    lower.includes('jwt expired') ||
    lower.includes('invalid or expired session')
  );
}

function isPermissionError(raw) {
  const lower = raw.toLowerCase();
  return (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('not authorized') ||
    lower.includes('forbidden') ||
    lower.includes('only admins') ||
    lower.includes('only teachers') ||
    lower.includes('only teachers and directors')
  );
}

function isAlreadyFriendly(raw) {
  if (!raw) return false;
  if (FRIENDLY_PREFIXES.some((prefix) => raw.startsWith(prefix))) return true;
  if (!/[A-Za-z]{5,}/.test(raw)) return true;
  return false;
}

function mapAuthMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid_credentials')) {
    return 'Kullanıcı adı veya PIN hatalı.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-posta adresinizi onaylamanız gerekiyor.';
  }
  if (lower.includes('user already registered')) {
    return 'Bu e-posta adresi zaten kayıtlı.';
  }
  if (lower.includes('weak password')) {
    return 'Şifre en az 6 karakter olmalıdır.';
  }
  return 'Giriş bilgilerinizi kontrol edip tekrar deneyin.';
}

function mapSubscribeMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('izni verilmedi') || lower.includes('permission denied') || lower.includes('notallowed')) {
    return 'Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.';
  }
  if (lower.includes('desteklemiyor')) {
    return 'Bu cihaz veya tarayıcı anlık bildirimleri desteklemiyor.';
  }
  if (lower.includes('vapid')) {
    return 'Bildirim ayarları henüz yapılandırılmamış. Okul yöneticinize bildirin.';
  }
  if (lower.includes('oturum')) {
    return 'Oturumunuz sona ermiş olabilir. Çıkış yapıp tekrar giriş yapın.';
  }
  return 'Anlık bildirimler açılamadı. Lütfen tekrar deneyin.';
}

function mapCalendarMessage(raw) {
  const lower = raw.toLowerCase();

  if (
    lower.includes('exam_kind') ||
    lower.includes('exam_subject') ||
    lower.includes('exam_term') ||
    lower.includes('exam_round')
  ) {
    return 'Deneme sınav alanları henüz eklenmedi. supabase/migrations/026_exams.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }

  if (lower.includes('exam_sessions') || lower.includes('exam_student_results')) {
    return 'Sınav oturum tabloları henüz oluşturulmadı. supabase/migrations/032_lgs_exam_system.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }

  if (
    /relation .+calendar_events.+ does not exist/.test(lower) ||
    (lower.includes('could not find the table') && lower.includes('calendar_events'))
  ) {
    return 'Takvim tablosu henüz oluşturulmadı. supabase/migrations/021_academic_calendar.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }

  if (lower.includes('schema cache') && lower.includes('calendar_events')) {
    return 'Takvim tablosu var ama API henüz görmüyor. Supabase Dashboard → Project Settings → API → Reload schema deyip sayfayı yenileyin.';
  }

  if (lower.includes('calendar_events')) {
    return 'Takvim işlemi başarısız oldu. 021, 026 ve 036 migration dosyalarını kontrol edin veya şema önbelleğini yenileyin.';
  }

  return 'Takvim yüklenemedi. Lütfen tekrar deneyin.';
}

function mapAttendanceMessage(raw) {
  const lower = raw.toLowerCase();
  if (
    lower.includes('attendance_sessions') ||
    lower.includes('attendance_records') ||
    lower.includes('save_class_attendance') ||
    lower.includes('could not find the table') ||
    /relation .+ does not exist/.test(lower)
  ) {
    return 'Yoklama tabloları henüz oluşturulmadı. supabase/migrations/024_attendance.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }
  if (lower.includes('infinite recursion') || lower.includes('42p17')) {
    return 'Yoklama yetkileri düzeltilmeli. supabase/migrations/024_attendance.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }
  if (lower.includes('schema cache') || lower.includes('duration_weeks')) {
    return 'Yoklama tabloları var ama API henüz görmüyor. Supabase Dashboard → Project Settings → API → Reload schema deyip bu sayfayı yenileyin.';
  }
  return 'Yoklama yüklenemedi. Lütfen tekrar deneyin.';
}

function mapCurriculumMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('infinite recursion') || lower.includes('42p17')) {
    return 'Müfredat yetkileri düzeltilmeli. supabase/migrations/023_curriculum_rls_fix.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }
  if (lower.includes('schema cache') || lower.includes('could not find the table')) {
    return 'Müfredat tabloları var ama API henüz görmüyor. Supabase Dashboard → Project Settings → API → Reload schema deyip bu sayfayı yenileyin.';
  }
  if (/relation .+ does not exist/.test(lower)) {
    return 'Müfredat tabloları henüz oluşturulmadı. supabase/migrations/022_curriculum.sql dosyasını Supabase SQL Editor’da çalıştırın.';
  }
  return 'Müfredat yüklenemedi. Lütfen tekrar deneyin.';
}

function mapPushMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('oturum')) {
    return 'Bildirim göndermek için oturumunuz gerekli.';
  }
  if (lower.includes('only admins') || lower.includes('forbidden')) {
    return 'Bu işlem yalnızca yöneticiler içindir.';
  }
  return 'Anlık bildirim gönderilemedi.';
}

export function formatAppError(error, context = 'general') {
  const raw = getRawMessage(error);

  if (isAlreadyFriendly(raw) && !isOffline(error, raw)) {
    return {
      type: 'info',
      title: null,
      message: raw,
      icon: 'thought',
    };
  }

  if (isOffline(error, raw)) {
    return {
      type: 'offline',
      title: 'İnternet bağlantısı yok',
      message: 'Bağlantınızı kontrol edin ve tekrar deneyin.',
      icon: 'wifi',
    };
  }

  if (isAuthError(raw)) {
    return {
      type: 'auth',
      title: CONTEXT_TITLES.auth,
      message: mapAuthMessage(raw),
      icon: 'lock',
    };
  }

  if (isPermissionError(raw)) {
    const message =
      context === 'calendar'
        ? 'Takvimde işlem yetkiniz yok. Rehberlikçi iseniz supabase/migrations/036_counselor_role.sql dosyasını Supabase SQL Editor’da çalıştırın.'
        : 'Bu işlem için yetkiniz bulunmuyor.';
    return {
      type: 'permission',
      title: CONTEXT_TITLES[context] ?? CONTEXT_TITLES.general,
      message,
      icon: 'flower',
    };
  }

  if (context === 'subscribe') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.subscribe,
      message: mapSubscribeMessage(raw),
      icon: 'bell',
    };
  }

  if (context === 'calendar') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.calendar,
      message: mapCalendarMessage(raw),
      icon: 'calendar',
    };
  }

  if (context === 'curriculum') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.curriculum,
      message: mapCurriculumMessage(raw),
      icon: 'book',
    };
  }

  if (context === 'attendance') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.attendance,
      message: mapAttendanceMessage(raw),
      icon: 'check',
    };
  }

  if (context === 'push') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.push,
      message: isOffline(error, raw) ? 'Bağlantınızı kontrol edin ve tekrar deneyin.' : mapPushMessage(raw),
      icon: 'phone',
    };
  }

  return {
    type: 'general',
    title: CONTEXT_TITLES[context] ?? CONTEXT_TITLES.general,
    message: 'Bir şeyler ters gitti. Lütfen biraz sonra tekrar deneyin.',
    icon: 'leaf',
  };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
