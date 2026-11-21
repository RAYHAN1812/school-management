import { BookOpen, Library, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, LifecycleBadge, LoadError, Modal, PageHeader, Pagination, Spinner, StatCard, Tabs } from '../../components/common/ui';
import { TextField } from '../../components/forms/fields';
import { useAsync, useDebounced } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { libraryService } from '../../services/campus.service';
import { studentService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatMoney } from '../../utils/format';

export default function LibraryPage() {
  const [tab, setTab] = useState('books');
  const stats = useAsync(() => libraryService.stats(), []);
  return (
    <>
      <PageHeader title="Library" description={`Loans are 14 days, up to 3 books per student, with a ${formatMoney(5)} per day overdue fine.`} />
      {stats.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Titles" value={stats.data.titles} icon={Library} tone="brand" />
          <StatCard label="Copies available" value={`${stats.data.availableCopies}/${stats.data.totalCopies}`} tone="emerald" />
          <StatCard label="On loan" value={stats.data.onLoan} tone="sky" />
          <StatCard label="Overdue" value={stats.data.overdue} tone={stats.data.overdue ? 'amber' : 'slate'} />
        </div>
      )}
      <Tabs
        tabs={[
          { value: 'books', label: 'Books' },
          { value: 'loans', label: 'Loans' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'books' ? <Books onChange={stats.reload} /> : <Loans onChange={stats.reload} />}
    </>
  );
}

function Books({ onChange }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const list = useAsync(() => libraryService.books({ search: debounced, page, limit: 15 }), [debounced, page]);
  const [editing, setEditing] = useState(null);
  const [issuing, setIssuing] = useState(null);

  return (
    <Card
      bodyClassName="p-0"
      title="Catalogue"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add book
        </Button>
      }
    >
      <div className="border-b border-slate-100 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" type="search" placeholder="Title, author, ISBN or book ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search books" />
        </div>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <div className="p-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No books found" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {list.data.items.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{b.title}</p>
                  <p className="text-xs text-slate-500">
                    {b.author}
                    {b.category ? ` · ${b.category}` : ''} · <span className="font-mono">{b.bookCode}</span>
                    {b.isbn ? ` · ISBN ${b.isbn}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm tabular-nums ${b.availableCopies ? 'text-slate-700' : 'text-red-600'}`}>
                    {b.availableCopies}/{b.totalCopies} available
                  </span>
                  <Button size="sm" variant="secondary" disabled={!b.availableCopies} onClick={() => setIssuing(b)}>
                    Issue
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label={`Edit ${b.title}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}
      <BookModal
        open={Boolean(editing)}
        book={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(b) => {
          toast.success(editing === 'new' ? `${b.title} added (${b.bookCode}).` : 'Book updated.');
          setEditing(null);
          list.reload();
          onChange();
        }}
      />
      <IssueModal
        open={Boolean(issuing)}
        book={issuing}
        onClose={() => setIssuing(null)}
        onDone={(issue) => {
          toast.success(`Issued to ${issue.student.fullName} until ${formatDate(issue.dueDate)}.`);
          setIssuing(null);
          list.reload();
          onChange();
        }}
      />
    </Card>
  );
}

function BookModal({ open, book, onClose, onSaved }) {
  const f = useForm({ title: '', author: '', isbn: '', category: '', publisher: '', totalCopies: '1', bookCode: '' });
  useEffect(() => {
    if (!open) return;
    f.setValues(
      book
        ? { title: book.title, author: book.author, isbn: book.isbn ?? '', category: book.category ?? '', publisher: book.publisher ?? '', totalCopies: String(book.totalCopies), bookCode: book.bookCode }
        : { title: '', author: '', isbn: '', category: '', publisher: '', totalCopies: '1', bookCode: '' },
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book]);
  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.title.trim()) e.title = 'Enter the title';
      if (!v.author.trim()) e.author = 'Enter the author';
      if (!(Number.isInteger(Number(v.totalCopies)) && Number(v.totalCopies) >= 1)) e.totalCopies = 'At least 1';
      return e;
    },
    async (v) => {
      const payload = {
        title: v.title.trim(),
        author: v.author.trim(),
        isbn: v.isbn.trim() || null,
        category: v.category.trim() || null,
        publisher: v.publisher.trim() || null,
        totalCopies: Number(v.totalCopies),
      };
      try {
        onSaved(book ? await libraryService.updateBook(book.id, payload) : await libraryService.createBook({ ...payload, bookCode: v.bookCode.trim() || undefined }));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_BOOK_ID: 'bookCode', COPIES_ON_LOAN: 'totalCopies' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={book ? `Edit ${book.title}` : 'Add book'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="book-form" loading={f.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="book-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label="Title" {...f.bind('title')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Author" {...f.bind('author')} />
          <TextField label="ISBN" hint="10 or 13 digits" {...f.bind('isbn')} />
          <TextField label="Category" placeholder="Fiction" {...f.bind('category')} />
          <TextField label="Publisher" {...f.bind('publisher')} />
          <TextField label="Copies" type="number" min="1" {...f.bind('totalCopies')} />
          <TextField label="Book ID" placeholder={book ? undefined : 'Generated automatically'} disabled={Boolean(book)} {...f.bind('bookCode')} />
        </div>
      </form>
    </Modal>
  );
}

function StudentPicker({ value, onChange, error }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (value || debounced.trim().length < 2) return setResults([]);
    studentService.list({ search: debounced, limit: 8 }).then((r) => setResults(r.items));
  }, [debounced, value]);
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{value.fullName}</span> <span className="font-mono text-xs text-slate-500">{value.studentCode}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div>
      <TextField label="Student" placeholder="Search by name or ID" value={q} onChange={(e) => setQ(e.target.value)} error={error} />
      {results.length > 0 && (
        <ul className="mt-1 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onChange(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                {s.fullName} <span className="font-mono text-xs text-slate-400">{s.studentCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueModal({ open, book, onClose, onDone }) {
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setStudent(null);
      setError('');
    }
  }, [open]);
  async function submit() {
    if (!student) return setError('Choose a student');
    setBusy(true);
    setError('');
    try {
      onDone(await libraryService.issue(book.id, { studentId: student.id }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Issue “${book?.title ?? ''}”`}
      description="Due back in 14 days."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Issue book
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert type="error">{error}</Alert>}
        <StudentPicker value={student} onChange={setStudent} />
      </div>
    </Modal>
  );
}

