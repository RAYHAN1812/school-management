import { CalendarCheck, ClipboardList, GraduationCap, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SCHOOL } from '../../config/school';

const HIGHLIGHTS = [
  { icon: CalendarCheck, text: 'Daily attendance with monthly reports' },
  { icon: ClipboardList, text: 'Exams, grading and GPA report cards' },
  { icon: Wallet, text: 'Fee invoices, payments and receipts' },
];

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-700/60 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <Link to="/" className="leading-tight">
            <span className="block text-lg font-semibold">{SCHOOL.name}</span>
            <span className="block text-xs text-brand-200">{SCHOOL.nameBn}</span>
          </Link>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight">Academics, character and confidence.</h2>
          <p className="mt-3 text-brand-100">
            Play Group to Class 10 · Academics, moral values, sports and creativity.
          </p>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-brand-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">© {new Date().getFullYear()} {SCHOOL.name}</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
            </div>
            <Link to="/" className="leading-tight">
              <span className="block text-lg font-semibold">{SCHOOL.name}</span>
              <span className="block text-xs text-slate-500">{SCHOOL.nameBn}</span>
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
