export async function notifyAttendanceFirstLesson({ schoolId, source, sessionId }) {
  const response = await fetch('/api/attendance-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolId, source, sessionId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Yoklama bildirimi gönderilemedi');
  }
  return response.json();
}
