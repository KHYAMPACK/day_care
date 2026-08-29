import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { notifyParentsForMessage } from '../../lib/sendPush';
import {
  InlineError,
  SendButton,
  SuccessMessage,
  getTemplateChipVariant,
} from '../dashboardUi';
import { formatRelativeTimeTr } from '../../utils/formatTime';
import { Icon } from '../ui/Icon';

const TARGET_ALL = 'all';
const CHILD_NAME_PLACEHOLDER = '{{child_name}}';
const CHILD_DISPLAY_FALLBACK = 'Çocuğunuz';

function getFirstName(fullName) {
  if (!fullName?.trim()) return CHILD_DISPLAY_FALLBACK;
  return fullName.trim().split(/\s+/)[0];
}

function applyTemplateBody(templateBody, students, selectedStudentIds) {
  let replacement = CHILD_DISPLAY_FALLBACK;
  if (selectedStudentIds.length === 1) {
    const student = students.find((entry) => entry.id === selectedStudentIds[0]);
    if (student) replacement = getFirstName(student.full_name);
  }
  return templateBody.replaceAll(CHILD_NAME_PLACEHOLDER, replacement);
}

function formatMessageTarget(message) {
  if (message.student_id && message.students?.full_name) return message.students.full_name;
  if (message.group_id && message.groups?.name) return message.groups.name;
  if (message.student_id) return 'Bireysel öğrenci';
  if (message.group_id) return 'Grup';
  return 'Bilinmiyor';
}

