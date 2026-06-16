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
  { id: 'matching', label: 'Eşleştirme Merkezi', icon: '🤝' },
  { id: 'templates', label: 'Şablon Sihirbazı', icon: '✨' },
];

const TEMPLATE_ICONS = ['💌', '🍽️', '🌙', '🚗', '💚', '🎒', '🏫', '✨', '🌸', '📢', '🍼', '☀️'];

const EMPTY_TEMPLATE = { title: '', body: '', icon: '💌' };

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
          Veli ve öğrenci eşleştirmelerini <strong>Eşleştirme Merkezi</strong> sekmesinden
          yönetebilir, mesaj şablonlarını <strong>Şablon Sihirbazı</strong> ile düzenleyebilirsiniz.
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
