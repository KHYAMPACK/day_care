import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { USER_ROLES } from '../../lib/roles';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_THEME } from '../../lib/schoolTheme';
import {
  AppNavbar,
  ErrorMessage,
  InlineError,
  LoadingPanel,
  SendButton,
  SuccessMessage,
} from '../../components/dashboardUi';

const TABS = [
  { id: 'overview', label: 'Genel Bakış', icon: '📊' },
  { id: 'students', label: 'Öğrenci Ekle', icon: '👶' },
  { id: 'audit', label: 'Mesaj Trafiği', icon: '📋' },
  { id: 'assignment', label: 'Öğretmen Atama', icon: '🏫' },
  { id: 'staff', label: 'Öğretmen Yönetimi', icon: '👩‍🏫' },
  { id: 'matching', label: 'Eşleştirme', icon: '🤝' },
  { id: 'templates', label: 'Şablonlar', icon: '✨' },
  { id: 'settings', label: 'Okul Ayarları', icon: '🎨' },
];

const TEMPLATE_ICONS = ['💌', '🍽️', '🌙', '🚗', '💚', '🎒', '🏫', '✨', '🌸', '📢', '🍼', '☀️'];

const EMPTY_TEMPLATE = { title: '', body: '', icon: '💌' };

const MESSAGE_AUDIT_SELECT = `
  id,
  body,
  created_at,
  author_id,
  student_id,
  group_id,
  profiles ( full_name, email ),
  students ( full_name ),
  groups ( name )
`;

