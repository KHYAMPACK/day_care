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
import { CURRICULUM_SUBJECT_DEFS } from '../../lib/dersligCatalog';
import TeacherAnnouncements from '../../components/announcements/TeacherAnnouncements';
import AcademicCalendar from '../../components/calendar/AcademicCalendar';
import DirectorCurriculum from '../../components/curriculum/DirectorCurriculum';
import DirectorAttendance from '../../components/attendance/DirectorAttendance';
import ExamOperationsPanel from '../../components/exams/ExamOperationsPanel';
import SchoolBrandingPanel from '../../components/branding/SchoolBrandingPanel';
import DirectorAssessmentTypes from '../../components/atlas/DirectorAssessmentTypes';
import { hasAtlasSchedule, hasAccounting, hasHomeworkTracking, saveSchoolFeature } from '../../lib/schoolFeatures';
import DirectorAccounting from '../../components/accounting/DirectorAccounting';
import DirectorHomework from '../../components/homework/DirectorHomework';
import { getTabFromSearch } from '../../components/demo/DemoKit';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import { Icon, TEMPLATE_ICON_NAMES, resolveIconName } from '../../components/ui/Icon';
import { AnimatedView } from '../../components/ui/AnimatedView';
import StaffShell from '../../components/layout/StaffShell';
import {
  formatClassLabel,
  loadCurriculumCatalog,
  loadSchoolAssignments,
  loadSchoolClasses,
} from '../../lib/curriculum';
import { createStaffUser, deleteStaffUser, resetStaffPin } from '../../lib/staffUsers';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const TABS = [
  { id: 'overview', label: 'Genel Bakış', icon: 'chart' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
  { id: 'exams', label: 'Sınavlar', icon: 'file' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'homework', label: 'Kitaplar', icon: 'clipboard' },
  { id: 'attendance', label: 'Yoklama', icon: 'check' },
  { id: 'student-mgmt', label: 'Öğrenci Yönetimi', icon: 'child' },
  { id: 'parents', label: 'Veli Yönetimi', icon: 'users' },
  { id: 'staff', label: 'Öğretmen Yönetimi', icon: 'teacher' },
  { id: 'audit', label: 'Mesaj Trafiği', icon: 'clipboard' },
  { id: 'assignment', label: 'Öğretmen Atama', icon: 'school' },
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

function DeleteConfirmDialog({ target, confirming, onConfirm, onCancel }) {
  if (!target) return null;

  return (
    <ConfirmDialog
      open
      title={target.title}
      confirmLabel="Sil"
      confirming={confirming}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="app-dialog__lead">{target.message}</p>
    </ConfirmDialog>
  );
}

function OverviewTab({ stats, linksCount, school, schoolId, onBrandingSaved, atlasSchedule, onFeaturesSaved }) {
  const [homeworkSaving, setHomeworkSaving] = useState(false);
  const [homeworkError, setHomeworkError] = useState(null);
  const [accountingSaving, setAccountingSaving] = useState(false);
  const [accountingError, setAccountingError] = useState(null);
  const homeworkTracking = hasHomeworkTracking(school);
  const accountingEnabled = hasAccounting(school);

  async function toggleHomework(next) {
    setHomeworkSaving(true);
    setHomeworkError(null);
    try {
      await saveSchoolFeature(supabase, schoolId, school?.features, { homework_tracking: next });
      await onFeaturesSaved?.();
    } catch (saveError) {
      setHomeworkError(saveError);
    } finally {
      setHomeworkSaving(false);
    }
  }

  async function toggleAccounting(next) {
    setAccountingSaving(true);
    setAccountingError(null);
    try {
      await saveSchoolFeature(supabase, schoolId, school?.features, { accounting: next });
      await onFeaturesSaved?.();
    } catch (saveError) {
      setAccountingError(saveError);
    } finally {
      setAccountingSaving(false);
    }
  }

  return (
    <section className="director-panel">
      <div className="stat-grid">
        <StatCard icon="backpack" label="Toplam Öğrenci" value={stats.students} variant="sky" />
        <StatCard icon="users" label="Aktif Veli" value={stats.activeParents} variant="mint" />
        <StatCard icon="teacher" label="Kayıtlı Öğretmen" value={stats.teachers} variant="peach" />
        <StatCard icon="link" label="Veli–Öğrenci Eşleşmesi" value={linksCount} variant="lavender" />
      </div>
      <div className="staff-overview-grid">
        <SchoolBrandingPanel school={school} schoolId={schoolId} onSaved={onBrandingSaved} />
        {atlasSchedule ? <DirectorAssessmentTypes schoolId={schoolId} /> : null}
        <div className="dash-card director-overview-note">
          <h2 className="dash-section-title">Ödev takibi</h2>
          <p className="dash-hint">
            Kaynak kitap kataloğu, ödev atama ve veli sonuç girişi. Açıldığında Kitaplar sekmesi ve
            öğretmen/veli Ödev sekmeleri görünür.
          </p>
          {homeworkError ? <InlineError error={homeworkError} /> : null}
          <label className="exam-demo-toggle">
            <input
              type="checkbox"
              checked={homeworkTracking}
              disabled={homeworkSaving}
              onChange={(event) => toggleHomework(event.target.checked)}
            />
            <span>
              <strong>Ödev / kaynak takibini aç</strong>
            </span>
          </label>
        </div>
        <div className="dash-card director-overview-note">
          <h2 className="dash-section-title">Muhasebe</h2>
          <p className="dash-hint">
            Veli ödeme takibi — aylık tutar, dönem ve vade. Açıldığında{' '}
            <strong>Muhasebe</strong> sekmesi görünür.
          </p>
          {accountingError ? <InlineError error={accountingError} /> : null}
          <label className="exam-demo-toggle">
            <input
              type="checkbox"
              checked={accountingEnabled}
              disabled={accountingSaving}
              onChange={(event) => toggleAccounting(event.target.checked)}
            />
            <span>
              <strong>Muhasebe modülünü aç</strong>
            </span>
          </label>
        </div>
        <div className="dash-card director-overview-note">
          <h2 className="dash-section-title">Okul özeti</h2>
          <p className="dash-hint">
            Öğrenci, veli ve öğretmen hesaplarını ilgili yönetim sekmelerinden
            oluşturabilirsiniz. Sınıf duyuruları <strong>Duyurular</strong> altındadır.
          </p>
        </div>
      </div>
    </section>
  );
}

function CredentialsModal({ credentials, onClose }) {
  if (!credentials) return null;

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  }

  return (
    <div className="app-dialog" role="presentation" onClick={onClose}>
      <div
        className="app-dialog__panel"
        role="dialog"
        aria-labelledby="credentials-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="credentials-title" className="app-dialog__title">
          Giriş bilgileri
        </h2>
        <p className="dash-hint">
          {credentials.full_name} için giriş bilgileri kaydedildi. İlgili yönetim listesinden tekrar
          görüntüleyebilirsiniz.
        </p>
        <dl className="credentials-list">
          <div className="credentials-row">
            <dt>Kullanıcı adı</dt>
            <dd>
              <code>{credentials.username}</code>
              <button type="button" className="demo-btn demo-btn--ghost" onClick={() => copyValue(credentials.username)}>
                Kopyala
              </button>
            </dd>
          </div>
          <div className="credentials-row">
            <dt>PIN</dt>
            <dd>
              <code>{credentials.pin}</code>
              <button type="button" className="demo-btn demo-btn--ghost" onClick={() => copyValue(credentials.pin)}>
                Kopyala
              </button>
            </dd>
          </div>
        </dl>
        <button type="button" className="auth-submit" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}

function matchesPersonSearch(query, ...fields) {
  const normalized = query.trim().toLocaleLowerCase('tr');
  if (!normalized) return true;
  return fields.some((field) =>
    String(field ?? '')
      .toLocaleLowerCase('tr')
      .includes(normalized)
  );
}

function RosterSearchInput({ value, onChange, placeholder, disabled }) {
  return (
    <input
      className="dash-input manage-list-search"
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={placeholder}
    />
  );
}

function UserCredentialsRow({ username, loginPin }) {
  const [revealed, setRevealed] = useState(false);

  if (!username) {
    return <span className="manage-list__meta">Kullanıcı adı yok</span>;
  }

  return (
    <div className="user-credentials">
      <div className="user-credentials__row">
        <span className="user-credentials__label">Kullanıcı adı</span>
        <code className="user-credentials__value">{username}</code>
      </div>
      <div className="user-credentials__row">
        <span className="user-credentials__label">PIN</span>
        {loginPin ? (
          <div className="user-credentials__pin">
            <code className="user-credentials__value">{revealed ? loginPin : '••••••'}</code>
            <button
              type="button"
              className="demo-btn demo-btn--ghost"
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? 'Gizle' : 'Göster'}
            </button>
          </div>
        ) : (
          <span className="dash-hint">Kayıtlı değil — PIN sıfırlayın</span>
        )}
      </div>
    </div>
  );
}

function AddCounselorModal({ open, onClose, onCreate, loading, error }) {
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    if (open) setFullName('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="app-dialog" role="presentation" onClick={onClose}>
      <div
        className="app-dialog__panel"
        role="dialog"
        aria-labelledby="counselor-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="counselor-prompt-title" className="app-dialog__title">
          Rehberlikçi atanmadı
        </h2>
        <p className="dash-hint">
          Sınav takibi ve öğrenci rehberliği için okula bir rehberlikçi hesabı ekleyin. Giriş
          bilgileri oluşturulduktan sonra bu bölümden görüntülenebilir.
        </p>
        <form
          className="dash-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await onCreate({ full_name: fullName.trim() });
            if (ok) onClose();
          }}
        >
          <label className="dash-label">
            Rehberlikçi Ad Soyad
            <input
              className="dash-input"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Rehberlikçi adı soyadı"
              required
              disabled={loading}
              autoComplete="name"
            />
          </label>
          {error && <InlineError error={error} context="general" />}
          <div className="app-dialog__actions">
            <button type="button" className="demo-btn demo-btn--ghost" onClick={onClose} disabled={loading}>
              Daha sonra
            </button>
            <SendButton
              sending={loading}
              disabled={!fullName.trim()}
              label="Rehberlikçi Oluştur"
              sendingLabel="Oluşturuluyor…"
            />
          </div>
        </form>
      </div>
    </div>
  );
}

