import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { STUDENT_GRADES } from '../../lib/calendar';
import {
  formatClassLabel,
  loadCurriculumCatalog,
  loadSchoolClasses,
} from '../../lib/curriculum';
import {
  appendBookIndex,
  createBookGrant,
  currentAcademicYear,
  deleteBookGrant,
  deleteHomeworkBook,
  formatDateTr,
  formatGrantLabel,
  groupIndexByTopic,
  isMissingHomeworkTable,
  loadBookGrants,
  loadBookIndex,
  loadHomeworkBooks,
  loadHomeworkBundle,
  loadSchoolStudents,
  replaceBookIndex,
  saveHomeworkBook,
  uploadBookCover,
} from '../../lib/homework';
import {
  downloadHomeworkTemplate,
  groupMatchedRows,
  matchIndexToUnits,
  parseHomeworkIndexFile,
  unmatchedTopicCount,
} from '../../lib/homeworkImport';
import { buildSchoolHomeworkOverview } from '../../lib/homeworkReports';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';

const SUB_TABS = [
  { id: 'books', label: 'Kitaplar' },
  { id: 'grants', label: 'Atama' },
  { id: 'overview', label: 'Özet' },
];

const EMPTY_BOOK = {
  title: '',
  isbn: '',
  publisher: '',
  published_on: '',
  edition: '',
  grade: 5,
  subject_id: '',
};

