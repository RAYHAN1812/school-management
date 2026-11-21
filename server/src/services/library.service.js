import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { daysOverdue, libraryFine } from '../utils/calculations.js';
import { getPagination } from '../utils/http.js';
import { nextSequence } from '../utils/sequences.js';
import { assertCanViewStudent } from './access.service.js';

// Library rules (could become per-school settings).
export const LIBRARY_RULES = { loanDays: 14, maxBooksPerStudent: 3, finePerDay: 5 };

const issueInclude = {
  book: { select: { id: true, bookCode: true, title: true, author: true } },
  student: { select: { id: true, fullName: true, studentCode: true } },
};

const decorate = (issue) => {
  const open = issue.status === 'ISSUED';
  return {
    ...issue,
    overdueDays: open ? daysOverdue(issue.dueDate) : daysOverdue(issue.dueDate, issue.returnDate),
    // Fine so far for open loans; the charged fine for returned ones.
    fineDue: open ? libraryFine(issue.dueDate, new Date(), LIBRARY_RULES.finePerDay) : Number(issue.fineAmount),
  };
};

// ───────────────────────── Books ─────────────────────────

export async function listBooks(schoolId, query) {
  const { skip, take, meta } = getPagination(query);
  const where = {
    schoolId,
    ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
    ...(query.available === 'true' ? { availableCopies: { gt: 0 } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { author: { contains: query.search, mode: 'insensitive' } },
            { isbn: { contains: query.search } },
            { bookCode: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total, categories] = await Promise.all([
    prisma.book.findMany({ where, orderBy: { title: 'asc' }, skip, take }),
    prisma.book.count({ where }),
    prisma.book.findMany({ where: { schoolId, category: { not: null } }, distinct: ['category'], select: { category: true } }),
  ]);
  return { items, meta: { ...meta(total), categories: categories.map((c) => c.category).sort() } };
}

export async function createBook(schoolId, data, actor, ctx) {
  const book = await prisma.$transaction(async (tx) => {
    let code = data.bookCode;
    if (code) {
      if (await tx.book.findUnique({ where: { schoolId_bookCode: { schoolId, bookCode: code } } })) {
        throw AppError.conflict('DUPLICATE_BOOK_ID', `Book ID ${code} is already in use`);
      }
    } else {
      do code = `BK-${String(await nextSequence(tx, schoolId, 'BOOK')).padStart(5, '0')}`;
      while (await tx.book.findUnique({ where: { schoolId_bookCode: { schoolId, bookCode: code } } }));
    }
    return tx.book.create({
      data: { ...data, schoolId, bookCode: code, availableCopies: data.totalCopies },
    });
  });
  await audit({ action: 'BOOK_ADDED', entity: 'Book', entityId: book.id, actor, schoolId, metadata: { bookCode: book.bookCode, copies: data.totalCopies }, ...ctx });
  return book;
}

export async function updateBook(schoolId, id, data, actor, ctx) {
  const book = await prisma.book.findFirst({ where: { id, schoolId } });
  if (!book) throw AppError.notFound('BOOK_NOT_FOUND', 'Book not found');
  const patch = { ...data };
  if (data.totalCopies !== undefined) {
    const onLoan = book.totalCopies - book.availableCopies;
    if (data.totalCopies < onLoan) throw AppError.conflict('COPIES_ON_LOAN', `${onLoan} copies are currently on loan`);
    patch.availableCopies = data.totalCopies - onLoan;
  }
  const updated = await prisma.book.update({ where: { id }, data: patch });
  await audit({ action: 'BOOK_UPDATED', entity: 'Book', entityId: id, actor, schoolId, ...ctx });
  return updated;
}

// ───────────────────────── Loans ─────────────────────────

/** Issue a copy. The stock check and decrement happen in one conditional update. */
export async function issueBook(schoolId, bookId, data, actor, ctx) {
  const book = await prisma.book.findFirst({ where: { id: bookId, schoolId } });
  if (!book) throw AppError.notFound('BOOK_NOT_FOUND', 'Book not found');
  const student = await prisma.student.findFirst({ where: { id: data.studentId, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');
  if (student.status !== 'ACTIVE') throw AppError.conflict('STUDENT_INACTIVE', 'Only active students can borrow books');

  const issue = await prisma.$transaction(async (tx) => {
    const open = await tx.bookIssue.findMany({ where: { studentId: student.id, status: 'ISSUED' } });
    if (open.some((i) => i.bookId === book.id)) throw AppError.conflict('ALREADY_BORROWED', `${student.fullName} already has a copy of this book`);
    if (open.length >= LIBRARY_RULES.maxBooksPerStudent) {
      throw AppError.conflict('BORROW_LIMIT_REACHED', `${student.fullName} already has ${open.length} books (limit ${LIBRARY_RULES.maxBooksPerStudent})`);
    }
    const taken = await tx.book.updateMany({ where: { id: book.id, availableCopies: { gt: 0 } }, data: { availableCopies: { decrement: 1 } } });
    if (taken.count === 0) throw AppError.conflict('NO_COPIES_AVAILABLE', 'No copies of this book are available');

    const today = new Date(new Date().toISOString().slice(0, 10));
    return tx.bookIssue.create({
      data: {
        schoolId,
        bookId: book.id,
        studentId: student.id,
        issuedById: actor.id,
        issueDate: today,
        dueDate: data.dueDate ?? new Date(today.getTime() + LIBRARY_RULES.loanDays * 86400000),
        status: 'ISSUED',
      },
      include: issueInclude,
    });
  });
  await audit({ action: 'BOOK_ISSUED', entity: 'BookIssue', entityId: issue.id, actor, schoolId, metadata: { bookId: book.id, studentId: student.id }, ...ctx });
  return decorate(issue);
}

/** Return a book. It must currently be on loan to this student; fines are computed now. */
export async function returnBook(schoolId, bookId, { studentId }, actor, ctx) {
  const open = await prisma.bookIssue.findFirst({ where: { schoolId, bookId, studentId, status: 'ISSUED' } });
  if (!open) throw AppError.badRequest('NOT_ISSUED_TO_STUDENT', 'This book is not currently issued to this student');

  const returnDate = new Date(new Date().toISOString().slice(0, 10));
  const fine = libraryFine(open.dueDate, returnDate, LIBRARY_RULES.finePerDay);
  const issue = await prisma.$transaction(async (tx) => {
    // Guard against a double return racing this one.
    const closed = await tx.bookIssue.updateMany({ where: { id: open.id, status: 'ISSUED' }, data: { status: 'RETURNED', returnDate, fineAmount: fine } });
    if (closed.count === 0) throw AppError.badRequest('NOT_ISSUED_TO_STUDENT', 'This book has already been returned');
    await tx.book.update({ where: { id: bookId }, data: { availableCopies: { increment: 1 } } });
    return tx.bookIssue.findUnique({ where: { id: open.id }, include: issueInclude });
  });
  await audit({ action: 'BOOK_RETURNED', entity: 'BookIssue', entityId: issue.id, actor, schoolId, metadata: { fine }, ...ctx });
  return decorate(issue);
}

export async function listIssues(schoolId, query) {
  const { skip, take, meta } = getPagination(query);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const where = {
    schoolId,
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.bookId ? { bookId: query.bookId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.overdue === 'true' ? { status: 'ISSUED', dueDate: { lt: today } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.bookIssue.findMany({ where, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], skip, take, include: issueInclude }),
    prisma.bookIssue.count({ where }),
  ]);
  return { items: items.map(decorate), meta: meta(total) };
}

export async function studentLibrary(schoolId, studentId, actor) {
  await assertCanViewStudent(actor, schoolId, studentId);
  const issues = await prisma.bookIssue.findMany({ where: { studentId }, orderBy: { issueDate: 'desc' }, take: 50, include: issueInclude });
  return { rules: LIBRARY_RULES, issues: issues.map(decorate) };
}

export async function libraryStats(schoolId) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const [titles, copies, onLoan, overdue] = await Promise.all([
    prisma.book.count({ where: { schoolId } }),
    prisma.book.aggregate({ where: { schoolId }, _sum: { totalCopies: true, availableCopies: true } }),
    prisma.bookIssue.count({ where: { schoolId, status: 'ISSUED' } }),
    prisma.bookIssue.count({ where: { schoolId, status: 'ISSUED', dueDate: { lt: today } } }),
  ]);
  return { titles, totalCopies: copies._sum.totalCopies ?? 0, availableCopies: copies._sum.availableCopies ?? 0, onLoan, overdue };
}