function CounselorStaffSection({
  counselors,
  staffActionLoading,
  onCreateCounselor,
  onResetPin,
  onRequestDelete,
}) {
  const [fullName, setFullName] = useState('');

  return (
    <div className="dash-card staff-counselor-card">
      <div className="staff-counselor-card__header">
        <h2 className="dash-section-title">Rehberlikçi</h2>
        <span className="staff-counselor-card__badge">Rehberlik</span>
      </div>
      <p className="dash-hint">
        Okul genelinde sınav ve öğrenci takibi için rehberlikçi hesabı. Öğretmen listesinden ayrı
        yönetilir.
      </p>

      {counselors.length === 0 ? (
        <form
          className="dash-form staff-counselor-card__form"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await onCreateCounselor({ full_name: fullName.trim() });
            if (ok) setFullName('');
          }}
        >
          <label className="dash-label">
            Ad Soyad
            <input
              className="dash-input"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Rehberlikçi adı soyadı"
              required
              disabled={staffActionLoading}
              autoComplete="name"
            />
          </label>
          <SendButton
            sending={staffActionLoading}
            disabled={!fullName.trim()}
            label="Rehberlikçi Oluştur"
            sendingLabel="Oluşturuluyor…"
          />
        </form>
      ) : (
        <ul className="manage-list staff-counselor-list">
          {counselors.map((counselor) => (
            <li key={counselor.id} className="manage-list__item staff-counselor-list__item">
              <div className="manage-list__main">
                <strong>{counselor.full_name ?? counselor.username}</strong>
                <UserCredentialsRow username={counselor.username} loginPin={counselor.login_pin} />
              </div>
              <button
                type="button"
                className="demo-btn"
                onClick={() => onResetPin(counselor)}
                disabled={staffActionLoading}
              >
                PIN Sıfırla
              </button>
              <button
                type="button"
                className="match-item__remove"
                onClick={() => onRequestDelete(counselor, 'counselor')}
                disabled={staffActionLoading}
              >
                Sil
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeacherManagementTab({
  counselors,
  teachers,
  subjects,
  atlasSchedule,
  loading,
  loadError,
  staffActionLoading,
  staffError,
  staffSuccess,
  onCreateCounselor,
  onCreateTeacher,
  onResetPin,
  onRequestDelete,
  onSavePhone,
  onSaveSubject,
  onRefresh,
}) {
  const [fullName, setFullName] = useState('');
  const [subjectSlug, setSubjectSlug] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [counselorPromptOpen, setCounselorPromptOpen] = useState(false);
  const [counselorPromptDismissed, setCounselorPromptDismissed] = useState(false);

  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) =>
      matchesPersonSearch(searchQuery, teacher.full_name, teacher.username)
    );
  }, [teachers, searchQuery]);

  useEffect(() => {
    if (counselors.length > 0) {
      setCounselorPromptDismissed(false);
      setCounselorPromptOpen(false);
      return;
    }
    if (!loading && !counselorPromptDismissed) {
      setCounselorPromptOpen(true);
    }
  }, [counselors.length, loading, counselorPromptDismissed]);

  if (loading) return <TabLoading message="Yükleniyor…" />;
  if (loadError) return <TabError error={loadError} onRetry={onRefresh} />;

  return (
    <section className="director-panel director-panel--simple">
      <AddCounselorModal
        open={counselorPromptOpen}
        onClose={() => {
          setCounselorPromptOpen(false);
          setCounselorPromptDismissed(true);
        }}
        onCreate={onCreateCounselor}
        loading={staffActionLoading}
        error={staffError}
      />

      {staffError && !counselorPromptOpen && <InlineError error={staffError} context="general" />}
      {staffSuccess && <SuccessMessage message={staffSuccess} />}

      <CounselorStaffSection
        counselors={counselors}
        staffActionLoading={staffActionLoading}
        onCreateCounselor={onCreateCounselor}
        onResetPin={onResetPin}
        onRequestDelete={onRequestDelete}
      />

      <div className="staff-teachers-divider" aria-hidden="true">
        <span>Öğretmenler</span>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Yeni öğretmen</h2>
        <form
          className="dash-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await onCreateTeacher({
              full_name: fullName.trim(),
              subject_slug: subjectSlug,
            });
            if (ok) {
              setFullName('');
              setSubjectSlug('');
            }
          }}
        >
          <label className="dash-label">
            Ad Soyad
            <input
              className="dash-input"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Öğretmen adı soyadı"
              required
              disabled={staffActionLoading}
            />
          </label>
          <label className="dash-label">
            Branş
            <select
              className="dash-input"
              value={subjectSlug}
              onChange={(event) => setSubjectSlug(event.target.value)}
              required
              disabled={staffActionLoading}
            >
              <option value="">Branş seçin…</option>
              {CURRICULUM_SUBJECT_DEFS.map((subject) => (
                <option key={subject.slug} value={subject.slug}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <SendButton
            sending={staffActionLoading}
            disabled={!fullName.trim() || !subjectSlug}
            label="Öğretmen Oluştur"
            sendingLabel="Oluşturuluyor…"
          />
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">
          Öğretmenler
          {searchQuery.trim()
            ? ` (${filteredTeachers.length}/${teachers.length})`
            : ` (${teachers.length})`}
        </h2>
        {teachers.length === 0 ? (
          <p className="dash-hint">Henüz öğretmen yok.</p>
        ) : (
          <>
            <RosterSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Öğretmen ara…"
              disabled={staffActionLoading}
            />
            {filteredTeachers.length === 0 ? (
              <p className="dash-hint">Aramanızla eşleşen öğretmen yok.</p>
            ) : (
          <ul className="manage-list">
            {filteredTeachers.map((teacher) => (
              <li key={teacher.id} className="manage-list__item">
                <div className="manage-list__main">
                  <strong>{teacher.full_name ?? teacher.username}</strong>
                  <UserCredentialsRow username={teacher.username} loginPin={teacher.login_pin} />
                </div>
                <StaffTeacherPhoneField
                  teacher={teacher}
                  disabled={staffActionLoading}
                  onSave={onSavePhone}
                />
                <StaffTeacherSubjectField
                  teacher={teacher}
                  disabled={staffActionLoading}
                  onSave={onSaveSubject}
                />
                <button
                  type="button"
                  className="demo-btn"
                  onClick={() => onResetPin(teacher)}
                  disabled={staffActionLoading}
                >
                  PIN Sıfırla
                </button>
                <button
                  type="button"
                  className="match-item__remove"
                  onClick={() => onRequestDelete(teacher, 'teacher')}
                  disabled={staffActionLoading}
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ParentManagementTab({
  parents,
  students,
  links,
  loading,
  loadError,
  staffActionLoading,
  staffError,
  staffSuccess,
  onCreateParent,
  onResetPin,
  onRequestDelete,
  onRefresh,
}) {
  const [fullName, setFullName] = useState('');
  const [studentIds, setStudentIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const studentById = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students]
  );

  const filteredParents = useMemo(() => {
    return parents.filter((parent) => {
      const children = links
        .filter((link) => link.parent_id === parent.id)
        .map((link) => studentById[link.student_id]?.full_name)
        .filter(Boolean);
      return matchesPersonSearch(
        searchQuery,
        parent.full_name,
        parent.username,
        children.join(' ')
      );
    });
  }, [parents, links, studentById, searchQuery]);

  function toggleStudent(id) {
    setStudentIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  if (loading) return <TabLoading message="Yükleniyor…" />;
  if (loadError) return <TabError error={loadError} onRetry={onRefresh} />;

  return (
    <section className="director-panel director-panel--simple">
      {staffError && <InlineError error={staffError} context="general" />}
      {staffSuccess && <SuccessMessage message={staffSuccess} />}

      <div className="dash-card">
        <h2 className="dash-section-title">Yeni veli</h2>
        <form
          className="dash-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await onCreateParent({ full_name: fullName.trim(), student_ids: studentIds });
            if (ok) {
              setFullName('');
              setStudentIds([]);
            }
          }}
        >
          <label className="dash-label">
            Ad Soyad
            <input
              className="dash-input"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Veli adı soyadı"
              required
              disabled={staffActionLoading}
              autoComplete="name"
            />
          </label>
          <div className="dash-label">
            Çocuklar
            {students.length === 0 ? (
              <p className="dash-hint">Önce Öğrenci Yönetimi sekmesinden öğrenci ekleyin.</p>
            ) : (
              <ul className="student-picker-list" role="list">
                {students.map((student) => (
                  <li key={student.id} role="listitem">
                    <label className="student-picker-item">
                      <input
                        type="checkbox"
                        checked={studentIds.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        disabled={staffActionLoading}
                      />
                      <span>{student.full_name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SendButton
            sending={staffActionLoading}
            disabled={!fullName.trim() || studentIds.length === 0}
            label="Veli Oluştur"
            sendingLabel="Oluşturuluyor…"
          />
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">
          Veliler
          {searchQuery.trim() ? ` (${filteredParents.length}/${parents.length})` : ` (${parents.length})`}
        </h2>
        {parents.length === 0 ? (
          <p className="dash-hint">Henüz veli yok.</p>
        ) : (
          <>
            <RosterSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Veli ara…"
              disabled={staffActionLoading}
            />
            {filteredParents.length === 0 ? (
              <p className="dash-hint">Aramanızla eşleşen veli yok.</p>
            ) : (
              <ul className="manage-list">
                {filteredParents.map((parent) => {
              const children = links
                .filter((link) => link.parent_id === parent.id)
                .map((link) => studentById[link.student_id]?.full_name)
                .filter(Boolean);
              return (
                <li key={parent.id} className="manage-list__item">
                  <div className="manage-list__main">
                    <strong>{parent.full_name ?? parent.username}</strong>
                    <UserCredentialsRow username={parent.username} loginPin={parent.login_pin} />
                    {children.length ? (
                      <span className="manage-list__meta">Çocuklar: {children.join(', ')}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => onResetPin(parent)}
                    disabled={staffActionLoading}
                  >
                    PIN Sıfırla
                  </button>
                  <button
                    type="button"
                    className="match-item__remove"
                    onClick={() => onRequestDelete(parent, 'parent')}
                    disabled={staffActionLoading}
                  >
                    Sil
                  </button>
                </li>
              );
            })}
              </ul>
            )}
          </>
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

function StaffTeacherSubjectField({ teacher, disabled, onSave }) {
  const [subjectSlug, setSubjectSlug] = useState(teacher.subject_slug ?? '');

  useEffect(() => {
    setSubjectSlug(teacher.subject_slug ?? '');
  }, [teacher.subject_slug]);

  return (
    <form
      className="staff-teacher-item__subject"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(teacher, subjectSlug || null);
      }}
    >
      <select
        className="dash-input"
        value={subjectSlug}
        onChange={(event) => setSubjectSlug(event.target.value)}
        disabled={disabled}
        aria-label={`${teacher.full_name ?? 'Öğretmen'} branşı`}
      >
        <option value="">Branş seçin…</option>
        {CURRICULUM_SUBJECT_DEFS.map((subject) => (
          <option key={subject.slug} value={subject.slug}>
            {subject.name}
          </option>
        ))}
      </select>
      <button type="submit" className="director-btn-secondary" disabled={disabled}>
        Kaydet
      </button>
    </form>
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

function StudentManagementTab({ students, classes, schoolId, onRefresh }) {
  const [fullName, setFullName] = useState('');
  const [classId, setClassId] = useState('');
  const [branchGrade, setBranchGrade] = useState('5');
  const [branchName, setBranchName] = useState('A');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingClassId, setDeletingClassId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [updatingClassId, setUpdatingClassId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const classNameById = useMemo(
    () =>
      Object.fromEntries(classes.map((klass) => [klass.id, formatClassLabel(klass.grade, klass.name)])),
    [classes]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((student) =>
      matchesPersonSearch(
        searchQuery,
        student.full_name,
        student.class_id ? classNameById[student.class_id] : ''
      )
    );
  }, [students, searchQuery, classNameById]);

  async function handleCreateBranch(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = branchName.trim().toLocaleUpperCase('tr');
    if (!trimmed) {
      setError('Şube adı zorunludur (ör. A).');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('classes').insert({
      school_id: schoolId,
      grade: Number(branchGrade),
      name: trimmed,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setSuccess(`${branchGrade}-${trimmed} şubesi eklendi.`);
    await onRefresh();
  }

  async function handleDeleteBranch(klass) {
    setDeletingClassId(klass.id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await withSchoolFilter(
      supabase.from('classes').delete().eq('id', klass.id),
      schoolId
    );
    setDeletingClassId(null);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    setSuccess(`${formatClassLabel(klass.grade, klass.name)} silindi.`);
    await onRefresh();
  }

  function requestDeleteBranch(klass) {
    const label = formatClassLabel(klass.grade, klass.name);
    setDeleteTarget({
      title: 'Şube silinsin mi?',
      message: `${label} şubesini silmek istediğinize emin misiniz? Şubedeki öğrenciler şubesiz kalır.`,
      onConfirm: () => handleDeleteBranch(klass),
    });
  }

  async function confirmDeleteTarget() {
    if (!deleteTarget?.onConfirm) return;
    setDeleteConfirming(true);
    try {
      await deleteTarget.onConfirm();
      setDeleteTarget(null);
    } finally {
      setDeleteConfirming(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Öğrenci adı soyadı zorunludur.');
      return;
    }

    if (!classId) {
      setError('Öğrenci için bir şube seçin.');
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from('students').insert({
      full_name: trimmedName,
      class_id: classId,
      school_id: schoolId,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setFullName('');
    setClassId('');
    setSuccess('Öğrenci başarıyla eklendi.');
    await onRefresh();
  }

  async function handleDeleteStudent(student) {
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

  function requestDeleteStudent(student) {
    setDeleteTarget({
      title: 'Öğrenci silinsin mi?',
      message: `${student.full_name} kaydını silmek istediğinize emin misiniz? Yoklama, sınav ve veli bağlantıları da kaldırılır. Bu işlem geri alınamaz.`,
      onConfirm: () => handleDeleteStudent(student),
    });
  }

  async function handleClassChange(student, nextClassId) {
    setUpdatingClassId(student.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await withSchoolFilter(
      supabase
        .from('students')
        .update({ class_id: nextClassId || null })
        .eq('id', student.id),
      schoolId
    );

    setUpdatingClassId(null);

    if (updateError) {
      setError(updateError);
      return;
    }

    await onRefresh();
  }

  return (
    <section className="director-panel director-panel--simple">
      <DeleteConfirmDialog
        target={deleteTarget}
        confirming={deleteConfirming}
        onConfirm={confirmDeleteTarget}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="dash-card">
        <h2 className="dash-section-title">Şubeler</h2>
        <p className="dash-hint">
          Öğrencileri 5-A, 6-B gibi şubelere yerleştirin. Yoklama, ödev ve müfredat şube
          atamasına göre çalışır.
        </p>

        <form className="dash-form cur-inline-form" onSubmit={handleCreateBranch}>
          <label className="dash-label">
            Sınıf
            <select
              className="dash-input"
              value={branchGrade}
              onChange={(event) => setBranchGrade(event.target.value)}
              disabled={saving}
            >
              {STUDENT_GRADES.map((value) => (
                <option key={value} value={value}>
                  {value}. sınıf
                </option>
              ))}
            </select>
          </label>
          <label className="dash-label">
            Şube
            <input
              className="dash-input"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="A"
              maxLength={8}
              disabled={saving}
              required
            />
          </label>
          <SendButton sending={saving} label="Şube ekle" sendingLabel="Ekleniyor…" />
        </form>

        {classes.length === 0 ? (
          <p className="dash-hint">Henüz şube yok. Önce 5-A gibi bir şube ekleyin.</p>
        ) : (
          <ul className="assignment-chip-list cur-class-list">
            {classes.map((klass) => (
              <li key={klass.id} className="assignment-chip">
                {formatClassLabel(klass.grade, klass.name)}
                <button
                  type="button"
                  className="cur-chip-remove"
                  onClick={() => requestDeleteBranch(klass)}
                  disabled={deletingClassId === klass.id}
                >
                  {deletingClassId === klass.id ? '…' : 'Sil'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <InlineError error={error} context="general" />}
      {success && <SuccessMessage message={success} />}

      <div className="dash-card">
        <h2 className="dash-section-title">Yeni öğrenci</h2>

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
            Şube
            <select
              className="dash-input"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={saving || classes.length === 0}
              required
            >
              <option value="">
                {classes.length === 0 ? 'Önce şube oluşturun' : 'Şube seçin'}
              </option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {formatClassLabel(klass.grade, klass.name)}
                </option>
              ))}
            </select>
          </label>

          <SendButton
            sending={saving}
            label="Öğrenci Ekle"
            sendingLabel="Ekleniyor…"
            disabled={!classId}
          />
        </form>
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">
          Öğrenciler
          {searchQuery.trim() ? ` (${filteredStudents.length}/${students.length})` : ` (${students.length})`}
        </h2>
        {students.length === 0 ? (
          <p className="dash-hint">Henüz kayıtlı öğrenci yok.</p>
        ) : classes.length === 0 ? (
          <p className="dash-hint">Öğrencileri şubeye atamak için önce şube oluşturun.</p>
        ) : (
          <>
            <RosterSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Öğrenci ara…"
              disabled={saving}
            />
            {filteredStudents.length === 0 ? (
              <p className="dash-hint">Aramanızla eşleşen öğrenci yok.</p>
            ) : (
              <ul className="match-list student-roster-list">
                {filteredStudents.map((student) => (
              <li key={student.id} className="match-item student-roster-item">
                <div className="student-roster-item__meta">
                  <span className="match-item__names">{student.full_name}</span>
                  {student.class_id ? (
                    <span className="student-roster-item__grade">
                      {classNameById[student.class_id] ?? formatStudentGrade(student.grade)}
                    </span>
                  ) : (
                    <span className="dash-hint">Şube atanmadı</span>
                  )}
                  <select
                    className="dash-input"
                    value={student.class_id ?? ''}
                    onChange={(event) => handleClassChange(student, event.target.value)}
                    disabled={updatingClassId === student.id || saving}
                    aria-label={`${student.full_name} şubesi`}
                  >
                    <option value="">Şube yok</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {formatClassLabel(klass.grade, klass.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="match-item__remove"
                  onClick={() => requestDeleteStudent(student)}
                  disabled={deletingId === student.id || saving}
                >
                  {deletingId === student.id ? 'Siliniyor…' : 'Sil'}
                </button>
              </li>
            ))}
              </ul>
            )}
          </>
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
  const [counselors, setCounselors] = useState([]);
  const [classes, setClasses] = useState([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [curriculumAssignments, setCurriculumAssignments] = useState([]);
  const [links, setLinks] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [templateSuccess, setTemplateSuccess] = useState(null);

  const [auditMessages, setAuditMessages] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  const [staffActionLoading, setStaffActionLoading] = useState(false);
  const [staffError, setStaffError] = useState(null);
  const [staffSuccess, setStaffSuccess] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [staffDeleteTarget, setStaffDeleteTarget] = useState(null);
  const [staffDeleteConfirming, setStaffDeleteConfirming] = useState(false);

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

    const [parentsRes, studentsRes, teachersRes, counselorsRes, linksRes, templatesRes] =
      await Promise.all([
      withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email, username, login_pin')
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
          .select('id, full_name, email, username, login_pin, phone, subject_id, subject_slug')
          .eq('role', USER_ROLES.teacher)
          .order('full_name'),
        schoolId
      ),
      withSchoolFilter(
        supabase
          .from('profiles')
          .select('id, full_name, email, username, login_pin')
          .eq('role', USER_ROLES.counselor)
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
      counselorsRes.error ??
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
    setCounselors(counselorsRes.data ?? []);
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

  async function handleCreateStaffUser(payload) {
    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    try {
      const result = await createStaffUser(payload);
      setCredentials(result);
      setStaffSuccess(`${result.full_name} için hesap oluşturuldu.`);
      await loadData();
      return true;
    } catch (error) {
      setStaffError(error);
      return false;
    } finally {
      setStaffActionLoading(false);
    }
  }

  async function handleCreateParent(payload) {
    return handleCreateStaffUser({ ...payload, role: 'parent' });
  }

  async function handleCreateTeacher(payload) {
    return handleCreateStaffUser({ ...payload, role: 'teacher' });
  }

  async function handleCreateCounselor(payload) {
    return handleCreateStaffUser({ ...payload, role: 'counselor' });
  }

  async function handleResetPin(user) {
    const label = user.full_name ?? user.username ?? 'Kullanıcı';
    if (!window.confirm(`${label} için yeni PIN oluşturulsun mu?`)) return;

    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    try {
      const result = await resetStaffPin(user.id);
      setCredentials(result);
      setStaffSuccess(`${label} için yeni PIN oluşturuldu.`);
      await loadData();
    } catch (error) {
      setStaffError(error);
    } finally {
      setStaffActionLoading(false);
    }
  }

  function requestStaffDelete(user, role) {
    const label = user.full_name ?? user.username ?? 'Kullanıcı';
    const roleMessages = {
      parent:
        `${label} veli hesabını silmek istediğinize emin misiniz? Veli–öğrenci bağlantıları kaldırılır ve giriş yapamaz. Bu işlem geri alınamaz.`,
      teacher:
        `${label} öğretmen hesabını silmek istediğinize emin misiniz? Öğrenci atamaları ve branş kayıtları kaldırılır. Bu işlem geri alınamaz.`,
      counselor:
        `${label} rehberlikçi hesabını silmek istediğinize emin misiniz? Giriş yapamaz. Bu işlem geri alınamaz.`,
    };
    const titles = {
      parent: 'Veli silinsin mi?',
      teacher: 'Öğretmen silinsin mi?',
      counselor: 'Rehberlikçi silinsin mi?',
    };

    setStaffDeleteTarget({
      user,
      title: titles[role] ?? 'Hesap silinsin mi?',
      message: roleMessages[role] ?? `${label} hesabını silmek istediğinize emin misiniz?`,
    });
  }

  async function confirmStaffDelete() {
    if (!staffDeleteTarget?.user) return;

    setStaffDeleteConfirming(true);
    setStaffError(null);
    setStaffSuccess(null);

    try {
      const result = await deleteStaffUser(staffDeleteTarget.user.id);
      setStaffSuccess(`${result.full_name ?? result.username} silindi.`);
      setStaffDeleteTarget(null);
      await loadData();
    } catch (error) {
      setStaffError(error);
    } finally {
      setStaffDeleteConfirming(false);
    }
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
    await loadData();
  }

  async function handleSaveTeacherSubject(teacher, subjectSlug) {
    const label = teacher.full_name ?? teacher.email ?? 'Öğretmen';
    setStaffActionLoading(true);
    setStaffError(null);
    setStaffSuccess(null);

    const { error } = await withSchoolFilter(
      supabase
        .from('profiles')
        .update({ subject_slug: subjectSlug, subject_id: null })
        .eq('id', teacher.id),
      schoolId
    );

    if (error && /subject_slug|schema cache/i.test(error.message ?? '')) {
      const { data: subject } = await supabase
        .from('curriculum_subjects')
        .select('id')
        .eq('slug', subjectSlug)
        .eq('grade', 5)
        .maybeSingle();

      const { error: fallbackError } = await withSchoolFilter(
        supabase.from('profiles').update({ subject_id: subject?.id ?? null }).eq('id', teacher.id),
        schoolId
      );

      if (fallbackError) {
        setStaffActionLoading(false);
        setStaffError(fallbackError);
        return;
      }
    } else if (error) {
      setStaffActionLoading(false);
      setStaffError(error);
      return;
    }

    setStaffActionLoading(false);

    const subjectLabel = CURRICULUM_SUBJECT_DEFS.find((row) => row.slug === subjectSlug);
    setStaffSuccess(
      subjectLabel
        ? `${label} branşı ${subjectLabel.name} olarak kaydedildi.`
        : `${label} branş ataması kaldırıldı.`
    );
    await loadData();
  }

  const directorTabs = useMemo(() => {
    let tabs = TABS;
    if (hasAtlasSchedule(school)) {
      tabs = tabs.filter((tab) => tab.id !== 'assignment');
    }
    if (!hasHomeworkTracking(school)) {
      tabs = tabs.filter((tab) => tab.id !== 'homework');
    }
    if (hasAccounting(school)) {
      tabs = [...tabs, { id: 'accounting', label: 'Muhasebe', icon: 'chart' }];
    }
    return tabs;
  }, [school]);

  if (profile?.role !== USER_ROLES.director) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
        <LoadingPanel message="Müdür paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
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
    <StaffShell
      tabs={directorTabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      schoolName={schoolName}
      logoUrl={navLogoUrl}
      userName={displayName}
      roleLabel="Müdür"
      onSignOut={onSignOut}
    >
      <AppNavbar schoolName={schoolName} roleLabel="Müdür" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />

      <main className="dash-page dash-page--director">
        <div className="director-layout">
          <header className="dash-header staff-role-hero">
            <h1 className="dash-title">Müdür</h1>
            <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
          </header>

          <nav className="director-tabs" aria-label="Müdür paneli sekmeleri">
            <div className="director-tabs__track">
              {directorTabs.map((tab) => (
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

          <AnimatedView viewKey={activeTab}>
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              linksCount={links.length}
              school={school}
              schoolId={schoolId}
              onBrandingSaved={refreshSchool}
              onFeaturesSaved={refreshSchool}
              atlasSchedule={hasAtlasSchedule(school)}
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
            <ExamOperationsPanel
              schoolId={schoolId}
              school={school}
              students={students}
              classes={classes}
              showManualEntry
              showCreateMock
            />
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

        {activeTab === 'homework' && hasHomeworkTracking(school) && (
          <section className="director-panel">
            <DirectorHomework schoolId={schoolId} classes={classes} students={students} />
          </section>
        )}

        {activeTab === 'attendance' && <DirectorAttendance schoolId={schoolId} />}

        {activeTab === 'student-mgmt' && (
          <StudentManagementTab
            students={students}
            classes={classes}
            schoolId={schoolId}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'parents' && (
          <ParentManagementTab
            parents={parents}
            students={students}
            links={links}
            loading={loading}
            loadError={loadError}
            staffActionLoading={staffActionLoading}
            staffError={staffError}
            staffSuccess={staffSuccess}
            onCreateParent={handleCreateParent}
            onResetPin={handleResetPin}
            onRequestDelete={requestStaffDelete}
            onRefresh={loadData}
          />
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
          <TeacherManagementTab
            counselors={counselors}
            teachers={teachers}
            subjects={curriculumSubjects}
            atlasSchedule={hasAtlasSchedule(school)}
            loading={loading}
            loadError={loadError}
            staffActionLoading={staffActionLoading}
            staffError={staffError}
            staffSuccess={staffSuccess}
            onCreateCounselor={handleCreateCounselor}
            onCreateTeacher={handleCreateTeacher}
            onResetPin={handleResetPin}
            onRequestDelete={requestStaffDelete}
            onSavePhone={handleSaveTeacherPhone}
            onSaveSubject={handleSaveTeacherSubject}
            onRefresh={loadData}
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

        {activeTab === 'accounting' && hasAccounting(school) && (
          <DirectorAccounting schoolId={schoolId} />
        )}
          </AnimatedView>
        </div>
      </main>
      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
      <DeleteConfirmDialog
        target={staffDeleteTarget}
        confirming={staffDeleteConfirming}
        onConfirm={confirmStaffDelete}
        onCancel={() => setStaffDeleteTarget(null)}
      />
    </StaffShell>
  );
}