export default function DirectorHomework({ schoolId, classes: classesProp, students: studentsProp }) {
  const { profile } = useAuth();
  const [subTab, setSubTab] = useState('books');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [books, setBooks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [classes, setClasses] = useState(classesProp ?? []);
  const [students, setStudents] = useState(studentsProp ?? []);
  const [grants, setGrants] = useState([]);
  const [overview, setOverview] = useState([]);

  const [selectedBookId, setSelectedBookId] = useState('');
  const [form, setForm] = useState(EMPTY_BOOK);
  const [coverFile, setCoverFile] = useState(null);
  const [savingBook, setSavingBook] = useState(false);
  const [deleteBookId, setDeleteBookId] = useState(null);

  const [topics, setTopics] = useState([]);
  const [tests, setTests] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [importMode, setImportMode] = useState('replace');
  const [importing, setImporting] = useState(false);

  const academicYear = currentAcademicYear();
  const [grantBookId, setGrantBookId] = useState('');
  const [grantClassId, setGrantClassId] = useState('');
  const [grantStudentId, setGrantStudentId] = useState('');
  const [grantTarget, setGrantTarget] = useState('class');
  const [savingGrant, setSavingGrant] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;
  const gradeSubjects = useMemo(
    () => subjects.filter((subject) => subject.grade === Number(form.grade)),
    [subjects, form.grade]
  );
  const bookUnits = useMemo(
    () => units.filter((unit) => unit.subject_id === selectedBook?.subject_id),
    [units, selectedBook]
  );
  const groupedIndex = useMemo(() => groupIndexByTopic(topics, tests), [topics, tests]);
  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLocaleLowerCase('tr');
    if (!query) return students;
    return students.filter((student) => student.full_name?.toLocaleLowerCase('tr').includes(query));
  }, [students, studentQuery]);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const [bookRows, catalog, classRows, studentRows, grantRows] = await Promise.all([
        loadHomeworkBooks(schoolId),
        loadCurriculumCatalog(),
        classesProp?.length ? Promise.resolve(classesProp) : loadSchoolClasses(schoolId),
        studentsProp?.length ? Promise.resolve(studentsProp) : loadSchoolStudents(schoolId),
        loadBookGrants(schoolId, academicYear),
      ]);
      setBooks(bookRows);
      setSubjects(catalog.subjects ?? []);
      setUnits(catalog.units ?? []);
      setClasses(classRows);
      setStudents(studentRows);
      setGrants(grantRows);
      setSelectedBookId((current) =>
        current && bookRows.some((book) => book.id === current) ? current : bookRows[0]?.id ?? ''
      );
      setGrantBookId((current) =>
        current && bookRows.some((book) => book.id === current) ? current : bookRows[0]?.id ?? ''
      );
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [academicYear, classesProp, schoolId, studentsProp]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedBookId) {
      setTopics([]);
      setTests([]);
      return undefined;
    }
    let cancelled = false;
    loadBookIndex(selectedBookId)
      .then((index) => {
        if (cancelled) return;
        setTopics(index.topics);
        setTests(index.tests);
      })
      .catch((indexError) => {
        if (!cancelled) setError(indexError);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  useEffect(() => {
    if (subTab !== 'overview' || !schoolId) return undefined;
    let cancelled = false;
    loadHomeworkBundle(schoolId)
      .then((bundle) => {
        if (cancelled) return;
        setOverview(
          buildSchoolHomeworkOverview({
            classes,
            assignments: bundle.assignments,
            links: bundle.links,
            testLinks: bundle.testLinks,
            results: bundle.results,
          })
        );
      })
      .catch((overviewError) => {
        if (!cancelled && !isMissingHomeworkTable(overviewError)) setError(overviewError);
      });
    return () => {
      cancelled = true;
    };
  }, [classes, schoolId, subTab]);

  function startCreate() {
    setSelectedBookId('');
    setForm({ ...EMPTY_BOOK, subject_id: gradeSubjects[0]?.id ?? '' });
    setCoverFile(null);
    setImportPreview(null);
  }

  function startEdit(book) {
    setSelectedBookId(book.id);
    setForm({
      title: book.title ?? '',
      isbn: book.isbn ?? '',
      publisher: book.publisher ?? '',
      published_on: book.published_on ?? '',
      edition: book.edition ?? '',
      grade: book.grade,
      subject_id: book.subject_id,
    });
    setCoverFile(null);
    setImportPreview(null);
  }

  async function handleSaveBook(event) {
    event.preventDefault();
    setSavingBook(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveHomeworkBook({
        id: selectedBookId || undefined,
        school_id: schoolId,
        created_by: profile?.id,
        ...form,
        grade: Number(form.grade),
        cover_url: selectedBook?.cover_url ?? null,
      });
      let coverUrl = saved.cover_url;
      if (coverFile) {
        coverUrl = await uploadBookCover(schoolId, saved.id, coverFile);
        await saveHomeworkBook({ ...saved, cover_url: coverUrl, school_id: schoolId });
      }
      setSuccess(selectedBookId ? 'Kitap güncellendi.' : 'Kitap kaydedildi.');
      setCoverFile(null);
      await refresh();
      setSelectedBookId(saved.id);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSavingBook(false);
    }
  }

  async function handleDeleteBook() {
    if (!deleteBookId) return;
    setError(null);
    try {
      await deleteHomeworkBook(deleteBookId);
      setDeleteBookId(null);
      setSuccess('Kitap silindi.');
      await refresh();
      startCreate();
    } catch (deleteError) {
      setError(deleteError);
    }
  }

  async function handleIndexFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedBook) return;
    setError(null);
    try {
      const rows = await parseHomeworkIndexFile(file);
      const matched = matchIndexToUnits(rows, bookUnits);
      setImportPreview(groupMatchedRows(matched));
    } catch (fileError) {
      setError(fileError);
    }
  }

  async function handleImportIndex() {
    if (!selectedBook || !importPreview?.length) return;
    setImporting(true);
    setError(null);
    try {
      const next =
        importMode === 'append'
          ? await appendBookIndex(selectedBook.id, importPreview, topics.length)
          : await replaceBookIndex(selectedBook.id, importPreview);
      setTopics(next.topics);
      setTests(next.tests);
      setImportPreview(null);
      setSuccess(
        importMode === 'append' ? 'İndeks eklendi.' : 'İndeks içe aktarıldı (önceki testler değiştirildi).'
      );
    } catch (importError) {
      setError(importError);
    } finally {
      setImporting(false);
    }
  }

  async function handleGrant(event) {
    event.preventDefault();
    setSavingGrant(true);
    setError(null);
    setSuccess(null);
    try {
      await createBookGrant({
        schoolId,
        bookId: grantBookId,
        academicYear,
        classId: grantTarget === 'class' ? grantClassId : null,
        studentId: grantTarget === 'student' ? grantStudentId : null,
        grantedBy: profile?.id,
      });
      setSuccess('Kitap atandı.');
      const grantRows = await loadBookGrants(schoolId, academicYear);
      setGrants(grantRows);
    } catch (grantError) {
      setError(grantError);
    } finally {
      setSavingGrant(false);
    }
  }

  async function handleDeleteGrant(grantId) {
    setError(null);
    try {
      await deleteBookGrant(grantId);
      setGrants((current) => current.filter((row) => row.id !== grantId));
    } catch (grantError) {
      setError(grantError);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Kitap kataloğu yükleniyor…</p>
      </section>
    );
  }

  return (
    <div className="homework-module demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Kitaplar</h1>
        <p className="dash-subtitle">
          Kaynak kitap kataloğu, konu/test indeksi ve şube-öğrenci ataması. Akademik yıl {academicYear}.
        </p>
      </header>

      {error && <InlineError error={error} />}
      {success && <SuccessMessage message={success} />}

      <nav className="homework-subtabs" aria-label="Kitap alt sekmeleri">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`homework-subtab${subTab === tab.id ? ' homework-subtab--active' : ''}`}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {subTab === 'books' && (
        <div className="homework-split">
          <section className="dash-card">
            <div className="homework-card-head">
              <h2 className="dash-section-title">Katalog</h2>
              <button type="button" className="demo-btn" onClick={startCreate}>
                Yeni kitap
              </button>
            </div>
            {books.length === 0 ? (
              <p className="dash-hint">Henüz kitap yok. Sağdaki formdan ekleyin.</p>
            ) : (
              <ul className="homework-book-list">
                {books.map((book) => {
                  const subject = subjects.find((row) => row.id === book.subject_id);
                  return (
                    <li key={book.id}>
                      <button
                        type="button"
                        className={`homework-book-item${book.id === selectedBookId ? ' homework-book-item--active' : ''}`}
                        onClick={() => startEdit(book)}
                      >
                        {book.cover_url ? (
                          <img src={book.cover_url} alt="" className="homework-cover" />
                        ) : (
                          <span className="homework-cover homework-cover--empty" aria-hidden>
                            <Icon name="book" size={22} />
                          </span>
                        )}
                        <span>
                          <strong>{book.title}</strong>
                          <span className="dash-hint">
                            {book.grade}. sınıf · {subject?.name ?? 'Ders'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="dash-card">
            <h2 className="dash-section-title">{selectedBookId ? 'Kitabı düzenle' : 'Yeni kitap'}</h2>
            <form className="dash-form" onSubmit={handleSaveBook}>
              <label className="dash-label">
                Kitap adı
                <input
                  className="dash-input"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  required
                />
              </label>
              <div className="homework-form-grid">
                <label className="dash-label">
                  Sınıf
                  <select
                    className="dash-input"
                    value={form.grade}
                    onChange={(event) => {
                      const grade = Number(event.target.value);
                      const nextSubjects = subjects.filter((subject) => subject.grade === grade);
                      setForm((current) => ({
                        ...current,
                        grade,
                        subject_id: nextSubjects[0]?.id ?? '',
                      }));
                    }}
                  >
                    {STUDENT_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}. sınıf
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dash-label">
                  Ders
                  <select
                    className="dash-input"
                    value={form.subject_id}
                    onChange={(event) => setForm((current) => ({ ...current, subject_id: event.target.value }))}
                    required
                  >
                    <option value="">Ders seçin…</option>
                    {gradeSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="homework-form-grid">
                <label className="dash-label">
                  ISBN
                  <input
                    className="dash-input"
                    value={form.isbn}
                    onChange={(event) => setForm((current) => ({ ...current, isbn: event.target.value }))}
                  />
                </label>
                <label className="dash-label">
                  Yayınevi
                  <input
                    className="dash-input"
                    value={form.publisher}
                    onChange={(event) => setForm((current) => ({ ...current, publisher: event.target.value }))}
                  />
                </label>
              </div>
              <div className="homework-form-grid">
                <label className="dash-label">
                  Basım tarihi
                  <input
                    className="dash-input"
                    type="date"
                    value={form.published_on}
                    onChange={(event) => setForm((current) => ({ ...current, published_on: event.target.value }))}
                  />
                </label>
                <label className="dash-label">
                  Baskı
                  <input
                    className="dash-input"
                    value={form.edition}
                    onChange={(event) => setForm((current) => ({ ...current, edition: event.target.value }))}
                  />
                </label>
              </div>
              <label className="dash-label">
                Kapak (PNG / JPEG)
                <input
                  className="dash-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <SendButton sending={savingBook} label="Kaydet" sendingLabel="Kaydediliyor…" />
              {selectedBookId ? (
                <button type="button" className="demo-btn" onClick={() => setDeleteBookId(selectedBookId)}>
                  Kitabı sil
                </button>
              ) : null}
            </form>

            {selectedBook ? (
              <div className="homework-index">
                <h3 className="dash-section-title">Konu / test indeksi</h3>
                <p className="dash-hint">
                  Excel veya CSV yükleyin. Sütunlar: topic_code, topic_name, test_no, test_name,
                  question_count. Müfredat üniteleri otomatik eşleşir.
                </p>
                <div className="homework-index-actions">
                  <button type="button" className="demo-btn" onClick={downloadHomeworkTemplate}>
                    Şablon indir
                  </button>
                  <label className="dash-label homework-file-label">
                    Dosya yükle
                    <input
                      className="dash-input"
                      type="file"
                      accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      onChange={handleIndexFile}
                    />
                  </label>
                </div>
                {importPreview ? (
                  <div className="homework-import-preview">
                    <p className="dash-hint">
                      {importPreview.length} konu, {unmatchedTopicCount(importPreview)} eşleşmedi.
                    </p>
                    <label className="dash-label">
                      Aktarım
                      <select
                        className="dash-input"
                        value={importMode}
                        onChange={(event) => setImportMode(event.target.value)}
                      >
                        <option value="replace">Mevcut indeksi değiştir</option>
                        <option value="append">Mevcut indekse ekle</option>
                      </select>
                    </label>
                    <ul className="homework-preview-list">
                      {importPreview.map((topic) => (
                        <li key={topic.topic_code}>
                          <strong>{topic.topic_name}</strong>
                          <span className="dash-hint">
                            {topic.topic_code} · {topic.tests.length} test ·{' '}
                            {topic.unit_title ?? 'eşleşmedi'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="demo-btn demo-btn--primary"
                      onClick={handleImportIndex}
                      disabled={importing}
                    >
                      {importing ? 'Aktarılıyor…' : 'İndeksi kaydet'}
                    </button>
                  </div>
                ) : groupedIndex.length === 0 ? (
                  <p className="dash-hint">Bu kitapta henüz test yok.</p>
                ) : (
                  <ul className="homework-preview-list">
                    {groupedIndex.map((topic) => (
                      <li key={topic.id}>
                        <strong>{topic.topic_name}</strong>
                        <span className="dash-hint">
                          {topic.topic_code} · {topic.tests.length} test
                          {topic.unit_id ? ' · müfredata bağlı' : ' · eşleşmedi'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {subTab === 'grants' && (
        <section className="dash-card">
          <h2 className="dash-section-title">Kitap atama</h2>
          <p className="dash-hint">
            Öğretmenler yalnızca atanan kitaplardan ödev oluşturabilir. {academicYear} yılı için şube
            veya tek öğrenci seçin.
          </p>
          {books.length === 0 ? (
            <p className="dash-hint">Önce bir kitap ekleyin.</p>
          ) : (
            <form className="dash-form" onSubmit={handleGrant}>
              <label className="dash-label">
                Kitap
                <select
                  className="dash-input"
                  value={grantBookId}
                  onChange={(event) => setGrantBookId(event.target.value)}
                  required
                >
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.grade}. sınıf · {book.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="homework-grant-toggle">
                <label>
                  <input
                    type="radio"
                    name="grant-target"
                    checked={grantTarget === 'class'}
                    onChange={() => setGrantTarget('class')}
                  />
                  Şube
                </label>
                <label>
                  <input
                    type="radio"
                    name="grant-target"
                    checked={grantTarget === 'student'}
                    onChange={() => setGrantTarget('student')}
                  />
                  Öğrenci
                </label>
              </div>
              {grantTarget === 'class' ? (
                <label className="dash-label">
                  Şube
                  <select
                    className="dash-input"
                    value={grantClassId}
                    onChange={(event) => setGrantClassId(event.target.value)}
                    required
                  >
                    <option value="">Şube seçin…</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {formatClassLabel(klass.grade, klass.name)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="dash-label">
                    Öğrenci ara
                    <input
                      className="dash-input"
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                    />
                  </label>
                  <label className="dash-label">
                    Öğrenci
                    <select
                      className="dash-input"
                      value={grantStudentId}
                      onChange={(event) => setGrantStudentId(event.target.value)}
                      required
                    >
                      <option value="">Öğrenci seçin…</option>
                      {filteredStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <SendButton sending={savingGrant} label="Ata" sendingLabel="Atanıyor…" />
            </form>
          )}

          <ul className="homework-preview-list">
            {grants.map((grant) => (
              <li key={grant.id} className="homework-grant-row">
                <span>{formatGrantLabel(grant, { classes, students, books })}</span>
                <button type="button" className="demo-btn" onClick={() => handleDeleteGrant(grant.id)}>
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {subTab === 'overview' && (
        <section className="dash-card">
          <h2 className="dash-section-title">Şube tamamlama</h2>
          {overview.length === 0 ? (
            <p className="dash-hint">Henüz ödev verisi yok.</p>
          ) : (
            <ul className="homework-preview-list">
              {overview.map((row) => (
                <li key={row.klass.id}>
                  <strong>{formatClassLabel(row.klass.grade, row.klass.name)}</strong>
                  <span className="dash-hint">
                    {row.assignmentCount} ödev · {row.studentCount} öğrenci ·{' '}
                    {row.percent == null ? 'veri yok' : `%${row.percent} tamamlandı`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteBookId)}
        title="Kitabı sil"
        confirmLabel="Sil"
        onConfirm={handleDeleteBook}
        onCancel={() => setDeleteBookId(null)}
      >
        Bu kitabı, indeksini ve atamalarını silmek istediğinize emin misiniz? Var olan ödevler
        silinemez; önce onları kaldırmanız gerekir.
      </ConfirmDialog>
    </div>
  );
}
