import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { USER_ROLES } from '../../lib/roles';
import { useAuth } from '../../context/AuthContext';
import {
  AppNavbar,
  ErrorMessage,
  InlineError,
  LoadingPanel,
  SendButton,
  SuccessMessage,
} from '../../components/dashboardUi';
import {
  formatPhoneDisplay,
  isValidWhatsAppPhone,
  normalizePhone,
} from '../../lib/announcements';
import TeacherAnnouncements from '../../components/announcements/TeacherAnnouncements';
import AcademicCalendar from '../../components/calendar/AcademicCalendar';
import ClassSetup from '../../components/curriculum/ClassSetup';
import CurriculumAssignmentPanel from '../../components/curriculum/CurriculumAssignmentPanel';
import DirectorCurriculum from '../../components/curriculum/DirectorCurriculum';
import DirectorAttendance from '../../components/attendance/DirectorAttendance';
import DirectorExams from '../../components/exams/DirectorExams';
import SchoolBrandingPanel from '../../components/branding/SchoolBrandingPanel';
import { getTabFromSearch } from '../../components/demo/DemoKit';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import { Icon, TEMPLATE_ICON_NAMES, resolveIconName } from '../../components/ui/Icon';
import {
  loadCurriculumCatalog,
  loadSchoolAssignments,
  loadSchoolClasses,
} from '../../lib/curriculum';

const TABS = [
  { id: 'overview', label: 'Genel Bakış', icon: 'chart' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
  { id: 'exams', label: 'Sınavlar', icon: 'file' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'attendance', label: 'Yoklama', icon: 'check' },
  { id: 'students', label: 'Öğrenci Ekle', icon: 'child' },
  { id: 'audit', label: 'Mesaj Trafiği', icon: 'clipboard' },
  { id: 'assignment', label: 'Öğretmen Atama', icon: 'school' },
  { id: 'staff', label: 'Öğretmen Yönetimi', icon: 'teacher' },
  { id: 'matching', label: 'Eşleştirme', icon: 'users' },
  { id: 'templates', label: 'Şablonlar', icon: 'sparkle' },
];

const TEMPLATE_ICONS = TEMPLATE_ICON_NAMES;
const EMPTY_TEMPLATE = { title: '', body: '', icon: 'mail' };

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
        <Icon name={icon} size={18} />
      </span>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
    </article>
  );
}

