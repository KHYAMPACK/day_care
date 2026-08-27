export const ANNOUNCEMENT_SELECT =
  'id, school_id, author_id, author_name, title, body, pinned, created_at, updated_at';

export function normalizePhone(raw) {
  if (!raw) return '';

  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('90') && digits.length >= 12) {
    return digits.slice(0, 15);
  }

  if (digits.startsWith('0') && digits.length === 11) {
    return `90${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `90${digits}`;
  }

  return digits.slice(0, 15);
}

export function isValidWhatsAppPhone(raw) {
  const normalized = normalizePhone(raw);
  return /^90\d{10}$/.test(normalized);
}

export function formatPhoneDisplay(raw) {
  const normalized = normalizePhone(raw);
  if (normalized.startsWith('90') && normalized.length === 12) {
    return `0${normalized.slice(2, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10)}`;
  }
  return raw?.trim() || '';
}

function childGreeting(childNames) {
  const names = (Array.isArray(childNames) ? childNames : [childNames])
    .map((name) => name?.trim().split(/\s+/)[0])
    .filter(Boolean);

  if (names.length === 0) return 'çocuğunuz';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ve ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ve ${names.at(-1)}`;
}

export function whatsappUrl(phone, childNames) {
  const e164 = normalizePhone(phone);
  const text = encodeURIComponent(`Merhaba, ${childGreeting(childNames)} velisiyim.`);
  return `https://wa.me/${e164}?text=${text}`;
}

export function announcementCreatePayload({ schoolId, authorId, title, body, pinned }) {
  return {
    school_id: schoolId,
    author_id: authorId,
    title: title.trim(),
    body: body.trim(),
    pinned: Boolean(pinned),
  };
}

export function announcementUpdatePayload({ title, body, pinned }) {
  return {
    title: title.trim(),
    body: body.trim(),
    pinned: Boolean(pinned),
  };
}

export function sortAnnouncements(rows) {
  return [...rows].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

export function groupContactsByTeacher(rows) {
  const grouped = new Map();

  (rows ?? []).forEach((row) => {
    const existing = grouped.get(row.teacher_id);
    const student = { id: row.student_id, full_name: row.student_full_name };

    if (existing) {
      if (!existing.students.some((entry) => entry.id === student.id)) {
        existing.students.push(student);
      }
      return;
    }

    grouped.set(row.teacher_id, {
      teacherId: row.teacher_id,
      fullName: row.full_name,
      phone: row.phone,
      students: [student],
    });
  });

  return [...grouped.values()];
}

export function announcementPushBody(title, body) {
  const heading = title?.trim();
  const text = body?.trim();
  if (heading && text) return `${heading}: ${text}`;
  return heading || text || 'Yeni duyuru';
}