function Loans({ onChange }) {
  const toast = useToast();
  const [filter, setFilter] = useState('ISSUED');
  const [page, setPage] = useState(1);
  const list = useAsync(
    () => libraryService.issues(filter === 'OVERDUE' ? { overdue: 'true', page, limit: 20 } : { status: filter || undefined, page, limit: 20 }),
    [filter, page],
  );
  const [busyId, setBusyId] = useState(null);

  async function returnBook(issue) {
    setBusyId(issue.id);
    try {
      const r = await libraryService.returnBook(issue.book.id, issue.student.id);
      toast.success(r.fineDue > 0 ? `Returned. Fine due: ${formatMoney(r.fineDue)} (${r.overdueDays} days late).` : 'Returned on time.');
      list.reload();
      onChange();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      bodyClassName="p-0"
      title="Loans"
      actions={
        <select className="input w-40 py-1.5" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label="Filter loans">
          <option value="ISSUED">On loan</option>
          <option value="OVERDUE">Overdue</option>
          <option value="RETURNED">Returned</option>
          <option value="">All</option>
        </select>
      }
    >
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <div className="p-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No loans" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {list.data.items.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{i.book.title}</p>
                  <p className="text-xs text-slate-500">
                    {i.student.fullName} ({i.student.studentCode}) · issued {formatDate(i.issueDate)} · due {formatDate(i.dueDate)}
                    {i.returnDate ? ` · returned ${formatDate(i.returnDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {i.overdueDays > 0 && (
                    <span className="text-xs font-medium text-red-600">
                      {i.overdueDays}d late · {formatMoney(i.fineDue)}
                    </span>
                  )}
                  <LifecycleBadge status={i.status} />
                  {i.status === 'ISSUED' && (
                    <Button size="sm" variant="secondary" loading={busyId === i.id} onClick={() => returnBook(i)}>
                      Return
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

export { StudentPicker };
