import { BookOpen, Activity, FileText, ClipboardCheck } from 'lucide-react';

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
    label: 'Exam',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
} as const satisfies Record<string, {
  icon: typeof FileText;
  label: string;
  iconBg: string;
  iconText: string;
  badgeClass: string;
}>;

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
