import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { USER_ROLES, formatRoleLabel } from '../../lib/roles';
import { useAuth } from '../../context/AuthContext';
import { useActiveRole } from '../../context/ActiveRoleContext';
import { useStaffHeader } from '../../hooks/useStaffHeader';
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
import CurriculumAssignmentPanel from '../../components/curriculum/CurriculumAssignmentPanel';
import ExamOperationsPanel from '../../components/exams/ExamOperationsPanel';
import SchoolBrandingPanel from '../../components/branding/SchoolBrandingPanel';
import { hasAtlasSchedule, hasAccounting, saveSchoolFeature } from '../../lib/schoolFeatures';
import DirectorAccounting from '../../components/accounting/DirectorAccounting';
import { DemoBottomNav, getTabFromSearch } from '../../components/demo/DemoKit';
import DirectorCommunicationsTab from '../../components/director/DirectorCommunicationsTab';
import DirectorRecordsTab from '../../components/director/DirectorRecordsTab';
import DirectorSubNav from '../../components/director/DirectorSubNav';
import {
  MANAGEMENT_TAB_IDS,
  RECORDS_TAB_IDS,
  buildDirectorBottomNav,
  buildDirectorNav,
  getDefaultTabForTopLevel,
  getManagementSubNavItems,
  resolveActiveLabel,
  resolveTopLevelTab,
} from '../../lib/directorNav';
import { STUDENT_GRADES, formatStudentGrade, istanbulDateIso } from '../../lib/calendar';
import { setupBillingForNewStudent } from '../../lib/tuitionBilling';
import { Icon, TEMPLATE_ICON_NAMES, resolveIconName } from '../../components/ui/Icon';
import { AnimatedView } from '../../components/ui/AnimatedView';
import StaffShell from '../../components/layout/StaffShell';
import {
  formatClassLabel,
  loadCurriculumCatalog,
  loadSchoolAssignments,
  loadSchoolClasses,
} from '../../lib/curriculum';
import { createStaffUser, deleteStaffUser, resetStaffPin, addStaffRole, removeStaffRole } from '../../lib/staffUsers';
import { loadSchoolProfilesByRole } from '../../lib/staffQueries';
import { normalizeProfileRoles, isFullDirector, isAssistantDirector, profileHasRole } from '../../lib/profileRoles';
import { AsyncActionDialog } from '../../components/ui/AsyncActionDialog';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { recordSchoolActivity } from '../../lib/activityLog';

const TEMPLATE_ICONS = TEMPLATE_ICON_NAMES;
const EMPTY_TEMPLATE = { title: '', body: '', icon: 'mail' };

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

