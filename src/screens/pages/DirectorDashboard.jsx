import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { USER_ROLES } from '../../lib/roles';
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
  { id: 'audit', label: 'Mesaj Trafiği', icon: '📋' },
  { id: 'staff', label: 'Öğretmen Yönetimi', icon: '👩‍🏫' },
  { id: 'matching', label: 'Eşleştirme', icon: '🤝' },
  { id: 'templates', label: 'Şablonlar', icon: '✨' },
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

function AccessDenied({ onSignOut }) {
  return (
    <main className="dash-page dash-error-page">
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
          Veli eşleştirmelerini <strong>Eşleştirme</strong>, şablonları{' '}
          <strong>Şablonlar</strong>, bugünkü mesajları <strong>Mesaj Trafiği</strong> sekmesinden
          takip edebilirsiniz.
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

export default function DirectorDashboard({ profile, onSignOut }) {
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

  const displayName = profile?.full_name ?? profile?.email ?? 'Müdür';

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
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', USER_ROLES.parent)
        .order('full_name'),
      supabase.from('students').select('id, full_name').order('full_name'),
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', USER_ROLES.teacher)
        .order('full_name'),
      supabase.from('student_parents').select('student_id, parent_id'),
      supabase
        .from('message_templates')
        .select('id, title, body, icon, created_at')
        .order('title'),
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

    setParents(parentsRes.data ?? []);
    setStudents(studentsRes.data ?? []);
    setTeachers(teachersRes.data ?? []);
    setLinks(linksRes.data ?? []);
    setTemplates(templatesRes.data ?? []);
  }, []);

  const loadTodayMessages = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_AUDIT_SELECT)
        .gte('created_at', getStartOfTodayIso())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAuditMessages(data ?? []);
    } catch (error) {
      setAuditError(error);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const refreshTeachers = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setTeachersLoading(true);
    setTeachersError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', USER_ROLES.teacher)
        .order('full_name');

      if (error) throw error;
      setTeachers(data ?? []);
    } catch (error) {
      setTeachersError(error);
    } finally {
      if (showLoading) setTeachersLoading(false);
    }
  }, []);

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
    };

    const { error } = editingTemplateId
      ? await supabase.from('message_templates').update(payload).eq('id', editingTemplateId)
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

    const { error } = await supabase.from('message_templates').delete().eq('id', templateId);

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

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .or(`email.ilike.%${safeTerm}%,full_name.ilike.%${safeTerm}%`)
      .order('full_name')
      .limit(15);

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

    const { error } = await supabase
      .from('profiles')
      .update({ role: USER_ROLES.teacher })
      .eq('id', user.id);

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

    const { error } = await supabase
      .from('profiles')
      .update({ role: USER_ROLES.parent })
      .eq('id', teacher.id);

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
        <AppNavbar brand="Başak Akademi — Müdür" onSignOut={onSignOut} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar brand="Başak Akademi — Müdür" onSignOut={onSignOut} />
        <LoadingPanel message="Müdür paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar brand="Başak Akademi — Müdür" onSignOut={onSignOut} />
        <main className="dash-page dash-error-page">
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
      <AppNavbar brand="Başak Akademi — Müdür" onSignOut={onSignOut} />

      <main className="dash-page dash-page--director">
        <header className="dash-header">
          <h1 className="dash-title">Müdür Paneli</h1>
          <p className="dash-subtitle">Hoş geldiniz, {displayName}.</p>
        </header>

        <nav className="director-tabs" aria-label="Müdür paneli sekmeleri">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`director-tab${activeTab === tab.id ? ' director-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && <OverviewTab stats={stats} linksCount={links.length} />}

        {activeTab === 'audit' && (
          <MessageAuditTab
            messages={auditMessages}
            loading={auditLoading}
            error={auditError}
            onRefresh={loadTodayMessages}
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
      </main>
    </>
  );
}
