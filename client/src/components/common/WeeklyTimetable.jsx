import { CalendarDays } from 'lucide-react';
import { EmptyState } from './ui';

export const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
export const dayLabel = (d) => d.charAt(0) + d.slice(1).toLowerCase();
const JS_DAY_TO_ENUM = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
export const todayEnum = () => JS_DAY_TO_ENUM[new Date().getDay()];

const SUBJECT_TONES = [
  'border-l-brand-500 bg-brand-50/60',
  'border-l-emerald-500 bg-emerald-50/60',
  'border-l-amber-500 bg-amber-50/60',
  'border-l-purple-500 bg-purple-50/60',
  'border-l-sky-500 bg-sky-50/60',
  'border-l-rose-500 bg-rose-50/60',
];
function toneFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SUBJECT_TONES[h % SUBJECT_TONES.length];
}

/**
 * Week view: one column per school day (Friday only if it has periods).
 * `show` picks the secondary line: 'teacher' (section view) or 'class' (teacher view).
 */
export default function WeeklyTimetable({ entries, show = 'teacher', onSelect, emptyText = 'No periods scheduled yet.' }) {
  if (!entries?.length) return <EmptyState icon={CalendarDays} title={emptyText} />;
  const days = DAYS.filter((d) => d !== 'FRIDAY' || entries.some((e) => e.dayOfWeek === 'FRIDAY'));
  const today = todayEnum();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {days.map((d) => {
        const periods = entries.filter((e) => e.dayOfWeek === d).sort((a, b) => a.startMinute - b.startMinute);
        return (
          <section key={d} className={`rounded-xl border p-3 ${d === today ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200 bg-white'}`}>
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
              {dayLabel(d)}
              {d === today && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">Today</span>}
            </h3>
            {periods.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">No classes</p>
            ) : (
              <ul className="space-y-2">
                {periods.map((p) => {
                  const Tag = onSelect ? 'button' : 'div';
                  return (
                    <li key={p.id}>
                      <Tag
                        type={onSelect ? 'button' : undefined}
                        onClick={onSelect ? () => onSelect(p) : undefined}
                        className={`block w-full rounded-lg border-l-4 px-3 py-2 text-left ${toneFor(p.subject.id)} ${onSelect ? 'hover:ring-2 hover:ring-brand-200' : ''}`}
                      >
                        <p className="text-xs tabular-nums text-slate-500">
                          {p.startTime}–{p.endTime}
                          {p.roomNumber && <span> · Room {p.roomNumber}</span>}
                        </p>
                        <p className="text-sm font-medium text-slate-900">{p.subject.name}</p>
                        <p className="truncate text-xs text-slate-600">
                          {show === 'class' ? `${p.class.name} · Section ${p.section.name}` : p.teacher.fullName}
                        </p>
                      </Tag>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
