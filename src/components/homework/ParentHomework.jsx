import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso } from '../../lib/calendar';
import {
  assignmentWindowStatus,
  canEnterResults,
  formatDateTr,
  groupIndexByTopic,
  loadHomeworkBundle,
  studentAssignmentStatus,
  upsertHomeworkResults,
} from '../../lib/homework';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';

function emptyCounts() {
  return { correct: '', wrong: '', blank: '' };
}

function parseCount(value) {
  if (value === '' || value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function remainder(entry, questionCount) {
  return questionCount - parseCount(entry.correct) - parseCount(entry.wrong) - parseCount(entry.blank);
}

export function ParentHomeworkStrip({ students, schoolId, onOpen }) {
  const studentIds = useMemo(() => students.map((row) => row.id), [students]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!schoolId || !studentIds.length) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    loadHomeworkBundle(schoolId, { studentIds })
      .then((bundle) => {
        if (cancelled) return;
        const today = istanbulDateIso();
        const next = [];
        students.forEach((student) => {
          bundle.assignments.forEach((assignment) => {
            const linked = bundle.links.some(
              (link) => link.assignment_id === assignment.id && link.student_id === student.id
            );
            if (!linked) return;
            const status = studentAssignmentStatus({
              assignment,
              studentId: student.id,
              testLinks: bundle.testLinks,
              results: bundle.results,
              today,
            });
            if (status.key === 'done') return;
            if (status.key === 'upcoming') return;
            next.push({
              id: `${assignment.id}-${student.id}`,
              studentName: student.full_name,
              dueOn: assignment.due_on,
              overdue: status.key === 'overdue',
              bookTitle: bundle.books.find((book) => book.id === assignment.book_id)?.title ?? 'Ödev',
            });
          });
        });
        next.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
        setItems(next.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, studentIds, students]);

  if (!items.length) return null;

  return (
    <section className="dash-card homework-home-strip">
      <div className="homework-card-head">
        <h2 className="dash-section-title">Ödevler</h2>
        <button type="button" className="demo-btn" onClick={onOpen}>
          Tümünü gör
        </button>
      </div>
      <ul className="homework-preview-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.bookTitle}</strong>
            <span className="dash-hint">
              {item.studentName} · {item.overdue ? 'gecikmiş' : `son ${formatDateTr(item.dueOn)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ParentHomework({ students, schoolId }) {
  const studentIds = useMemo(() => students.map((row) => row.id), [students]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [bundle, setBundle] = useState({
    assignments: [],
    links: [],
    testLinks: [],
    results: [],
    tests: [],
    topics: [],
    books: [],
  });
  const [activeId, setActiveId] = useState(null);
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const today = istanbulDateIso();

  const refresh = useCallback(async () => {
    if (!schoolId || !studentIds.length) {
      setBundle({
        assignments: [],
        links: [],
        testLinks: [],
        results: [],
        tests: [],
        topics: [],
        books: [],
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadHomeworkBundle(schoolId, { studentIds });
      setBundle(next);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, studentIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cards = useMemo(() => {
    const list = [];
    students.forEach((student) => {
      bundle.assignments.forEach((assignment) => {
        const linked = bundle.links.some(
          (link) => link.assignment_id === assignment.id && link.student_id === student.id
        );
        if (!linked) return;
        const status = studentAssignmentStatus({
          assignment,
          studentId: student.id,
          testLinks: bundle.testLinks,
          results: bundle.results,
          today,
        });
        list.push({ student, assignment, status });
      });
    });
    const rank = { overdue: 0, open: 1, progress: 1, upcoming: 2, done: 3 };
    return list.sort((a, b) => {
      const byStatus = (rank[a.status.key] ?? 9) - (rank[b.status.key] ?? 9);
      if (byStatus !== 0) return byStatus;
      return a.assignment.due_on.localeCompare(b.assignment.due_on);
    });
  }, [bundle, students, today]);

  const active = cards.find((card) => `${card.assignment.id}-${card.student.id}` === activeId) ?? null;

  const activeTests = useMemo(() => {
    if (!active) return [];
    const testIds = bundle.testLinks
      .filter((row) => row.assignment_id === active.assignment.id)
      .map((row) => row.book_test_id);
    const tests = bundle.tests.filter((test) => testIds.includes(test.id));
    const topics = bundle.topics.filter((topic) => tests.some((test) => test.topic_id === topic.id));
    return groupIndexByTopic(topics, tests);
  }, [active, bundle]);

  useEffect(() => {
    if (!active) {
      setEntries({});
      return;
    }
    const next = {};
    const assigned = bundle.testLinks.filter((row) => row.assignment_id === active.assignment.id);
    assigned.forEach((link) => {
      const test = bundle.tests.find((row) => row.id === link.book_test_id);
      const result = bundle.results.find(
        (row) =>
          row.assignment_id === active.assignment.id &&
          row.student_id === active.student.id &&
          row.book_test_id === link.book_test_id
      );
      next[link.book_test_id] = result
        ? {
            correct: String(result.correct_count),
            wrong: String(result.wrong_count),
            blank: String(result.blank_count),
          }
        : emptyCounts();
    });
    setEntries(next);
  }, [active, bundle]);

  function setCount(testId, field, value, questionCount) {
    setEntries((current) => {
      const prev = current[testId] ?? emptyCounts();
      const next = { ...prev, [field]: value };
      const used = parseCount(next.correct) + parseCount(next.wrong) + parseCount(next.blank);
      if (used > questionCount) return current;
      return { ...current, [testId]: next };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!active) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const rows = [];
      for (const link of bundle.testLinks.filter((row) => row.assignment_id === active.assignment.id)) {
        const test = bundle.tests.find((row) => row.id === link.book_test_id);
        const entry = entries[link.book_test_id];
        if (!test || !entry) continue;
        if (remainder(entry, test.question_count) !== 0) continue;
        rows.push({
          assignment_id: active.assignment.id,
          student_id: active.student.id,
          book_test_id: test.id,
          correct_count: parseCount(entry.correct),
          wrong_count: parseCount(entry.wrong),
          blank_count: parseCount(entry.blank),
        });
      }
      if (!rows.length) {
        throw new Error('Kaydetmek için her testte doğru + yanlış + boş soru sayısına eşit olmalı.');
      }
      await upsertHomeworkResults(rows);
      setSuccess(`${rows.length} test kaydedildi.`);
      await refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Ödevler yükleniyor…</p>
      </section>
    );
  }

  return (
    <div className="homework-module demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Ödev</h1>
        <p className="dash-subtitle">Çocuğunuzun kaynak ödevlerini görün ve sonuç girin.</p>
      </header>

      {error && <InlineError error={error} />}
      {success && <SuccessMessage message={success} />}

      {cards.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">Şu anda ödev yok.</p>
        </section>
      ) : (
        <ul className="homework-assignment-cards">
          {cards.map((card) => {
            const id = `${card.assignment.id}-${card.student.id}`;
            const book = bundle.books.find((row) => row.id === card.assignment.book_id);
            const windowStatus = assignmentWindowStatus(card.assignment, today);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`homework-task-card${activeId === id ? ' homework-task-card--active' : ''}`}
                  onClick={() => setActiveId(id)}
                >
                  <span className={`homework-pill homework-pill--${card.status.key}`}>
                    {card.status.label}
                  </span>
                  <strong>{book?.title ?? 'Ödev'}</strong>
                  <span className="dash-hint">
                    {card.student.full_name} · son {formatDateTr(card.assignment.due_on)}
                    {windowStatus === 'upcoming' ? ' · henüz başlamadı' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active ? (
        <form className="dash-card dash-form" onSubmit={handleSave}>
          <h2 className="dash-section-title">Sonuç gir</h2>
          {active.assignment.notes ? <p className="dash-hint">{active.assignment.notes}</p> : null}
          {!canEnterResults(active.assignment, today) ? (
            <p className="dash-hint">
              {assignmentWindowStatus(active.assignment, today) === 'upcoming'
                ? 'Ödev henüz başlamadı.'
                : 'Teslim tarihi geçti; sonuçlar salt okunur.'}
            </p>
          ) : null}

          {activeTests.map((topic) => (
            <div key={topic.id} className="homework-topic-block">
              <h3>{topic.topic_name}</h3>
              {topic.tests.map((test) => {
                const entry = entries[test.id] ?? emptyCounts();
                const left = remainder(entry, test.question_count);
                const locked = !canEnterResults(active.assignment, today);
                return (
                  <div key={test.id} className="homework-result-row">
                    <div className="homework-result-row__label">
                      <Icon name="clipboard" size={16} />
                      <span>
                        {test.test_name} · {test.question_count} soru
                      </span>
                      <span className={`homework-remainder${left === 0 ? ' homework-remainder--ok' : ''}`}>
                        {left === 0 ? 'Tamam' : `${left} kaldı`}
                      </span>
                    </div>
                    <div className="homework-dyb">
                      <label>
                        D
                        <input
                          className="dash-input dash-input--compact"
                          type="number"
                          min="0"
                          max={test.question_count}
                          disabled={locked}
                          value={entry.correct}
                          onChange={(event) =>
                            setCount(test.id, 'correct', event.target.value, test.question_count)
                          }
                        />
                      </label>
                      <label>
                        Y
                        <input
                          className="dash-input dash-input--compact"
                          type="number"
                          min="0"
                          max={test.question_count}
                          disabled={locked}
                          value={entry.wrong}
                          onChange={(event) =>
                            setCount(test.id, 'wrong', event.target.value, test.question_count)
                          }
                        />
                      </label>
                      <label>
                        B
                        <input
                          className="dash-input dash-input--compact"
                          type="number"
                          min="0"
                          max={test.question_count}
                          disabled={locked}
                          value={entry.blank}
                          onChange={(event) =>
                            setCount(test.id, 'blank', event.target.value, test.question_count)
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {canEnterResults(active.assignment, today) ? (
            <SendButton sending={saving} label="Kaydet" sendingLabel="Kaydediliyor…" />
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