function OverviewTab({ stats, linksCount, school, schoolId, onBrandingSaved }) {
  return (
    <section className="director-panel">
      <div className="stat-grid">
        <StatCard icon="backpack" label="Toplam Öğrenci" value={stats.students} variant="sky" />
        <StatCard icon="users" label="Aktif Veli" value={stats.activeParents} variant="mint" />
        <StatCard icon="teacher" label="Kayıtlı Öğretmen" value={stats.teachers} variant="peach" />
        <StatCard icon="link" label="Veli–Öğrenci Eşleşmesi" value={linksCount} variant="lavender" />
      </div>
      <SchoolBrandingPanel school={school} schoolId={schoolId} onSaved={onBrandingSaved} />
      <div className="dash-card director-overview-note">
        <h2 className="dash-section-title">Okul özeti</h2>
        <p className="dash-hint">
          Veli eşleştirmelerini <strong>Eşleştirme</strong>, öğretmen atamalarını{' '}
          <strong>Öğretmen Atama</strong> sekmesinden yönetebilirsiniz. Şube ve müfredat ders
          ataması da oradadır. Sınıf duyuruları <strong>Duyurular</strong> altındadır.
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

function StaffTeacherPhoneField({ teacher, disabled, onSave }) {
  const [phone, setPhone] = useState(formatPhoneDisplay(teacher.phone) || '');

  useEffect(() => {
    setPhone(formatPhoneDisplay(teacher.phone) || '');
  }, [teacher.phone]);

  return (
    <form
      className="staff-teacher-item__phone"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(teacher, phone);
      }}
    >
      <input
        className="dash-input"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="0532 123 45 67"
        disabled={disabled}
        aria-label={`${teacher.full_name ?? 'Öğretmen'} WhatsApp numarası`}
      />
      <button type="submit" className="director-btn-secondary" disabled={disabled}>
        Kaydet
      </button>
    </form>
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
  onSavePhone,
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
            <p className="dash-hint">
              {teachers.length} kayıtlı öğretmen. WhatsApp numarası velilerin Mesaj sekmesinde
              görünür.
            </p>
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
                <StaffTeacherPhoneField
                  teacher={teacher}
                  disabled={staffActionLoading}
                  onSave={onSavePhone}
                />
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
          Bir öğretmen seçin ve mesaj gönderebileceği öğrencileri işaretleyin. Müfredat için
          üstteki şube + ders atamasını kullanın.
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
                  className={`icon-picker__btn${resolveIconName(form.icon) === icon ? ' icon-picker__btn--active' : ''}`}
                  onClick={() => onIconPick(icon)}
                  disabled={saving}
                  aria-label={`İkon ${icon}`}
                  aria-pressed={resolveIconName(form.icon) === icon}
                >
                  <Icon name={icon} size={18} />
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
                    <Icon name={template.icon ?? 'mail'} size={18} />
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
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingGradeId, setUpdatingGradeId] = useState(null);
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

    setSaving(true);

    const { error: insertError } = await supabase.from('students').insert({
      full_name: trimmedName,
      grade: grade ? Number(grade) : null,
      school_id: schoolId,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setFullName('');
    setGrade('');
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

  async function handleGradeChange(student, nextGrade) {
    setUpdatingGradeId(student.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await withSchoolFilter(
      supabase
        .from('students')
        .update({ grade: nextGrade ? Number(nextGrade) : null })
        .eq('id', student.id),
      schoolId
    );

    setUpdatingGradeId(null);

    if (updateError) {
      setError(updateError);
      return;
    }

    await onRefresh();
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <h2 className="dash-section-title">Yeni öğrenci</h2>
        <p className="dash-hint">
          Ad soyad ve sınıf — kayıt okulunuza otomatik bağlanır. Sınıf, deneme sınavı
          bildirimlerinin doğru veliye gitmesi için gerekir.
        </p>

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
            Sınıf
            <select
              className="dash-input"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              disabled={saving}
            >
              <option value="">Seçilmedi</option>
              {STUDENT_GRADES.map((value) => (
                <option key={value} value={value}>
                  {value}. sınıf
                </option>
              ))}
            </select>
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
                  {student.grade ? (
                    <span className="student-roster-item__grade">
                      {formatStudentGrade(student.grade)}
                    </span>
                  ) : null}
                  <select
                    className="dash-input"
                    value={student.grade ?? ''}
                    onChange={(event) => handleGradeChange(student, event.target.value)}
                    disabled={updatingGradeId === student.id || saving}
                    aria-label={`${student.full_name} sınıfı`}
                  >
                    <option value="">Sınıf yok</option>
                    {STUDENT_GRADES.map((value) => (
                      <option key={value} value={value}>
                        {value}. sınıf
                      </option>
                    ))}
                  </select>
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

export default function DirectorDashboard({ profile, schoolId, onSignOut }) {
  const { school, refreshSchool } = useAuth();
  const [activeTab, setActiveTab] = useState(() => getTabFromSearch('overview'));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [curriculumAssignments, setCurriculumAssignments] = useState([]);
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
  const navLogoUrl = school?.logo_url ?? null;
  const schoolName = school?.name ?? 'OkulTakip';

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
        supabase.from('students').select('id, full_name, grade, class_id').order('full_name'),
        schoolId
      ),
      withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email, phone')
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

    let studentsResult = studentsRes;
    if (studentsResult.error && /class_id/i.test(studentsResult.error.message ?? '')) {
      studentsResult = await withSchoolFilter(
        supabase.from('students').select('id, full_name, grade').order('full_name'),
        schoolId
      );
    }

    const firstError =
      parentsRes.error ??
      studentsResult.error ??
      teachersRes.error ??
      linksRes.error ??
      templatesRes.error ??
      null;

    if (firstError) {
      throw firstError;
    }

    const schoolStudents = studentsResult.data ?? [];
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

    try {
      const [schoolClasses, catalog, assignments] = await Promise.all([
        loadSchoolClasses(schoolId),
        loadCurriculumCatalog(),
        loadSchoolAssignments(schoolId),
      ]);
      setClasses(schoolClasses);
      setCurriculumSubjects(catalog.subjects);
      setCurriculumAssignments(assignments);
    } catch {
      setClasses([]);
      setCurriculumSubjects([]);
      setCurriculumAssignments([]);
    }
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
          .select('id, full_name, email, role, phone')
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
      icon: resolveIconName(template.icon ?? 'mail'),
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
      icon: resolveIconName(templateForm.icon || 'mail'),
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

  async function handleSaveTeacherPhone(teacher, rawPhone) {
    const trimmed = rawPhone.trim();
    const label = teacher.full_name ?? teacher.email ?? 'Öğretmen';

    if (trimmed && !isValidWhatsAppPhone(trimmed)) {
      setStaffError(new Error(`Lütfen ${label} için geçerli bir cep numarası girin. Örnek: 0532 123 45 67`));
      setStaffSuccess(null);
      return;
    }

    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    const { error } = await withSchoolFilter(
      supabase
        .from('profiles')
        .update({ phone: trimmed ? normalizePhone(trimmed) : null })
        .eq('id', teacher.id),
      schoolId
    );

    setStaffActionLoading(false);

    if (error) {
      setStaffError(error);
      return;
    }

    setStaffSuccess(
      trimmed
        ? `${label} için WhatsApp numarası kaydedildi.`
        : `${label} WhatsApp numarası kaldırıldı.`
    );
    await refreshTeachers({ showLoading: false });
  }

  if (profile?.role !== USER_ROLES.director) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} onSignOut={onSignOut} />
        <LoadingPanel message="Müdür paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} onSignOut={onSignOut} />
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
      <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} onSignOut={onSignOut} />

      <main className="dash-page dash-page--director">
        <div className="director-layout">
          <header className="dash-header">
            <h1 className="dash-title">Müdür</h1>
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
                    <Icon name={tab.icon} size={15} />
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              linksCount={links.length}
              school={school}
              schoolId={schoolId}
              onBrandingSaved={refreshSchool}
            />
          )}

        {activeTab === 'announcements' && (
          <section className="director-panel">
            <TeacherAnnouncements profile={profile} schoolId={schoolId} students={students} />
          </section>
        )}

        {activeTab === 'calendar' && (
          <section className="director-panel">
            <AcademicCalendar schoolId={schoolId} canEdit />
          </section>
        )}

        {activeTab === 'exams' && (
          <section className="director-panel">
            <DirectorExams schoolId={schoolId} />
          </section>
        )}

        {activeTab === 'curriculum' && (
          <DirectorCurriculum
            schoolId={schoolId}
            classCount={classes.length}
            studentCount={students.length}
            studentsInClassCount={students.filter((student) => student.class_id).length}
            curriculumAssignmentCount={curriculumAssignments.length}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'attendance' && <DirectorAttendance schoolId={schoolId} />}

        {activeTab === 'students' && (
          <section className="director-panel">
            <ClassSetup
              classes={classes}
              students={students}
              schoolId={schoolId}
              onRefresh={loadData}
            />
            <StudentCreatorTab students={students} schoolId={schoolId} onRefresh={loadData} />
          </section>
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
          <section className="director-panel">
            <CurriculumAssignmentPanel
              teachers={teachers}
              classes={classes}
              subjects={curriculumSubjects}
              assignments={curriculumAssignments}
              onRefresh={loadData}
            />
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
          </section>
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
            onSavePhone={handleSaveTeacherPhone}
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
        </div>
      </main>
    </>
  );
}