function getStartOfTodayIso() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function formatAuditTime(iso) {
  return new Date(iso).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRecipient(message) {
  if (message.students?.full_name) return message.students.full_name;
  if (message.groups?.name) return `Grup: ${message.groups.name}`;
  if (message.student_id) return 'Öğrenci';
  if (message.group_id) return 'Grup';
  return '—';
}

function formatAuthor(message) {
  return message.profiles?.full_name ?? message.profiles?.email ?? 'Bilinmiyor';
}

function formatRoleLabel(role) {
  if (role === USER_ROLES.teacher) return 'Öğretmen';
  if (role === USER_ROLES.director) return 'Müdür';
  if (role === USER_ROLES.parent) return 'Veli';
  return role ?? '—';
}

function formatBirthDate(value) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function AccessDenied({ onSignOut }) {
  return (
    <main className="dash-page dash-page--director dash-error-page">
      <ErrorMessage
        error="Bu sayfaya yalnızca müdürler erişebilir."
        context="general"
        onRetry={onSignOut}
        retryLabel="Çıkış Yap"
      />
    </main>
  );
}

function StatCard({ icon, label, value, variant = 'lavender' }) {
  return (
    <article className={`stat-card stat-card--${variant}`}>
      <span className="stat-card__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
    </article>
  );
}

function OverviewTab({ stats, linksCount }) {
  return (
    <section className="director-panel">
      <div className="stat-grid">
        <StatCard icon="🎒" label="Toplam Öğrenci" value={stats.students} variant="sky" />
        <StatCard icon="👨‍👩‍👧" label="Aktif Veli" value={stats.activeParents} variant="mint" />
        <StatCard icon="👩‍🏫" label="Kayıtlı Öğretmen" value={stats.teachers} variant="peach" />
        <StatCard icon="🔗" label="Veli–Öğrenci Eşleşmesi" value={linksCount} variant="lavender" />
      </div>
      <div className="dash-card director-overview-note">
        <h2 className="dash-section-title">Okul özeti</h2>
        <p className="dash-hint">
          Veli eşleştirmelerini <strong>Eşleştirme</strong>, öğretmen–öğrenci atamalarını{' '}
          <strong>Öğretmen Atama</strong>, şablonları <strong>Şablonlar</strong> sekmesinden
          yönetebilirsiniz.
        </p>
      </div>
    </section>
  );
}

function MatchingTab({
  parents,
  students,
  links,
  selectedParentId,
  selectedStudentId,
  onParentChange,
  onStudentChange,
  onLink,
  onUnlink,
  linking,
  matchError,
  matchSuccess,
}) {
  const parentById = useMemo(
    () => Object.fromEntries(parents.map((parent) => [parent.id, parent])),
    [parents]
  );
  const studentById = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students]
  );

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Yeni eşleştirme</h2>
        <p className="dash-hint">
          Bir veli hesabını öğrenci kaydıyla ilişkilendirin. Veli, bu öğrenciye ait bildirimleri
          görebilir.
        </p>

        <form
          className="dash-form"
          onSubmit={(event) => {
            event.preventDefault();
            onLink();
          }}
        >
          <label className="dash-label">
            Veli seçin
            <select
              className="dash-input"
              value={selectedParentId}
              onChange={(event) => onParentChange(event.target.value)}
              disabled={linking || parents.length === 0}
              required
            >
              <option value="">Veli seçin…</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.full_name ?? parent.email ?? parent.id}
                </option>
              ))}
            </select>
          </label>

          <label className="dash-label">
            Öğrenci seçin
            <select
              className="dash-input"
              value={selectedStudentId}
              onChange={(event) => onStudentChange(event.target.value)}
              disabled={linking || students.length === 0}
              required
            >
              <option value="">Öğrenci seçin…</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </label>

          {matchError && <InlineError error={matchError} context="general" />}
          {matchSuccess && <SuccessMessage message={matchSuccess} />}

          <SendButton
            sending={linking}
            disabled={!selectedParentId || !selectedStudentId}
            label="Eşleştirmeyi Kaydet"
            sendingLabel="Kaydediliyor…"
          />
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Mevcut eşleştirmeler</h2>
        {links.length === 0 ? (
          <p className="dash-hint">Henüz veli–öğrenci eşleştirmesi yapılmamış.</p>
        ) : (
          <ul className="match-list">
            {links.map((link) => {
              const parent = parentById[link.parent_id];
              const student = studentById[link.student_id];
              const key = `${link.student_id}-${link.parent_id}`;

              return (
                <li key={key} className="match-item">
                  <div className="match-item__info">
                    <span className="match-item__names">
                      {parent?.full_name ?? parent?.email ?? 'Veli'} ↔{' '}
                      {student?.full_name ?? 'Öğrenci'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="match-item__remove"
                    onClick={() => onUnlink(link)}
                    disabled={linking}
                  >
                    Kaldır
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function TabLoading({ message }) {
  return (
    <section className="director-panel">
      <div className="dash-card director-tab-loading">
        <div className="dash-spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </section>
  );
}

function TabError({ error, onRetry, retryLabel = 'Tekrar Dene' }) {
  return (
    <section className="director-panel">
      <div className="dash-card">
        <InlineError error={error} context="general" />
        {onRetry && (
          <button type="button" className="error-card__retry" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </section>
  );
}

function MessageAuditTab({ messages, loading, error, onRefresh }) {
  if (loading) {
    return <TabLoading message="Bugünkü mesajlar yükleniyor…" />;
  }

  if (error) {
    return <TabError error={error} onRetry={onRefresh} />;
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <div className="director-card-header">
          <div>
            <h2 className="dash-section-title">Tüm Mesaj Trafiği</h2>
            <p className="dash-hint">Bugün gönderilen tüm bildirimler ({messages.length} adet).</p>
          </div>
          <button type="button" className="director-btn-secondary" onClick={onRefresh}>
            Yenile
          </button>
        </div>

        {messages.length === 0 ? (
          <p className="dash-hint">Bugün henüz mesaj gönderilmemiş.</p>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th scope="col">Saat</th>
                  <th scope="col">Öğretmen</th>
                  <th scope="col">Alıcı</th>
                  <th scope="col">Mesaj</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td className="audit-table__time">
                      <time dateTime={message.created_at}>{formatAuditTime(message.created_at)}</time>
                    </td>
                    <td className="audit-table__teacher">{formatAuthor(message)}</td>
                    <td className="audit-table__recipient">{formatRecipient(message)}</td>
                    <td className="audit-table__body">{message.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function StaffManagerTab({
  teachers,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchResults,
  searchLoading,
  searchError,
  staffActionLoading,
  staffError,
  staffSuccess,
  onPromote,
  onDemote,
  onRefreshTeachers,
  teachersLoading,
  teachersError,
}) {
  if (teachersLoading) {
    return <TabLoading message="Öğretmen listesi yükleniyor…" />;
  }

  if (teachersError) {
    return <TabError error={teachersError} onRetry={onRefreshTeachers} />;
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Kullanıcı ara ve öğretmen yap</h2>
        <p className="dash-hint">
          E-posta veya ad soyad ile arayın, ardından hesabı öğretmen olarak yetkilendirin.
        </p>

        <form
          className="dash-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="dash-label">
            Kullanıcı ara
            <input
              className="dash-input"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="E-posta veya ad soyad…"
              disabled={staffActionLoading || searchLoading}
            />
          </label>
          <SendButton
            sending={searchLoading}
            disabled={!searchQuery.trim()}
            label="Ara"
            sendingLabel="Aranıyor…"
          />
        </form>

        {searchError && <InlineError error={searchError} context="general" />}

        {searchResults.length > 0 && (
          <ul className="staff-search-list">
            {searchResults.map((user) => {
              const isTeacher = user.role === USER_ROLES.teacher;
              const isDirector = user.role === USER_ROLES.director;
              const canPromote = !isTeacher && !isDirector;

              return (
                <li key={user.id} className="staff-search-item">
                  <div className="staff-search-item__info">
                    <strong>{user.full_name ?? user.email ?? user.id}</strong>
                    <span className="staff-search-item__meta">
                      {user.email ?? '—'} · {formatRoleLabel(user.role)}
                    </span>
                  </div>
                  {canPromote ? (
                    <button
                      type="button"
                      className="director-btn-promote"
                      onClick={() => onPromote(user)}
                      disabled={staffActionLoading}
                    >
                      Öğretmen Yap
                    </button>
                  ) : (
                    <span className="staff-search-item__badge">
                      {isDirector ? 'Müdür' : 'Zaten öğretmen'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="dash-card">
        <div className="director-card-header">
          <div>
            <h2 className="dash-section-title">Aktif öğretmenler</h2>
            <p className="dash-hint">{teachers.length} kayıtlı öğretmen.</p>
          </div>
          <button
            type="button"
            className="director-btn-secondary"
            onClick={onRefreshTeachers}
            disabled={staffActionLoading}
          >
            Yenile
          </button>
        </div>

        {staffError && <InlineError error={staffError} context="general" />}
        {staffSuccess && <SuccessMessage message={staffSuccess} />}

        {teachers.length === 0 ? (
          <p className="dash-hint">Henüz öğretmen atanmamış.</p>
        ) : (
          <ul className="staff-teacher-list">
            {teachers.map((teacher) => (
              <li key={teacher.id} className="staff-teacher-item">
                <div className="staff-teacher-item__info">
                  <strong>{teacher.full_name ?? teacher.email ?? teacher.id}</strong>
                  <span className="staff-search-item__meta">{teacher.email ?? '—'}</span>
                </div>
                <button
                  type="button"
                  className="director-btn-danger"
                  onClick={() => onDemote(teacher)}
                  disabled={staffActionLoading}
                >
                  Yetki Kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TeacherAssignmentTab({
  teachers,
  students,
  selectedTeacherId,
  onTeacherChange,
  selectedStudentIds,
  onToggleStudent,
  onToggleSelectAll,
  assignmentSearchQuery,
  onAssignmentSearchChange,
  savedStudentIds,
  onSave,
  saving,
  loading,
  error,
  success,
}) {
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);

  const filteredStudents = useMemo(() => {
    const query = assignmentSearchQuery.trim().toLocaleLowerCase('tr');
    if (!query) return students;
    return students.filter((student) =>
      student.full_name.toLocaleLowerCase('tr').includes(query)
    );
  }, [students, assignmentSearchQuery]);

  const allSelected =
    students.length > 0 && selectedStudentIds.length === students.length;

  const savedStudents = students.filter((student) => savedStudentIds.includes(student.id));

  if (loading) {
    return <TabLoading message="Öğretmen atamaları yükleniyor…" />;
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Sınıf / Öğretmen Atama</h2>
        <p className="dash-hint">
          Bir öğretmen seçin ve sorumlu olacağı öğrencileri işaretleyin. Kaydettiğinizde mevcut
          atamalar güncellenir.
        </p>

        <label className="dash-label">
          Öğretmen seçin
          <select
            className="dash-input"
            value={selectedTeacherId}
            onChange={(event) => onTeacherChange(event.target.value)}
            disabled={saving || teachers.length === 0}
          >
            <option value="">Öğretmen seçin…</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name ?? teacher.email ?? teacher.id}
              </option>
            ))}
          </select>
        </label>

        {!selectedTeacherId ? (
          <p className="dash-hint">Atama yapmak için önce bir öğretmen seçin.</p>
        ) : (
          <>
            {savedStudents.length > 0 && (
              <div className="assignment-saved">
                <p className="dash-label-inline">
                  {selectedTeacher?.full_name ?? selectedTeacher?.email} — mevcut atamalar
                </p>
                <ul className="assignment-chip-list">
                  {savedStudents.map((student) => (
                    <li key={student.id} className="assignment-chip">
                      {student.full_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {savedStudents.length === 0 && (
              <p className="assignment-empty-note">
                Bu öğretmene henüz öğrenci atanmamış.
              </p>
            )}

            <div className="student-picker">
              <p className="dash-label-inline">Öğrenciler</p>
              <div className="student-picker-toolbar">
                <input
                  className="dash-input student-picker-search"
                  type="search"
                  value={assignmentSearchQuery}
                  onChange={(event) => onAssignmentSearchChange(event.target.value)}
                  placeholder="Öğrenci ara…"
                  disabled={saving || students.length === 0}
                  aria-label="Öğrenci ara"
                />
                <button
                  type="button"
                  className="student-picker-select-all"
                  onClick={onToggleSelectAll}
                  disabled={saving || students.length === 0}
                >
                  {allSelected ? 'Seçimleri Kaldır' : 'Tüm Öğrencileri Seç'}
                </button>
              </div>

              {students.length === 0 ? (
                <p className="dash-hint">Atanabilecek öğrenci bulunmuyor.</p>
              ) : filteredStudents.length === 0 ? (
                <p className="dash-hint">Aramanızla eşleşen öğrenci yok.</p>
              ) : (
                <ul className="student-picker-list" role="list">
                  {filteredStudents.map((student) => {
                    const checked = selectedStudentIds.includes(student.id);
                    const isSaved = savedStudentIds.includes(student.id);

                    return (
                      <li key={student.id} role="listitem">
                        <label
                          className={`student-picker-item${checked ? ' student-picker-item--checked' : ''}${isSaved ? ' student-picker-item--assigned' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="student-picker-checkbox"
                            checked={checked}
                            onChange={() => onToggleStudent(student.id)}
                            disabled={saving}
                          />
                          <span className="student-picker-item__name">{student.full_name}</span>
                          {isSaved && (
                            <span className="assignment-item-badge">Atanmış</span>
                          )}
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

            {error && <InlineError error={error} context="general" />}
            {success && <SuccessMessage message={success} />}

            <form
              className="dash-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
              <SendButton
                sending={saving}
                disabled={!selectedTeacherId}
                label="Öğrencileri Öğretmene Ata"
                sendingLabel="Kaydediliyor…"
              />
            </form>
          </>
        )}
      </div>
    </section>
  );
}

function TemplatesTab({
  templates,
  form,
  editingId,
  onFormChange,
  onIconPick,
  onSubmit,
  onEdit,
  onCancelEdit,
  onDelete,
  saving,
  templateError,
  templateSuccess,
}) {
  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">
          {editingId ? 'Şablonu düzenle' : 'Yeni şablon oluştur'}
        </h2>

        <form className="dash-form" onSubmit={onSubmit}>
          <label className="dash-label">
            Başlık
            <input
              className="dash-input"
              type="text"
              value={form.title}
              onChange={(event) => onFormChange({ title: event.target.value })}
              placeholder="Örn. Alma hatırlatması"
              disabled={saving}
              required
            />
          </label>

          <div>
            <p className="dash-label-inline">İkon</p>
            <div className="icon-picker" role="list" aria-label="Şablon ikonu seçin">
              {TEMPLATE_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  role="listitem"
                  className={`icon-picker__btn${form.icon === icon ? ' icon-picker__btn--active' : ''}`}
                  onClick={() => onIconPick(icon)}
                  disabled={saving}
                  aria-label={`İkon ${icon}`}
                  aria-pressed={form.icon === icon}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <label className="dash-label">
            Mesaj metni
            <textarea
              className="dash-textarea"
              rows={5}
              value={form.body}
              onChange={(event) => onFormChange({ body: event.target.value })}
              placeholder="Mesaj içeriği… {{child_name}} kullanabilirsiniz."
              disabled={saving}
              required
            />
          </label>

          {templateError && <InlineError error={templateError} context="general" />}
          {templateSuccess && <SuccessMessage message={templateSuccess} />}

          <div className="director-form-actions">
            {editingId && (
              <button
                type="button"
                className="director-btn-secondary"
                onClick={onCancelEdit}
                disabled={saving}
              >
                İptal
              </button>
            )}
            <SendButton
              sending={saving}
              label={editingId ? 'Değişiklikleri Kaydet' : 'Şablon Oluştur'}
              sendingLabel="Kaydediliyor…"
            />
          </div>
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Kayıtlı şablonlar</h2>
        {templates.length === 0 ? (
          <p className="dash-hint">Henüz şablon eklenmemiş.</p>
        ) : (
          <ul className="template-admin-list">
            {templates.map((template) => (
              <li key={template.id} className="template-admin-item">
                <div className="template-admin-item__main">
                  <span className="template-admin-item__icon" aria-hidden="true">
                    {template.icon ?? '💌'}
                  </span>
                  <div>
                    <strong>{template.title}</strong>
                    <p>{template.body}</p>
                  </div>
                </div>
                <div className="template-admin-item__actions">
                  <button
                    type="button"
                    className="director-btn-secondary"
                    onClick={() => onEdit(template)}
                    disabled={saving}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="match-item__remove"
                    onClick={() => onDelete(template.id)}
                    disabled={saving}
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StudentCreatorTab({ students, schoolId, onRefresh }) {
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Öğrenci adı soyadı zorunludur.');
      return;
    }

    if (!dateOfBirth) {
      setError('Doğum tarihi zorunludur.');
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from('students').insert({
      full_name: trimmedName,
      date_of_birth: dateOfBirth,
      school_id: schoolId,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setFullName('');
    setDateOfBirth('');
    setSuccess('Öğrenci başarıyla eklendi.');
    await onRefresh();
  }

  async function handleDelete(student) {
    if (
      !window.confirm(
        `${student.full_name} kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
      )
    ) {
      return;
    }

    setDeletingId(student.id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await withSchoolFilter(
      supabase.from('students').delete().eq('id', student.id),
      schoolId
    );

    setDeletingId(null);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    setSuccess(`${student.full_name} listeden kaldırıldı.`);
    await onRefresh();
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Yeni öğrenci</h2>
        <p className="dash-hint">Sadece ad soyad ve doğum tarihi yeterli — kayıt okulunuza otomatik bağlanır.</p>

        <form className="dash-form" onSubmit={handleSubmit}>
          <label className="dash-label">
            Öğrenci Adı Soyadı
            <input
              className="dash-input"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Örn. Ayşe Yılmaz"
              disabled={saving}
              required
              autoComplete="name"
            />
          </label>

          <label className="dash-label">
            Doğum Tarihi
            <input
              className="dash-input"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              disabled={saving}
              required
            />
          </label>

          {error && <InlineError error={error} context="general" />}
          {success && <SuccessMessage message={success} />}

          <SendButton
            sending={saving}
            label="Öğrenci Ekle"
            sendingLabel="Ekleniyor…"
          />
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Okul öğrencileri</h2>
        {students.length === 0 ? (
          <p className="dash-hint">Henüz kayıtlı öğrenci yok.</p>
        ) : (
          <ul className="match-list student-roster-list">
            {students.map((student) => (
              <li key={student.id} className="match-item student-roster-item">
                <div className="student-roster-item__meta">
                  <span className="match-item__names">{student.full_name}</span>
                  <span className="student-roster-item__dob">
                    {formatBirthDate(student.date_of_birth)}
                  </span>
                </div>
                <button
                  type="button"
                  className="match-item__remove"
                  onClick={() => handleDelete(student)}
                  disabled={deletingId === student.id || saving}
                >
                  {deletingId === student.id ? 'Siliniyor…' : 'Sil'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SchoolSettingsTab({ school, schoolId, onSaved }) {
  const [logoUrl, setLogoUrl] = useState(school?.logo_url ?? '');
  const [primaryColor, setPrimaryColor] = useState(school?.primary_color ?? DEFAULT_THEME.primary);
  const [secondaryColor, setSecondaryColor] = useState(
    school?.secondary_color ?? DEFAULT_THEME.secondary
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    setLogoUrl(school?.logo_url ?? '');
    setPrimaryColor(school?.primary_color ?? DEFAULT_THEME.primary);
    setSecondaryColor(school?.secondary_color ?? DEFAULT_THEME.secondary);
  }, [school]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error: saveError } = await supabase
      .from('schools')
      .update({
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor || null,
        secondary_color: secondaryColor || null,
      })
      .eq('id', schoolId);

    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setSuccess('Okul ayarları kaydedildi. Tema tüm kullanıcılara yansıyacak.');
    await onSaved();
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Okul Ayarları</h2>
        <p className="dash-hint">
          Kreşinizin logosunu ve marka renklerini buradan özelleştirin. Veliler ve öğretmenler
          giriş yaptığında bu görünümü görür.
        </p>

        <form className="dash-form school-settings-form" onSubmit={handleSubmit}>
          <label className="dash-label">
            Logo URL
            <input
              className="dash-input"
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://ornek.com/logo.png"
              disabled={saving}
            />
            <span className="auth-hint">PNG veya SVG bağlantısı yapıştırın.</span>
          </label>

          {logoUrl.trim() && (
            <div className="school-settings-preview">
              <span className="dash-label-inline">Logo önizleme</span>
              <img
                src={logoUrl.trim()}
                alt="Okul logosu önizlemesi"
                className="school-settings-logo-preview"
              />
            </div>
          )}

          <div className="school-settings-colors">
            <label className="dash-label school-settings-color-field">
              Ana renk
              <div className="school-settings-color-row">
                <input
                  className="school-settings-color-input"
                  type="color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  disabled={saving}
                  aria-label="Ana renk seçin"
                />
                <input
                  className="dash-input school-settings-color-text"
                  type="text"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  disabled={saving}
                  spellCheck={false}
                />
              </div>
            </label>

            <label className="dash-label school-settings-color-field">
              İkincil renk
              <div className="school-settings-color-row">
                <input
                  className="school-settings-color-input"
                  type="color"
                  value={secondaryColor}
                  onChange={(event) => setSecondaryColor(event.target.value)}
                  disabled={saving}
                  aria-label="İkincil renk seçin"
                />
                <input
                  className="dash-input school-settings-color-text"
                  type="text"
                  value={secondaryColor}
                  onChange={(event) => setSecondaryColor(event.target.value)}
                  disabled={saving}
                  spellCheck={false}
                />
              </div>
            </label>
          </div>

          <div
            className="school-settings-theme-preview"
            style={{
              '--preview-primary': primaryColor,
              '--preview-secondary': secondaryColor,
            }}
          >
            <span className="school-settings-theme-preview__chip">Buton örneği</span>
            <span className="school-settings-theme-preview__panel">Kart arka planı</span>
          </div>

          {error && <InlineError error={error} context="general" />}
          {success && <SuccessMessage message={success} />}

          <SendButton
            sending={saving}
            label="Ayarları Kaydet"
            sendingLabel="Kaydediliyor…"
          />
        </form>
      </div>
    </section>
  );
}

export default function DirectorDashboard({ profile, schoolId, onSignOut }) {
  const { school, refreshSchool } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [links, setLinks] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [linking, setLinking] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [matchSuccess, setMatchSuccess] = useState(null);

  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [templateSuccess, setTemplateSuccess] = useState(null);

  const [auditMessages, setAuditMessages] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [staffSearchResults, setStaffSearchResults] = useState([]);
  const [staffSearchLoading, setStaffSearchLoading] = useState(false);
  const [staffSearchError, setStaffSearchError] = useState(null);
  const [staffActionLoading, setStaffActionLoading] = useState(false);
  const [staffError, setStaffError] = useState(null);
  const [staffSuccess, setStaffSuccess] = useState(null);

  const [assignmentTeacherId, setAssignmentTeacherId] = useState('');
  const [assignmentSelectedStudentIds, setAssignmentSelectedStudentIds] = useState([]);
  const [assignmentSavedStudentIds, setAssignmentSavedStudentIds] = useState([]);
  const [assignmentSearchQuery, setAssignmentSearchQuery] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState(null);

  const displayName = profile?.full_name ?? profile?.email ?? 'Müdür';
  const navBrand = school?.name ? `${school.name} — Müdür` : 'KreşTakip — Müdür';
  const navLogoUrl = school?.logo_url ?? null;

  const stats = useMemo(() => {
    const activeParentIds = new Set(links.map((link) => link.parent_id));
    return {
      students: students.length,
      activeParents: activeParentIds.size,
      teachers: teachers.length,
    };
  }, [students.length, teachers.length, links]);

  const loadData = useCallback(async () => {
    setLoadError(null);

    const [parentsRes, studentsRes, teachersRes, linksRes, templatesRes] = await Promise.all([
      withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', USER_ROLES.parent)
          .order('full_name'),
        schoolId
      ),
      withSchoolFilter(
        supabase.from('students').select('id, full_name, date_of_birth').order('full_name'),
        schoolId
      ),
      withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', USER_ROLES.teacher)
          .order('full_name'),
        schoolId
      ),
      supabase.from('student_parents').select('student_id, parent_id'),
      withSchoolFilter(
        supabase
          .from('message_templates')
          .select('id, title, body, icon, created_at')
          .order('title'),
        schoolId
      ),
    ]);

    const firstError =
      parentsRes.error ??
      studentsRes.error ??
      teachersRes.error ??
      linksRes.error ??
      templatesRes.error ??
      null;

    if (firstError) {
      throw firstError;
    }

    const schoolStudents = studentsRes.data ?? [];
    const schoolParents = parentsRes.data ?? [];
    const studentIdSet = new Set(schoolStudents.map((student) => student.id));
    const parentIdSet = new Set(schoolParents.map((parent) => parent.id));
    const schoolLinks = (linksRes.data ?? []).filter(
      (link) => studentIdSet.has(link.student_id) && parentIdSet.has(link.parent_id)
    );

    setParents(schoolParents);
    setStudents(schoolStudents);
    setTeachers(teachersRes.data ?? []);
    setLinks(schoolLinks);
    setTemplates(templatesRes.data ?? []);
  }, [schoolId]);

  const loadTodayMessages = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);

    try {
      const { data, error } = await withSchoolFilter(
        supabase
          .from('messages')
          .select(MESSAGE_AUDIT_SELECT)
          .gte('created_at', getStartOfTodayIso())
          .order('created_at', { ascending: false }),
        schoolId
      );

      if (error) throw error;
      setAuditMessages(data ?? []);
    } catch (error) {
      setAuditError(error);
    } finally {
      setAuditLoading(false);
    }
  }, [schoolId]);

  const refreshTeachers = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setTeachersLoading(true);
    setTeachersError(null);

    try {
      const { data, error } = await withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('role', USER_ROLES.teacher)
          .order('full_name'),
        schoolId
      );

      if (error) throw error;
      setTeachers(data ?? []);
    } catch (error) {
      setTeachersError(error);
    } finally {
      if (showLoading) setTeachersLoading(false);
    }
  }, [schoolId]);

  const loadTeacherAssignments = useCallback(async (teacherId) => {
    if (!teacherId) {
      setAssignmentSavedStudentIds([]);
      setAssignmentSelectedStudentIds([]);
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError(null);

    try {
      const { data, error } = await supabase
        .from('teacher_students')
        .select('student_id, students!inner ( school_id )')
        .eq('teacher_id', teacherId)
        .eq('students.school_id', schoolId);

      if (error) throw error;

      const ids = (data ?? []).map((row) => row.student_id);
      setAssignmentSavedStudentIds(ids);
      setAssignmentSelectedStudentIds(ids);
    } catch (error) {
      setAssignmentError(error);
      setAssignmentSavedStudentIds([]);
      setAssignmentSelectedStudentIds([]);
    } finally {
      setAssignmentLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (activeTab === 'assignment' && assignmentTeacherId) {
      loadTeacherAssignments(assignmentTeacherId);
    }
  }, [activeTab, assignmentTeacherId, loadTeacherAssignments]);

  function handleAssignmentTeacherChange(teacherId) {
    setAssignmentTeacherId(teacherId);
    setAssignmentSuccess(null);
    setAssignmentError(null);
    setAssignmentSearchQuery('');
    if (!teacherId) {
      setAssignmentSavedStudentIds([]);
      setAssignmentSelectedStudentIds([]);
    }
  }

  function toggleAssignmentStudent(studentId) {
    setAssignmentSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  function toggleAssignmentSelectAll() {
    setAssignmentSelectedStudentIds((current) =>
      current.length === students.length ? [] : students.map((student) => student.id)
    );
  }

  async function handleSaveTeacherAssignment() {
    if (!assignmentTeacherId) {
      setAssignmentError('Lütfen bir öğretmen seçin.');
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError(null);
    setAssignmentSuccess(null);

    const { error: deleteError } = await supabase
      .from('teacher_students')
      .delete()
      .eq('teacher_id', assignmentTeacherId);

    if (deleteError) {
      setAssignmentSaving(false);
      setAssignmentError(deleteError);
      return;
    }

    if (assignmentSelectedStudentIds.length > 0) {
      const rows = assignmentSelectedStudentIds.map((studentId) => ({
        teacher_id: assignmentTeacherId,
        student_id: studentId,
      }));

      const { error: insertError } = await supabase.from('teacher_students').insert(rows);

      if (insertError) {
        setAssignmentSaving(false);
        setAssignmentError(insertError);
        return;
      }
    }

    setAssignmentSaving(false);
    setAssignmentSavedStudentIds([...assignmentSelectedStudentIds]);
    setAssignmentSuccess(
      assignmentSelectedStudentIds.length > 0
        ? `${assignmentSelectedStudentIds.length} öğrenci öğretmene atandı.`
        : 'Öğretmenin tüm öğrenci atamaları kaldırıldı.'
    );
  }

  useEffect(() => {
    if (profile?.role !== USER_ROLES.director) return;

    let mounted = true;

    async function init() {
      setLoading(true);
      try {
        await loadData();
      } catch (error) {
        if (mounted) setLoadError(error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [profile?.role, loadData]);

  useEffect(() => {
    if (activeTab === 'audit' && profile?.role === USER_ROLES.director && !loading) {
      loadTodayMessages();
    }
  }, [activeTab, profile?.role, loading, loadTodayMessages]);

  async function handleLink() {
    setLinking(true);
    setMatchError(null);
    setMatchSuccess(null);

    const { error } = await supabase.from('student_parents').insert({
      student_id: selectedStudentId,
      parent_id: selectedParentId,
    });

    setLinking(false);

    if (error) {
      if (error.code === '23505') {
        setMatchError('Bu veli ve öğrenci zaten eşleştirilmiş.');
      } else {
        setMatchError(error);
      }
      return;
    }

    setMatchSuccess('Eşleştirme başarıyla kaydedildi.');
    setSelectedParentId('');
    setSelectedStudentId('');
    await loadData();
  }

  async function handleUnlink(link) {
    setLinking(true);
    setMatchError(null);
    setMatchSuccess(null);

    const { error } = await supabase
      .from('student_parents')
      .delete()
      .eq('student_id', link.student_id)
      .eq('parent_id', link.parent_id);

    setLinking(false);

    if (error) {
      setMatchError(error);
      return;
    }

    setMatchSuccess('Eşleştirme kaldırıldı.');
    await loadData();
  }

  function handleTemplateFormChange(partial) {
    setTemplateForm((current) => ({ ...current, ...partial }));
  }

  function handleEditTemplate(template) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      title: template.title,
      body: template.body,
      icon: template.icon ?? '💌',
    });
    setTemplateError(null);
    setTemplateSuccess(null);
  }

  function handleCancelTemplateEdit() {
    setEditingTemplateId(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setTemplateError(null);
    setTemplateSuccess(null);
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    setSavingTemplate(true);
    setTemplateError(null);
    setTemplateSuccess(null);

    const payload = {
      title: templateForm.title.trim(),
      body: templateForm.body.trim(),
      icon: templateForm.icon || '💌',
      school_id: schoolId,
    };

    const { error } = editingTemplateId
      ? await withSchoolFilter(
          supabase.from('message_templates').update(payload).eq('id', editingTemplateId),
          schoolId
        )
      : await supabase.from('message_templates').insert(payload);

    setSavingTemplate(false);

    if (error) {
      setTemplateError(error);
      return;
    }

    setTemplateSuccess(editingTemplateId ? 'Şablon güncellendi.' : 'Yeni şablon oluşturuldu.');
    setEditingTemplateId(null);
    setTemplateForm(EMPTY_TEMPLATE);
    await loadData();
  }

  async function handleDeleteTemplate(templateId) {
    if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;

    setSavingTemplate(true);
    setTemplateError(null);
    setTemplateSuccess(null);

    const { error } = await withSchoolFilter(
      supabase.from('message_templates').delete().eq('id', templateId),
      schoolId
    );

    setSavingTemplate(false);

    if (error) {
      setTemplateError(error);
      return;
    }

    if (editingTemplateId === templateId) {
      handleCancelTemplateEdit();
    }

    setTemplateSuccess('Şablon silindi.');
    await loadData();
  }

  async function handleStaffSearch() {
    const term = staffSearchQuery.trim();
    if (!term) return;

    setStaffSearchLoading(true);
    setStaffSearchError(null);
    setStaffSearchResults([]);

    const safeTerm = term.replace(/[%_\\,]/g, ' ').trim();
    if (!safeTerm) {
      setStaffSearchLoading(false);
      setStaffSearchError('Geçerli bir arama terimi girin.');
      return;
    }

    const { data, error } = await withSchoolFilter(
      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .or(`email.ilike.%${safeTerm}%,full_name.ilike.%${safeTerm}%`)
        .order('full_name')
        .limit(15),
      schoolId
    );

    setStaffSearchLoading(false);

    if (error) {
      setStaffSearchError(error);
      return;
    }

    setStaffSearchResults(data ?? []);
  }

  async function handlePromoteTeacher(user) {
    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    const { error } = await withSchoolFilter(
      supabase
        .from('profiles')
        .update({ role: USER_ROLES.teacher, school_id: schoolId })
        .eq('id', user.id),
      schoolId
    );

    setStaffActionLoading(false);

    if (error) {
      setStaffError(error);
      return;
    }

    setStaffSuccess(`${user.full_name ?? user.email} öğretmen olarak atandı.`);
    setStaffSearchResults((current) =>
      current.map((entry) =>
        entry.id === user.id ? { ...entry, role: USER_ROLES.teacher } : entry
      )
    );
    await refreshTeachers({ showLoading: false });
  }

  async function handleDemoteTeacher(teacher) {
    const label = teacher.full_name ?? teacher.email ?? 'Bu kullanıcı';
    if (
      !window.confirm(`${label} kullanıcısının öğretmen yetkisini kaldırmak istiyor musunuz?`)
    ) {
      return;
    }

    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    await supabase.from('teacher_students').delete().eq('teacher_id', teacher.id);

    const { error } = await withSchoolFilter(
      supabase
        .from('profiles')
        .update({ role: USER_ROLES.parent })
        .eq('id', teacher.id),
      schoolId
    );

    setStaffActionLoading(false);

    if (error) {
      setStaffError(error);
      return;
    }

    setStaffSuccess(`${label} veli rolüne alındı.`);
    await refreshTeachers({ showLoading: false });
  }

  if (profile?.role !== USER_ROLES.director) {
    return (
      <>
        <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <LoadingPanel message="Müdür paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <main className="dash-page dash-page--director dash-error-page">
          <ErrorMessage
            error={loadError}
            context="admin"
            onRetry={() => window.location.reload()}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <AppNavbar brand={navBrand} logoUrl={navLogoUrl} onSignOut={onSignOut} />

      <main className="dash-page dash-page--director">
        <div className="director-layout">
          <header className="dash-header">
            <h1 className="dash-title">Müdür Paneli</h1>
            <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
          </header>

          <nav className="director-tabs" aria-label="Müdür paneli sekmeleri">
            <div className="director-tabs__track">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`director-tab${activeTab === tab.id ? ' director-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  <span className="director-tab__icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {activeTab === 'overview' && <OverviewTab stats={stats} linksCount={links.length} />}

        {activeTab === 'students' && (
          <StudentCreatorTab students={students} schoolId={schoolId} onRefresh={loadData} />
        )}

        {activeTab === 'audit' && (
          <MessageAuditTab
            messages={auditMessages}
            loading={auditLoading}
            error={auditError}
            onRefresh={loadTodayMessages}
          />
        )}

        {activeTab === 'assignment' && (
          <TeacherAssignmentTab
            teachers={teachers}
            students={students}
            selectedTeacherId={assignmentTeacherId}
            onTeacherChange={handleAssignmentTeacherChange}
            selectedStudentIds={assignmentSelectedStudentIds}
            onToggleStudent={toggleAssignmentStudent}
            onToggleSelectAll={toggleAssignmentSelectAll}
            assignmentSearchQuery={assignmentSearchQuery}
            onAssignmentSearchChange={setAssignmentSearchQuery}
            savedStudentIds={assignmentSavedStudentIds}
            onSave={handleSaveTeacherAssignment}
            saving={assignmentSaving}
            loading={assignmentLoading && Boolean(assignmentTeacherId)}
            error={assignmentError}
            success={assignmentSuccess}
          />
        )}

        {activeTab === 'staff' && (
          <StaffManagerTab
            teachers={teachers}
            searchQuery={staffSearchQuery}
            onSearchQueryChange={setStaffSearchQuery}
            onSearch={handleStaffSearch}
            searchResults={staffSearchResults}
            searchLoading={staffSearchLoading}
            searchError={staffSearchError}
            staffActionLoading={staffActionLoading}
            staffError={staffError}
            staffSuccess={staffSuccess}
            onPromote={handlePromoteTeacher}
            onDemote={handleDemoteTeacher}
            onRefreshTeachers={() => refreshTeachers({ showLoading: true })}
            teachersLoading={teachersLoading}
            teachersError={teachersError}
          />
        )}

        {activeTab === 'matching' && (
          <MatchingTab
            parents={parents}
            students={students}
            links={links}
            selectedParentId={selectedParentId}
            selectedStudentId={selectedStudentId}
            onParentChange={setSelectedParentId}
            onStudentChange={setSelectedStudentId}
            onLink={handleLink}
            onUnlink={handleUnlink}
            linking={linking}
            matchError={matchError}
            matchSuccess={matchSuccess}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesTab
            templates={templates}
            form={templateForm}
            editingId={editingTemplateId}
            onFormChange={handleTemplateFormChange}
            onIconPick={(icon) => handleTemplateFormChange({ icon })}
            onSubmit={handleTemplateSubmit}
            onEdit={handleEditTemplate}
            onCancelEdit={handleCancelTemplateEdit}
            onDelete={handleDeleteTemplate}
            saving={savingTemplate}
            templateError={templateError}
            templateSuccess={templateSuccess}
          />
        )}

        {activeTab === 'settings' && (
          <SchoolSettingsTab school={school} schoolId={schoolId} onSaved={refreshSchool} />
        )}
        </div>
      </main>
    </>
  );
}
