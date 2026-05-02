export type CourseCompletionPolicy =
  | { type: 'all_items_viewed' }
  | { type: 'passing_score_on'; assignment_id: string; threshold: number }
  | { type: 'weighted_score_threshold'; threshold: number };

export interface CourseCategoryWeights {
  exam: number;
  quiz: number;
  activity: number;
  recitation: number;
  attendance: number;
  project: number;
}

export interface ClassItem {
  id: string;
  name: string;
  section: string;
  block?: string;
  level?: string;
  teacher: string;
  color: 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green';
  students: number;
  pendingAssignments: number;
  room: string;
  schedule: string;
  coverImage?: string;
  archived?: boolean;
  tags?: string[];
  completionPolicy?: CourseCompletionPolicy | null;
  categoryWeights?: CourseCategoryWeights | null;
  enrolmentKey?: string | null;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  status: 'assigned' | 'submitted' | 'graded' | 'late';
  type: 'assignment' | 'quiz' | 'project' | 'discussion';
  rawType?: 'exam' | 'quiz' | 'activity' | 'recitation' | 'attendance' | 'project' | string;
  gradingPeriod?: 'pre_mid' | 'midterm' | 'pre_final' | 'final' | null;
  submissionsOpen?: boolean;
  submissionOpenAt?: string | null;
  submissionCloseAt?: string | null;
  attachments?: number;
  topics?: string[];
}

export interface Announcement {
  id: string;
  classId: string;
  author: string;
  avatar: string;
  avatarUrl?: string | null;
  title?: string;
  content: string;
  timestamp: string;
  comments: number;
  pinned?: boolean;
}

export interface StudentSubmission {
  id: string;
  classId: string;
  assignmentId: string;
  studentName: string;
  studentAvatar: string;
  assignmentTitle: string;
  submittedDate: string;
  grade?: string;
  status: 'submitted' | 'reviewed' | 'graded';
}

export interface StudentComment {
  id: string;
  classId: string;
  postId: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  timestamp: string;
  postTitle?: string;
}

export interface StudentPost {
  id: string;
  classId: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  timestamp: string;
  likes: number;
  comments: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  avatar: string;
  avatarUrl?: string;
  grade?: string;
}

export interface LearningMaterial {
  id: string;
  classId: string;
  title: string;
  description: string;
  fileType: 'pdf' | 'doc' | 'image' | 'video' | 'presentation' | 'spreadsheet' | 'archive';
  fileSize: string;
  uploadedBy: string;
  uploadedDate: string;
  downloads: number;
  url?: string;
}

// ============================================
// Lesson model (LM-centric flow)
// ============================================
//
// Lessons are the unit of progression: each lesson owns its files, its
// completion rule, and the assessments that unlock after it. Lessons can be
// chained so the next one stays locked until the previous lesson and its
// assessments are cleared. The shapes here mirror what the backend at
// /api/lessons returns.

export type LessonStatus = 'locked' | 'active' | 'done' | 'draft';

export type LessonCompletionRule =
  | { type: 'view_all_files' }
  | { type: 'mark_as_done' }
  | { type: 'time_on_material'; min_minutes: number };

export interface LessonAssessmentRef {
  assignment_id: string;
  title: string;
  raw_type: 'exam' | 'quiz' | 'activity' | 'recitation' | 'attendance' | 'project';
  points: number;
  is_optional?: boolean;
  submitted?: boolean;
  graded?: boolean;
  score_percent?: number | null;
  due_date?: string | null;
}

export interface LessonMaterialRef {
  material_id: string;
  title: string;
  file_type: 'pdf' | 'doc' | 'docx' | 'ppt' | 'pptx' | 'image' | 'video' | 'archive' | 'other';
  file_size: string;
  url?: string;
  viewed?: boolean;
  view_seconds?: number;
  page_count?: number | null;
}

export interface LessonChain {
  next_lesson_id: string | null;
  unlock_on_submit: boolean;
  unlock_on_pass: boolean;
  pass_threshold_percent?: number | null;
}

export interface LessonUnlockBlocker {
  lesson_id: string;
  lesson_title: string;
  reason: 'predecessor_not_done' | 'predecessor_assessment_pending' | 'predecessor_assessment_failed';
}

export interface Lesson {
  id: string;
  classId: string;
  ordering: number;
  title: string;
  description: string | null;
  topics: string[];
  isPublished: boolean;
  createdAt: string;
  completionRule: LessonCompletionRule;
  materials: LessonMaterialRef[];
  assessments: LessonAssessmentRef[];
  chain: LessonChain;

  // Student-derived state (computed from progress + chain). When teacher
  // is viewing the same lesson, this is just the published/draft flag.
  status: LessonStatus;
  unlockBlocker?: LessonUnlockBlocker | null;
  doneAt?: string | null;

  // Teacher-derived rollup. Optional because student responses skip it.
  stats?: {
    completed_students: number;
    total_students: number;
  };
}

export const CLASS_COLORS: Record<string, string> = {
  blue: 'bg-class-blue',
  teal: 'bg-class-teal',
  purple: 'bg-class-purple',
  orange: 'bg-class-orange',
  pink: 'bg-class-pink',
  green: 'bg-class-green',
};

export const CLASS_COLORS_TEXT: Record<string, string> = {
  blue: 'text-class-blue',
  teal: 'text-class-teal',
  purple: 'text-class-purple',
  orange: 'text-class-orange',
  pink: 'text-class-pink',
  green: 'text-class-green',
};
