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
  rawType?: 'exam' | 'quiz' | 'activity' | string;
  submissionsOpen?: boolean;
  submissionOpenAt?: string | null;
  submissionCloseAt?: string | null;
  attachments?: number;
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
