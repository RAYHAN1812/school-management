import {
  Bus,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  ScrollText,
  School,
  ShieldCheck,
  User,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { ROLES } from '../../utils/roles';

const ADMIN_NAV = [
  { section: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    section: 'People',
    items: [
      { to: '/admin/students', label: 'Students', icon: GraduationCap },
      { to: '/admin/teachers', label: 'Teachers & staff', icon: Users },
      { to: '/admin/users', label: 'User accounts', icon: UserCog },
    ],
  },
  {
    section: 'Academics',
    items: [
      { to: '/admin/academics', label: 'Classes & subjects', icon: School },
      { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/admin/timetable', label: 'Class routine', icon: CalendarDays },
      { to: '/admin/exams', label: 'Exams & results', icon: ClipboardList },
      { to: '/admin/homework', label: 'Homework', icon: NotebookPen },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/school-details', label: 'School Details', icon: School },
      { to: '/admin/finance', label: 'Fees & payments', icon: Wallet },
      { to: '/admin/notices', label: 'Notices', icon: Megaphone },
      { to: '/admin/transport', label: 'Transport', icon: Bus },
      { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  { section: 'System', items: [{ to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText }] },
];

const TEACHER_NAV = [
  { section: 'Overview', items: [{ to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    section: 'Teaching',
    items: [
      { to: '/school-details', label: 'School Details', icon: School },
      { to: '/teacher/students', label: 'My students', icon: GraduationCap },
      { to: '/teacher/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/teacher/timetable', label: 'My timetable', icon: CalendarDays },
      { to: '/teacher/exams', label: 'Exams & marks', icon: ClipboardList },
      { to: '/teacher/homework', label: 'Homework', icon: NotebookPen },
      { to: '/teacher/notices', label: 'Notices', icon: Megaphone },
      { to: '/teacher/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
];

const STUDENT_NAV = [
  { section: 'Overview', items: [{ to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    section: 'My school',
    items: [
      { to: '/school-details', label: 'School Details', icon: School },
      { to: '/student/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/student/results', label: 'Results', icon: ClipboardList },
      { to: '/student/timetable', label: 'Class routine', icon: CalendarDays },
      { to: '/student/homework', label: 'Homework', icon: NotebookPen },
      { to: '/student/notices', label: 'Notices', icon: Megaphone },
    ],
  },
];

const PARENT_NAV = [
  { section: 'Overview', items: [{ to: '/parent', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    section: 'My children',
    items: [
      { to: '/school-details', label: 'School Details', icon: School },
      { to: '/parent/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/parent/results', label: 'Results', icon: ClipboardList },
      { to: '/parent/fees', label: 'Fees & payments', icon: Wallet },
      { to: '/parent/timetable', label: 'Class routine', icon: CalendarDays },
      { to: '/parent/homework', label: 'Homework', icon: NotebookPen },
      { to: '/parent/notices', label: 'Notices', icon: Megaphone },
    ],
  },
];

const ACCOUNT_NAV = {
  section: 'Account',
  items: [
    { to: '/account/profile', label: 'My profile', icon: User },
    { to: '/account/password', label: 'Change password', icon: ShieldCheck },
  ],
};

export function navFor(roleKey) {
  const base =
    {
      [ROLES.SUPER_ADMIN]: ADMIN_NAV,
      [ROLES.SCHOOL_ADMIN]: ADMIN_NAV,
      [ROLES.TEACHER]: TEACHER_NAV,
      [ROLES.STUDENT]: STUDENT_NAV,
      [ROLES.PARENT]: PARENT_NAV,
    }[roleKey] ?? [];
  return [...base, ACCOUNT_NAV];
}
