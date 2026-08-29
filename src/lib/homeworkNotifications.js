export async function notifyHomeworkAssigned({ assignmentId, schoolId }) {
  const response = await fetch('/api/homework-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignmentId, schoolId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Ödev bildirimi gönderilemedi');
  }
  return response.json();
}
