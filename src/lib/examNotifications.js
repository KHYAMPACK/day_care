export async function notifyExamResultsPublished({ sessionId, schoolId }) {
  const response = await fetch('/api/exam-notify-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, schoolId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Bildirim gönderilemedi');
  }
  return response.json();
}