function OverviewTab({ stats, linksCount, school, schoolId, onFeaturesSaved }) {
  const [accountingSaving, setAccountingSaving] = useState(false);
  const [accountingError, setAccountingError] = useState(null);
  const accountingEnabled = hasAccounting(school);

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
      <SchoolBrandingPanel school={school} />

      <div className="director-module-section">
        <h2 className="dash-section-title">Modüller</h2>
        <p className="dash-hint">Okul özelliklerini açıp kapatabilirsiniz.</p>
      </div>
      <div className="director-module-grid">
        <div className="dash-card director-module-card director-overview-note">
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
        <div className="dash-card director-module-card director-overview-note">
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

function StaffRoleBadges({ member }) {
  const roles = normalizeProfileRoles(member).filter((role) => role !== USER_ROLES.parent);
  if (!roles.length) return null;

  return (
    <div className="staff-role-badges">
      {roles.map((role) => (
        <span key={role} className={`staff-role-badge staff-role-badge--${role}`}>
          {formatRoleLabel(role)}
        </span>
      ))}
    </div>
  );
}

function StaffRoleControls({
  member,
  currentUserId,
  loading,
  onAddRole,
  onRemoveRole,
  canManageRoles = true,
}) {
  const roles = normalizeProfileRoles(member);
  const isSelf = member.id === currentUserId;
  const hasDirector = roles.includes(USER_ROLES.director);
  const hasCounselor = roles.includes(USER_ROLES.counselor);

  return (
    <div className="staff-role-controls">
      <StaffRoleBadges member={member} />
      {isAssistantDirector(member) ? (
        <p className="staff-teachers-split__subtitle">Asıl rol: Öğretmen</p>
      ) : null}
      {canManageRoles ? (
        <div className="staff-role-controls__actions">
          {!hasDirector ? (
            <button
              type="button"
              className="demo-btn demo-btn--compact"
              onClick={() => onAddRole(member, USER_ROLES.director)}
              disabled={loading}
            >
              Müdür yap
            </button>
          ) : !isSelf ? (
            <button
              type="button"
              className="demo-btn demo-btn--compact demo-btn--muted"
              onClick={() => onRemoveRole(member, USER_ROLES.director)}
              disabled={loading}
            >
              Müdür yetkisini kaldır
            </button>
          ) : null}
          {!hasCounselor ? (
            <button
              type="button"
              className="demo-btn demo-btn--compact"
              onClick={() => onAddRole(member, USER_ROLES.counselor)}
              disabled={loading}
            >
              Rehberlik ekle
            </button>
          ) : (
            <button
              type="button"
              className="demo-btn demo-btn--compact demo-btn--muted"
              onClick={() => onRemoveRole(member, USER_ROLES.counselor)}
              disabled={loading}
            >
              Rehberlik kaldır
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CounselorStaffSection({
  counselors,
  currentUserId,
  staffActionLoading,
  onCreateCounselor,
  onResetPin,
  onRequestDelete,
  onAddRole,
  onRemoveRole,
  canManageRoles = true,
  canDeleteStaff = true,
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
            const ok = await onCreateCounselor({ full_name: fullName.trim() }, () => setFullName(''));
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
                <StaffRoleControls
                  member={counselor}
                  currentUserId={currentUserId}
                  loading={staffActionLoading}
                  onAddRole={onAddRole}
                  onRemoveRole={onRemoveRole}
                  canManageRoles={canManageRoles}
                />
              </div>
              {!normalizeProfileRoles(counselor).includes(USER_ROLES.director) ? (
                <button
                  type="button"
                  className="demo-btn"
                  onClick={() => onResetPin(counselor)}
                  disabled={staffActionLoading}
                >
                  PIN Sıfırla
                </button>
              ) : null}
              {canDeleteStaff && !normalizeProfileRoles(counselor).includes(USER_ROLES.director) ? (
                <button
                  type="button"
                  className="match-item__remove"
                  onClick={() => onRequestDelete(counselor, 'counselor')}
                  disabled={staffActionLoading}
                >
                  Sil
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelfTeacherRoleCard({ profile, loading, onAddTeacherRole }) {
  const { hasRole } = useActiveRole();
  const [subjectSlug, setSubjectSlug] = useState('');

  if (!hasRole(USER_ROLES.director) || hasRole(USER_ROLES.teacher)) {
    return null;
  }

  return (
    <div className="dash-card staff-self-teacher-card">
      <h2 className="dash-section-title">Ben de ders veriyorum</h2>
      <p className="dash-muted">
        Müdür hesabınıza öğretmen rolü ekleyerek öğretmen paneline geçebilirsiniz.
      </p>
      <form
        className="dash-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!subjectSlug) return;
          await onAddTeacherRole(
            {
              user_id: profile.id,
              role: 'teacher',
              subject_slug: subjectSlug,
            },
            () => setSubjectSlug('')
          );
        }}
      >
        <label className="dash-label">
          Branş
          <select
            className="dash-input"
            value={subjectSlug}
            onChange={(event) => setSubjectSlug(event.target.value)}
            required
            disabled={loading}
          >
            <option value="">Seçin…</option>
            {CURRICULUM_SUBJECT_DEFS.map((subject) => (
              <option key={subject.slug} value={subject.slug}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <SendButton
          sending={loading}
          disabled={!subjectSlug}
          label="Öğretmen rolü ekle"
          sendingLabel="Ekleniyor…"
        />
      </form>
    </div>
  );
}

function TeacherRosterItem({
  teacher,
  profile,
  staffActionLoading,
  canManageRoles,
  canDeleteStaff,
  onAddRole,
  onRemoveRole,
  onResetPin,
  onRequestDelete,
  onSavePhone,
  onSaveSubject,
}) {
  return (
    <li key={teacher.id} className="manage-list__item">
      <div className="manage-list__main">
        <strong>{teacher.full_name ?? teacher.username}</strong>
        <UserCredentialsRow username={teacher.username} loginPin={teacher.login_pin} />
        <StaffRoleControls
          member={teacher}
          currentUserId={profile?.id}
          loading={staffActionLoading}
          onAddRole={onAddRole}
          onRemoveRole={onRemoveRole}
          canManageRoles={canManageRoles}
        />
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
      {!normalizeProfileRoles(teacher).includes(USER_ROLES.director) ? (
        <button
          type="button"
          className="demo-btn"
          onClick={() => onResetPin(teacher)}
          disabled={staffActionLoading}
        >
          PIN Sıfırla
        </button>
      ) : null}
      {canDeleteStaff && !normalizeProfileRoles(teacher).includes(USER_ROLES.director) ? (
        <button
          type="button"
          className="match-item__remove"
          onClick={() => onRequestDelete(teacher, 'teacher')}
          disabled={staffActionLoading}
        >
          Sil
        </button>
      ) : null}
    </li>
  );
}

function TeacherManagementTab({
  profile,
  counselors,
  teachers,
  subjects,
  atlasSchedule,
  loading,
  loadError,
  staffActionLoading,
  staffError,
  staffSuccess,
  canManageRoles = true,
  canDeleteStaff = true,
  onCreateCounselor,
  onCreateTeacher,
  onAddTeacherRole,
  onAddRole,
  onRemoveRole,
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

  const { pureTeachers, assistantDirectors } = useMemo(() => {
    const pure = [];
    const assistants = [];
    for (const teacher of filteredTeachers) {
      const roles = normalizeProfileRoles(teacher);
      if (roles.includes(USER_ROLES.director)) {
        assistants.push(teacher);
      } else {
        pure.push(teacher);
      }
    }
    return { pureTeachers: pure, assistantDirectors: assistants };
  }, [filteredTeachers]);

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

      <SelfTeacherRoleCard
        profile={profile}
        loading={staffActionLoading}
        onAddTeacherRole={onAddTeacherRole}
      />

      <CounselorStaffSection
        counselors={counselors}
        currentUserId={profile?.id}
        staffActionLoading={staffActionLoading}
        onCreateCounselor={onCreateCounselor}
        onResetPin={onResetPin}
        onRequestDelete={onRequestDelete}
        onAddRole={onAddRole}
        onRemoveRole={onRemoveRole}
        canManageRoles={canManageRoles}
        canDeleteStaff={canDeleteStaff}
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
            await onCreateTeacher(
              {
                full_name: fullName.trim(),
                subject_slug: subjectSlug,
              },
              () => {
                setFullName('');
                setSubjectSlug('');
              }
            );
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

      <div className="staff-teachers-split">
        <div className="dash-card">
          <h2 className="dash-section-title">
            Öğretmenler
            {searchQuery.trim()
              ? ` (${pureTeachers.length}/${teachers.filter((t) => !normalizeProfileRoles(t).includes(USER_ROLES.director)).length})`
              : ` (${teachers.filter((t) => !normalizeProfileRoles(t).includes(USER_ROLES.director)).length})`}
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
              ) : pureTeachers.length === 0 ? (
                <p className="dash-hint">Aramanızla eşleşen saf öğretmen yok.</p>
              ) : (
                <ul className="manage-list">
                  {pureTeachers.map((teacher) => (
                    <TeacherRosterItem
                      key={teacher.id}
                      teacher={teacher}
                      profile={profile}
                      staffActionLoading={staffActionLoading}
                      canManageRoles={canManageRoles}
                      canDeleteStaff={canDeleteStaff}
                      onAddRole={onAddRole}
                      onRemoveRole={onRemoveRole}
                      onResetPin={onResetPin}
                      onRequestDelete={onRequestDelete}
                      onSavePhone={onSavePhone}
                      onSaveSubject={onSaveSubject}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {assistantDirectors.length > 0 ? (
          <div className="dash-card">
            <h2 className="dash-section-title">Müdür yetkili öğretmenler ({assistantDirectors.length})</h2>
            <p className="staff-teachers-split__subtitle">
              Öğretmen olarak başlayıp müdür yetkisi verilen personel. Asıl rolleri öğretmendir.
            </p>
            <ul className="manage-list">
              {assistantDirectors.map((teacher) => (
                <TeacherRosterItem
                  key={teacher.id}
                  teacher={teacher}
                  profile={profile}
                  staffActionLoading={staffActionLoading}
                  canManageRoles={canManageRoles}
                  canDeleteStaff={canDeleteStaff}
                  onAddRole={onAddRole}
                  onRemoveRole={onRemoveRole}
                  onResetPin={onResetPin}
                  onRequestDelete={onRequestDelete}
                  onSavePhone={onSavePhone}
                  onSaveSubject={onSaveSubject}
                />
              ))}
            </ul>
          </div>
        ) : null}
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
  canDeleteStaff = true,
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
            const ok = await onCreateParent(
              { full_name: fullName.trim(), student_ids: studentIds },
              () => {
                setFullName('');
                setStudentIds([]);
              }
            );
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
                  {canDeleteStaff ? (
                    <button
                      type="button"
                      className="match-item__remove"
                      onClick={() => onRequestDelete(parent, 'parent')}
                      disabled={staffActionLoading}
                    >
                      Sil
                    </button>
                  ) : null}
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

function StudentManagementTab({
  students,
  classes,
  schoolId,
  profile,
  onRefresh,
  canDeleteStaff = true,
  runAsyncAction,
  accountingEnabled = false,
}) {
  const today = istanbulDateIso();
  const [fullName, setFullName] = useState('');
  const [classId, setClassId] = useState('');
  const [branchGrade, setBranchGrade] = useState('5');
  const [branchName, setBranchName] = useState('A');
  const [billingStartDate, setBillingStartDate] = useState(today);
  const [billingMonthlyAmount, setBillingMonthlyAmount] = useState('');
  const [saving, setSaving] = useState(false);
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

    if (!runAsyncAction) return;

    const branchLabel = `${branchGrade}-${trimmed}`;

    await runAsyncAction({
      title: 'Şube oluştur',
      message: `${branchLabel} şubesi oluşturulsun mu?`,
      confirmLabel: 'Oluştur',
      loadingLabel: 'Şube oluşturuluyor…',
      successMessage: `${branchLabel} şubesi eklendi.`,
      runFn: async () => {
        const { error: insertError } = await supabase.from('classes').insert({
          school_id: schoolId,
          grade: Number(branchGrade),
          name: trimmed,
        });
        if (insertError) throw insertError;
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'student',
          action: 'created',
          summary: `Şube oluşturuldu: ${branchLabel}`,
        });
        setBranchName('A');
        await onRefresh();
      },
    });
  }

  function requestDeleteBranch(klass) {
    const label = formatClassLabel(klass.grade, klass.name);
    if (!runAsyncAction) return;

    runAsyncAction({
      title: 'Şube silinsin mi?',
      message: `${label} şubesini silmek istediğinize emin misiniz? Şubedeki öğrenciler şubesiz kalır.`,
      confirmLabel: 'Sil',
      loadingLabel: 'Siliniyor…',
      successMessage: `${label} silindi.`,
      runFn: async () => {
        const { error: deleteError } = await withSchoolFilter(
          supabase.from('classes').delete().eq('id', klass.id),
          schoolId
        );
        if (deleteError) throw deleteError;
      },
      onSuccess: () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'student',
          action: 'deleted',
          summary: `Şube silindi: ${label}`,
        });
        onRefresh();
      },
    });
  }

  function requestDeleteStudent(student) {
    if (!runAsyncAction) return;

    runAsyncAction({
      title: 'Öğrenci silinsin mi?',
      message: `${student.full_name} kaydını silmek istediğinize emin misiniz? Yoklama, sınav ve veli bağlantıları da kaldırılır. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      loadingLabel: 'Siliniyor…',
      successMessage: `${student.full_name} listeden kaldırıldı.`,
      runFn: async () => {
        const { error: deleteError } = await withSchoolFilter(
          supabase.from('students').delete().eq('id', student.id),
          schoolId
        );
        if (deleteError) throw deleteError;
      },
      onSuccess: () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'student',
          action: 'deleted',
          summary: `Öğrenci silindi: ${student.full_name}`,
          targetType: 'student',
          targetId: student.id,
        });
        onRefresh();
      },
    });
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

    if (!runAsyncAction) return;

    const billingAmount = billingMonthlyAmount.trim();
    const billingStart = billingStartDate || today;

    await runAsyncAction({
      title: 'Öğrenci oluştur',
      message: `${trimmedName} okula eklensin mi?${
        accountingEnabled && billingAmount ? ' Ödeme planı da kaydedilecek.' : ''
      }`,
      confirmLabel: 'Oluştur',
      loadingLabel: 'Öğrenci ekleniyor…',
      successMessage: `${trimmedName} başarıyla eklendi.${
        accountingEnabled && billingAmount ? ' Ödeme planı Muhasebe sekmesinde görünür.' : ''
      }`,
      runFn: async () => {
        const { data: student, error: insertError } = await supabase
          .from('students')
          .insert({
            full_name: trimmedName,
            class_id: classId,
            school_id: schoolId,
          })
          .select('id')
          .single();
        if (insertError) throw insertError;

        if (accountingEnabled && billingAmount) {
          await setupBillingForNewStudent(
            schoolId,
            {
              studentId: student.id,
              monthlyAmount: billingAmount,
              billingStartDate: billingStart,
            },
            today
          );
        }
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'student',
          action: 'created',
          summary: `Öğrenci eklendi: ${trimmedName}`,
        });
        setFullName('');
        setClassId('');
        setBillingMonthlyAmount('');
        setBillingStartDate(today);
        await onRefresh();
      },
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

    recordSchoolActivity(supabase, profile, {
      schoolId,
      category: 'student',
      action: 'updated',
      summary: `Öğrenci şubesi güncellendi: ${student.full_name} → ${
        classNameById[nextClassId] ?? '—'
      }`,
      targetType: 'student',
      targetId: student.id,
    });

    await onRefresh();
  }

  return (
    <section className="director-panel director-panel--simple">
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
            {classes.map((klass) => {
              const label = formatClassLabel(klass.grade, klass.name);
              return (
                <li key={klass.id} className="assignment-chip cur-class-chip">
                  <span className="cur-class-chip__label">{label}</span>
                  {canDeleteStaff ? (
                    <button
                      type="button"
                      className="cur-chip-remove"
                      onClick={() => requestDeleteBranch(klass)}
                      aria-label={`${label} şubesini sil`}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  ) : null}
                </li>
              );
            })}
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

          {accountingEnabled ? (
            <details className="student-billing-fields">
              <summary className="student-billing-fields__summary">Ödeme planı (isteğe bağlı)</summary>
              <div className="student-billing-fields__body">
                <p className="dash-hint">
                  Kayıt tarihi ve aylık tutarı şimdi girebilirsiniz; boş bırakırsanız Muhasebe sekmesinden
                  sonra ekleyebilirsiniz.
                </p>
                <label className="dash-label">
                  Kayıt tarihi
                  <input
                    className="dash-input"
                    type="date"
                    value={billingStartDate}
                    onChange={(event) => setBillingStartDate(event.target.value)}
                    disabled={saving}
                  />
                </label>
                <label className="dash-label">
                  Aylık tutar (₺)
                  <input
                    className="dash-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={billingMonthlyAmount}
                    onChange={(event) => setBillingMonthlyAmount(event.target.value)}
                    placeholder="Boş bırakılabilir"
                    disabled={saving}
                  />
                </label>
              </div>
            </details>
          ) : null}

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
                {canDeleteStaff ? (
                  <button
                    type="button"
                    className="match-item__remove"
                    onClick={() => requestDeleteStudent(student)}
                    disabled={saving}
                  >
                    Sil
                  </button>
                ) : null}
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
  const { school, refreshSchool, refreshProfile } = useAuth();
  const { hasRole } = useActiveRole();
  const { roleLabel, roleSwitcher } = useStaffHeader();
  const isDirector = hasRole(USER_ROLES.director);
  const fullDirector = isFullDirector(profile);
  const { asyncAction, closeAsyncAction, runAsyncAction } = useAsyncAction();
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

  const [staffActionLoading, setStaffActionLoading] = useState(false);
  const [staffError, setStaffError] = useState(null);
  const [staffSuccess, setStaffSuccess] = useState(null);

  const displayName = profile?.full_name ?? profile?.email ?? 'Müdür';
  const navLogoUrl = school?.logo_url ?? null;
  const schoolName = school?.name ?? 'OkulTakip';

  const navProps = useMemo(
    () => ({
      schoolName,
      roleLabel,
      roleSwitcher,
      logoUrl: navLogoUrl,
      userName: displayName,
      onSignOut,
    }),
    [schoolName, roleLabel, roleSwitcher, navLogoUrl, displayName, onSignOut]
  );

  const stats = useMemo(() => {
    const activeParentIds = new Set(links.map((link) => link.parent_id));
    return {
      students: students.length,
      activeParents: activeParentIds.size,
      teachers: teachers.length,
    };
  }, [students.length, teachers.length, links]);

  const classStudentCounts = useMemo(() => {
    const counts = {};
    for (const student of students) {
      if (!student.class_id) continue;
      counts[student.class_id] = (counts[student.class_id] ?? 0) + 1;
    }
    return counts;
  }, [students]);

  const refreshCurriculumAssignments = useCallback(async () => {
    if (!schoolId) return;
    try {
      const assignments = await loadSchoolAssignments(schoolId);
      setCurriculumAssignments(assignments);
    } catch {
      setCurriculumAssignments([]);
    }
  }, [schoolId]);

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
      loadSchoolProfilesByRole({
        supabase,
        schoolId,
        role: USER_ROLES.teacher,
        select: 'id, full_name, email, username, login_pin, phone, subject_id, subject_slug, primary_role',
      }),
      loadSchoolProfilesByRole({
        supabase,
        schoolId,
        role: USER_ROLES.counselor,
        select: 'id, full_name, email, username, login_pin, primary_role',
      }),
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

  useEffect(() => {
    if (!isDirector) return;

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
  }, [isDirector, loadData]);

  async function handleCreateTeacher(payload, onFormReset) {
    const name = payload.full_name?.trim();
    if (!name || !payload.subject_slug) return false;

    await runAsyncAction({
      title: 'Öğretmen oluştur',
      message: `${name} için öğretmen hesabı oluşturulsun mu?`,
      confirmLabel: 'Oluştur',
      loadingLabel: 'Öğretmen oluşturuluyor…',
      successMessage: (result) => `${result.full_name} başarıyla oluşturuldu.`,
      getCredentials: (result) => ({ username: result.username, pin: result.pin }),
      runFn: () => createStaffUser({ ...payload, role: 'teacher' }),
      onSuccess: async () => {
        await loadData();
        onFormReset?.();
      },
    });
    return true;
  }

  async function handleCreateCounselor(payload, onFormReset) {
    const name = payload.full_name?.trim();
    if (!name) return false;

    await runAsyncAction({
      title: 'Rehberlikçi oluştur',
      message: `${name} için rehberlikçi hesabı oluşturulsun mu?`,
      confirmLabel: 'Oluştur',
      loadingLabel: 'Rehberlikçi oluşturuluyor…',
      successMessage: (result) => `${result.full_name} başarıyla oluşturuldu.`,
      getCredentials: (result) => ({ username: result.username, pin: result.pin }),
      runFn: () => createStaffUser({ ...payload, role: 'counselor' }),
      onSuccess: async () => {
        await loadData();
        onFormReset?.();
      },
    });
    return true;
  }

  async function handleCreateParent(payload, onFormReset) {
    const name = payload.full_name?.trim();
    if (!name) return false;

    await runAsyncAction({
      title: 'Veli oluştur',
      message: `${name} için veli hesabı oluşturulsun mu?`,
      confirmLabel: 'Oluştur',
      loadingLabel: 'Veli oluşturuluyor…',
      successMessage: (result) => `${result.full_name} başarıyla oluşturuldu.`,
      getCredentials: (result) => ({ username: result.username, pin: result.pin }),
      runFn: () => createStaffUser({ ...payload, role: 'parent' }),
      onSuccess: async () => {
        await loadData();
        onFormReset?.();
      },
    });
    return true;
  }

  async function handleAddStaffRole(member, role, extra = {}) {
    const label = member.full_name ?? member.username ?? 'Kullanıcı';
    const roleName = formatRoleLabel(role);

    await runAsyncAction({
      title: `${roleName} rolü ver`,
      message: `${label} kullanıcısına ${roleName} rolü verilsin mi?`,
      confirmLabel: role === USER_ROLES.director ? 'Müdür yap' : 'Onayla',
      loadingLabel:
        role === USER_ROLES.director ? 'Müdür yapılıyor…' : `${roleName} ekleniyor…`,
      successMessage: `${label} artık ${roleName} rolüne sahip.`,
      runFn: () => addStaffRole({ user_id: member.id, role, ...extra }),
      onSuccess: async () => {
        if (member.id === profile.id) {
          await refreshProfile();
        }
        await loadData();
      },
    });
  }

  async function handleRemoveStaffRole(member, role) {
    const label = member.full_name ?? member.username ?? 'Kullanıcı';
    const roleName = formatRoleLabel(role);

    await runAsyncAction({
      title: `${roleName} rolünü kaldır`,
      message: `${label} kullanıcısından ${roleName} rolü kaldırılsın mı?`,
      confirmLabel: 'Kaldır',
      loadingLabel: `${roleName} kaldırılıyor…`,
      successMessage: `${label} kullanıcısından ${roleName} rolü kaldırıldı.`,
      runFn: () => removeStaffRole({ user_id: member.id, role }),
      onSuccess: async () => {
        if (member.id === profile.id) {
          await refreshProfile();
        }
        await loadData();
      },
    });
  }

  async function handleAddTeacherRole(payload, onFormReset) {
    await runAsyncAction({
      title: 'Öğretmen rolü ekle',
      message: 'Hesabınıza öğretmen rolü eklensin mi? Branş atamanız korunur.',
      confirmLabel: 'Ekle',
      loadingLabel: 'Öğretmen rolü ekleniyor…',
      successMessage:
        'Öğretmen rolü eklendi. Profil menüsünden öğretmen paneline geçebilirsiniz.',
      runFn: () => addStaffRole(payload),
      onSuccess: async () => {
        await refreshProfile();
        await loadData();
        onFormReset?.();
      },
    });
    return true;
  }

  async function handleResetPin(user) {
    const label = user.full_name ?? user.username ?? 'Kullanıcı';

    await runAsyncAction({
      title: 'PIN sıfırla',
      message: `${label} için yeni PIN oluşturulsun mu?`,
      confirmLabel: 'PIN Sıfırla',
      loadingLabel: 'PIN oluşturuluyor…',
      successMessage: () => `${label} için yeni PIN oluşturuldu.`,
      getCredentials: (result) => ({ username: result.username, pin: result.pin }),
      runFn: () => resetStaffPin(user.id),
      onSuccess: () => loadData(),
    });
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

    runAsyncAction({
      title: titles[role] ?? 'Hesap silinsin mi?',
      message: roleMessages[role] ?? `${label} hesabını silmek istediğinize emin misiniz?`,
      confirmLabel: 'Sil',
      loadingLabel: 'Siliniyor…',
      successMessage: (result) => `${result.full_name ?? result.username ?? label} silindi.`,
      runFn: () => deleteStaffUser(user.id),
      onSuccess: () => loadData(),
    });
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

    const payload = {
      title: templateForm.title.trim(),
      body: templateForm.body.trim(),
      icon: resolveIconName(templateForm.icon || 'mail'),
      school_id: schoolId,
    };

    const isEdit = Boolean(editingTemplateId);

    await runAsyncAction({
      title: isEdit ? 'Şablonu kaydet' : 'Şablon oluştur',
      message: isEdit
        ? 'Şablon değişiklikleri kaydedilsin mi?'
        : 'Yeni mesaj şablonu oluşturulsun mu?',
      confirmLabel: isEdit ? 'Kaydet' : 'Oluştur',
      loadingLabel: isEdit ? 'Kaydediliyor…' : 'Şablon oluşturuluyor…',
      successMessage: isEdit ? 'Şablon güncellendi.' : 'Yeni şablon oluşturuldu.',
      runFn: async () => {
        const { error } = isEdit
          ? await withSchoolFilter(
              supabase.from('message_templates').update(payload).eq('id', editingTemplateId),
              schoolId
            )
          : await supabase.from('message_templates').insert(payload);
        if (error) throw error;
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'staff',
          action: isEdit ? 'updated' : 'created',
          summary: isEdit
            ? `Mesaj şablonu güncellendi: ${payload.title}`
            : `Mesaj şablonu oluşturuldu: ${payload.title}`,
        });
        setEditingTemplateId(null);
        setTemplateForm(EMPTY_TEMPLATE);
        setTemplateError(null);
        await loadData();
      },
    });
  }

  async function handleDeleteTemplate(templateId) {
    const template = templates.find((entry) => entry.id === templateId);
    const label = template?.title ?? 'Şablon';

    await runAsyncAction({
      title: 'Şablon silinsin mi?',
      message: `"${label}" şablonunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      loadingLabel: 'Siliniyor…',
      successMessage: 'Şablon silindi.',
      runFn: async () => {
        const { error } = await withSchoolFilter(
          supabase.from('message_templates').delete().eq('id', templateId),
          schoolId
        );
        if (error) throw error;
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'staff',
          action: 'deleted',
          summary: `Mesaj şablonu silindi: ${label}`,
        });
        if (editingTemplateId === templateId) {
          handleCancelTemplateEdit();
        }
        await loadData();
      },
    });
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

  const directorNav = useMemo(() => buildDirectorNav(school), [school]);
  const directorBottomNav = useMemo(() => buildDirectorBottomNav(school), [school]);
  const activeNavLabel = useMemo(
    () => resolveActiveLabel(directorNav, activeTab),
    [directorNav, activeTab]
  );
  const managementSubNavItems = useMemo(() => getManagementSubNavItems(school), [school]);

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
  }

  function handleBottomNavChange(topTab) {
    const currentTop = resolveTopLevelTab(activeTab);
    if (
      topTab === currentTop &&
      (topTab === 'management' || topTab === 'records' || topTab === 'communications')
    ) {
      return;
    }
    setActiveTab(getDefaultTabForTopLevel(topTab, school));
  }

  if (!isDirector) {
    return (
      <>
        <AppNavbar {...navProps} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar {...navProps} />
        <LoadingPanel message="Müdür paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar {...navProps} />
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
      tabs={directorNav}
      activeTab={activeTab}
      activeLabel={activeNavLabel}
      onTabChange={handleTabChange}
      {...navProps}
    >
      <AppNavbar {...navProps} />

      <main className="dash-page dash-page--director dash-page--flush dash-page--tabbar">
        <div className="director-layout">
          <header className="dash-header staff-role-hero">
            <h1 className="dash-title">Müdür</h1>
            <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
          </header>

          {MANAGEMENT_TAB_IDS.has(activeTab) ? (
            <DirectorSubNav
              className="director-subnav--mobile-only"
              items={managementSubNavItems}
              active={activeTab}
              onChange={handleTabChange}
            />
          ) : null}

          <AnimatedView viewKey={activeTab}>
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              linksCount={links.length}
              school={school}
              schoolId={schoolId}
              onFeaturesSaved={refreshSchool}
            />
          )}

        {(activeTab === 'announcements' || activeTab === 'templates') && (
          <DirectorCommunicationsTab
            activeTab={activeTab}
            onTabChange={handleTabChange}
            announcements={
              <section className="director-panel">
                <TeacherAnnouncements profile={profile} schoolId={schoolId} students={students} />
              </section>
            }
            templates={
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
            }
          />
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
            atlasSchedule={hasAtlasSchedule(school)}
            classCount={classes.length}
            studentCount={students.length}
            studentsInClassCount={students.filter((student) => student.class_id).length}
            curriculumAssignmentCount={curriculumAssignments.length}
            onNavigateTab={handleTabChange}
          />
        )}

        {RECORDS_TAB_IDS.has(activeTab) && (
          <DirectorRecordsTab
            activeTab={activeTab}
            onTabChange={handleTabChange}
            schoolId={schoolId}
            school={school}
            students={students}
            classes={classes}
          />
        )}

        {activeTab === 'student-mgmt' && (
          <StudentManagementTab
            students={students}
            classes={classes}
            schoolId={schoolId}
            profile={profile}
            onRefresh={loadData}
            canDeleteStaff={fullDirector}
            runAsyncAction={runAsyncAction}
            accountingEnabled={hasAccounting(school)}
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
            canDeleteStaff={fullDirector}
            onCreateParent={handleCreateParent}
            onResetPin={handleResetPin}
            onRequestDelete={requestStaffDelete}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'assignment' && (
          <section className="director-panel">
            <CurriculumAssignmentPanel
              teachers={teachers}
              classes={classes}
              subjects={curriculumSubjects}
              assignments={curriculumAssignments}
              classStudentCounts={classStudentCounts}
              atlasSchedule={hasAtlasSchedule(school)}
              onRefresh={refreshCurriculumAssignments}
              onAssigned={({ teacherName, label }) => {
                recordSchoolActivity(supabase, profile, {
                  schoolId,
                  category: 'staff',
                  action: 'assigned',
                  summary: `Öğretmen ataması: ${teacherName} · ${label}`,
                });
              }}
              onRemoved={({ teacherName, label }) => {
                recordSchoolActivity(supabase, profile, {
                  schoolId,
                  category: 'staff',
                  action: 'removed',
                  summary: `Öğretmen ataması kaldırıldı: ${teacherName} · ${label}`,
                });
              }}
            />
          </section>
        )}

        {activeTab === 'staff' && (
          <TeacherManagementTab
            profile={profile}
            counselors={counselors}
            teachers={teachers}
            subjects={curriculumSubjects}
            atlasSchedule={hasAtlasSchedule(school)}
            loading={loading}
            loadError={loadError}
            staffActionLoading={staffActionLoading}
            staffError={staffError}
            staffSuccess={staffSuccess}
            canManageRoles={fullDirector}
            canDeleteStaff={fullDirector}
            onCreateCounselor={handleCreateCounselor}
            onCreateTeacher={handleCreateTeacher}
            onAddTeacherRole={handleAddTeacherRole}
            onAddRole={handleAddStaffRole}
            onRemoveRole={handleRemoveStaffRole}
            onResetPin={handleResetPin}
            onRequestDelete={requestStaffDelete}
            onSavePhone={handleSaveTeacherPhone}
            onSaveSubject={handleSaveTeacherSubject}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'accounting' && hasAccounting(school) && (
          <DirectorAccounting schoolId={schoolId} />
        )}
          </AnimatedView>
        </div>
      </main>

      <DemoBottomNav
        tabs={directorBottomNav}
        active={resolveTopLevelTab(activeTab)}
        onChange={handleBottomNavChange}
      />

      <AsyncActionDialog
        open={Boolean(asyncAction)}
        phase={asyncAction?.phase ?? 'confirm'}
        title={asyncAction?.title}
        message={asyncAction?.message}
        confirmLabel={asyncAction?.confirmLabel}
        loadingLabel={asyncAction?.loadingLabel}
        successTitle={asyncAction?.successTitle}
        credentials={asyncAction?.credentials}
        error={asyncAction?.error}
        onConfirm={asyncAction?.onConfirm}
        onClose={closeAsyncAction}
      />
    </StaffShell>
  );
}