function StudentPicker({
  students,
  selectedStudentIds,
  onToggleStudent,
  onToggleSelectAll,
  searchQuery,
  onSearchQueryChange,
  disabled,
}) {
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr');
    if (!query) return students;
    return students.filter((student) =>
      student.full_name.toLocaleLowerCase('tr').includes(query)
    );
  }, [students, searchQuery]);

  const allSelected = students.length > 0 && selectedStudentIds.length === students.length;

  return (
    <div className="student-picker">
      <p className="dash-label-inline">Alıcılar</p>
      <div className="student-picker-toolbar">
        <input
          className="dash-input student-picker-search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Öğrenci ara…"
          disabled={disabled || students.length === 0}
          aria-label="Öğrenci ara"
        />
        <button
          type="button"
          className="student-picker-select-all"
          onClick={onToggleSelectAll}
          disabled={disabled || students.length === 0}
        >
          {allSelected ? 'Seçimleri Kaldır' : 'Tüm Öğrencileri Seç'}
        </button>
      </div>

      {students.length === 0 ? (
        <p className="dash-hint">Gönderilecek öğrenci bulunmuyor.</p>
      ) : filteredStudents.length === 0 ? (
        <p className="dash-hint">Aramanızla eşleşen öğrenci yok.</p>
      ) : (
        <ul className="student-picker-list" role="list">
          {filteredStudents.map((student) => {
            const checked = selectedStudentIds.includes(student.id);
            return (
              <li key={student.id} role="listitem">
                <label
                  className={`student-picker-item${checked ? ' student-picker-item--checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="student-picker-checkbox"
                    checked={checked}
                    onChange={() => onToggleStudent(student.id)}
                    disabled={disabled}
                  />
                  <span className="student-picker-item__name">{student.full_name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="student-picker-count">
        {selectedStudentIds.length} / {students.length} öğrenci seçildi
      </p>
    </div>
  );
}

export default function TeacherParentMessages({ profile, schoolId, students, templates }) {
  const [messages, setMessages] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await withSchoolFilter(
      supabase
        .from('messages')
        .select(
          `
        id,
        body,
        created_at,
        student_id,
        group_id,
        students ( full_name ),
        groups ( name )
      `
        )
        .eq('author_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50),
      schoolId
    );
    if (error) throw error;
    setMessages(data ?? []);
  }, [profile.id, schoolId]);

  useEffect(() => {
    fetchMessages().catch(() => setMessages([]));
  }, [fetchMessages]);

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  function toggleSelectAllStudents() {
    setSelectedStudentIds((current) =>
      current.length === students.length ? [] : students.map((student) => student.id)
    );
  }

  function handleTemplateClick(template) {
    setBody(applyTemplateBody(template.body, students, selectedStudentIds));
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  async function sendMessage(event) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setSubmitError('Mesaj metni zorunludur.');
      return;
    }
    if (selectedStudentIds.length === 0) {
      setSubmitError('En az bir öğrenci seçin.');
      return;
    }

    const selectedStudents = students.filter((student) =>
      selectedStudentIds.includes(student.id)
    );

    setSending(true);
    try {
      const bodiesByStudentId = Object.fromEntries(
        selectedStudents.map((student) => [
          student.id,
          trimmedBody.replaceAll(CHILD_NAME_PLACEHOLDER, getFirstName(student.full_name)),
        ])
      );

      const rows = selectedStudents.map((student) => ({
        body: bodiesByStudentId[student.id],
        author_id: profile.id,
        student_id: student.id,
        group_id: null,
        school_id: schoolId,
      }));

      const { error } = await supabase.from('messages').insert(rows);
      if (error) throw error;

      let pushNote = '';
      try {
        const pushResult = await notifyParentsForMessage({
          targetType: TARGET_ALL,
          targetId: null,
          students,
          studentIds: selectedStudentIds,
          body: trimmedBody,
          bodiesByStudentId,
        });
        if (!pushResult.skipped && pushResult.total > 0) {
          pushNote = ` (${pushResult.sent} anlık bildirim gönderildi)`;
        } else if (pushResult.skipped) {
          pushNote = ' (Mesaj kaydedildi; push abonesi bulunamadı)';
        }
      } catch {
        pushNote = ' (Mesaj kaydedildi; anlık bildirim gönderilemedi.)';
      }

      setSubmitSuccess(
        `Mesaj ${selectedStudents.length} öğrenciye başarıyla gönderildi!${pushNote}`
      );
      setBody('');
      setSelectedStudentIds([]);
      await fetchMessages();
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <form className="dash-form dash-card" onSubmit={sendMessage}>
        <h2 className="dash-section-title">Velilere mesaj gönder</h2>
        <p className="dash-hint">Seçili öğrencilerin velilerine anlık bildirim iletin.</p>

        <StudentPicker
          students={students}
          selectedStudentIds={selectedStudentIds}
          onToggleStudent={toggleStudentSelection}
          onToggleSelectAll={toggleSelectAllStudents}
          searchQuery={studentSearchQuery}
          onSearchQueryChange={setStudentSearchQuery}
          disabled={sending}
        />

        <label className="dash-label">
          Mesaj
          <span className="dash-label-inline">Şablonlar</span>
          {templates.length === 0 ? (
            <p className="dash-hint">Henüz şablon eklenmemiş.</p>
          ) : (
            <div className="template-scroll" role="list" aria-label="Mesaj şablonları">
              {templates.map((template, index) => (
                <button
                  key={template.id}
                  type="button"
                  role="listitem"
                  className={`template-chip template-chip--${getTemplateChipVariant(index)}`}
                  onClick={() => handleTemplateClick(template)}
                  disabled={sending}
                >
                  {template.icon ? <Icon name={template.icon} size={14} /> : null}
                  {template.title}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="dash-textarea"
            rows={6}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Bildiriminizi yazın…"
            disabled={sending}
            required
          />
        </label>

        {submitError && <InlineError error={submitError} context="send" />}
        {submitSuccess && <SuccessMessage message={submitSuccess} />}

        <SendButton
          sending={sending}
          disabled={!body.trim() || selectedStudentIds.length === 0}
          label="Mesaj gönder"
          sendingLabel="Gönderiliyor…"
        />
      </form>

      <section className="dash-card">
        <h2 className="dash-section-title">Gönderilen mesajlar</h2>
        {messages.length === 0 ? (
          <p className="dash-hint">Henüz mesaj gönderilmedi.</p>
        ) : (
          <ul className="history-list">
            {messages.map((message) => (
              <li key={message.id} className="history-item">
                <div className="history-meta">
                  <strong>{formatMessageTarget(message)}</strong>
                  <span>{formatRelativeTimeTr(message.created_at)}</span>
                </div>
                <p className="history-body">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
