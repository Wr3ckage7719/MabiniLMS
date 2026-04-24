import { BookOpen, Activity, FileText, ClipboardCheck, Users, CalendarCheck, FolderOpen } from 'lucide-react';

export const TASK_TYPE_META = {
  reading_material: {
    icon: BookOpen,
    label: 'Reading Material',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  activity: {
    icon: Activity,
    label: 'Activity',
    iconBg: 'bg-sky-100',
    iconText: 'text-sky-700',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  quiz: {
    icon: FileText,
    label: 'Quiz',
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-700',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  exam: {
    icon: ClipboardCheck,
    label: 'Major Exam',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  recitation: {
    icon: Users,
    label: 'Recitation',
    iconBg: 'bg-cyan-100',
    iconText: 'text-cyan-700',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  attendance: {
    icon: CalendarCheck,
    label: 'Attendance',
    iconBg: 'bg-green-100',
    iconText: 'text-green-700',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  project: {
    icon: FolderOpen,
    label: 'Project',
    iconBg: 'bg-orange-100',
    iconText: 'text-orange-700',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
  },
} as const satisfies Record<string, {
  icon: typeof FileText;
  label: string;
  iconBg: string;
  iconText: string;
  badgeClass: string;
}>;

export const GRADING_PERIOD_LABELS: Record<string, string> = {
  pre_mid: 'Pre-Mid',
  midterm: 'Midterm',
  pre_final: 'Pre-Final',
  final: 'Final',
};

const FALLBACK = {
  icon: FileText,
  label: 'Assignment',
  iconBg: 'bg-primary/10',
  iconText: 'text-primary',
  badgeClass: 'bg-primary/5 text-primary border-primary/20',
};

export type KnownTaskType = keyof typeof TASK_TYPE_META;

export function getTaskTypeMeta(rawType: string | undefined | null) {
  return TASK_TYPE_META[rawType as KnownTaskType] ?? FALLBACK;
}
