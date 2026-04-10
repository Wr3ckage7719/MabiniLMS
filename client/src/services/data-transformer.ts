import { ClassItem, Assignment, Student, LearningMaterial, Announcement } from '@/lib/data';

// Backend types (simplified - adjust based on actual backend responses)
interface BackendCourse {
  id: string;
  title: string;
  description?: string;
  section?: string;
  room?: string;
  schedule?: string;
  cover_image?: string;
  created_by?: string;
  teacher_name?: string;
  teacher?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  status?: 'draft' | 'published' | 'archived';
  enrollment_count?: number;
  pending_assignments_count?: number;
  archived?: boolean;
}

interface BackendAssignment {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  due_date: string;
  max_points: number;
  assignment_type?: string;
  status?: string;
  submission_status?: string;
  attachments_count?: number;
}

interface BackendUser {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role?: string;
  avatar_url?: string;
  grade?: string;
}

interface BackendMaterial {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  type?: string;
  file_type?: string;
  file_size?: number;
  file_url?: string;
  uploaded_by?: string;
  uploaded_at?: string;
  created_at?: string;
  download_count?: number;
}

// Color mapping for courses
const COURSE_COLORS: ('blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green')[] = [
  'blue', 'teal', 'purple', 'orange', 'pink', 'green'
];

function getCourseColor(index: number): 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green' {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

function parseCourseMetadataFromDescription(description?: string): {
  section?: string;
  room?: string;
  schedule?: string;
  theme?: string;
} {
  if (!description) {
    return {};
  }

  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const metadata: { section?: string; room?: string; schedule?: string; theme?: string } = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value) continue;

    if (key === 'section') metadata.section = value;
    if (key === 'room') metadata.room = value;
    if (key === 'schedule') metadata.schedule = value;
    if (key === 'theme') metadata.theme = value;
  }

  return metadata;
}

function resolveCourseColor(
  requestedColor: string | undefined,
  fallbackColor: 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green'
): 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green' {
  if (!requestedColor) {
    return fallbackColor;
  }

  const normalized = requestedColor.trim().toLowerCase();
  const knownColor = COURSE_COLORS.find((color) => normalized.includes(color));
  return knownColor || fallbackColor;
}

function parseSection(section?: string): { section: string; block?: string; level?: string } {
  const fallback = section || 'Section A';
  const normalized = fallback.trim();

  // Supports patterns like "Section A - Period 1" and "Block A • Grade 10".
  const dashParts = normalized.split('-').map((value) => value.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      section: normalized,
      block: dashParts[0],
      level: dashParts.slice(1).join(' - '),
    };
  }

  const dotParts = normalized.split('•').map((value) => value.trim()).filter(Boolean);
  if (dotParts.length >= 2) {
    return {
      section: normalized,
      block: dotParts[0],
      level: dotParts.slice(1).join(' • '),
    };
  }

  return {
    section: normalized,
    block: normalized,
  };
}

export function transformCourseToClassItem(course: BackendCourse, index: number = 0): ClassItem {
  const teacherFullName = [course.teacher?.first_name, course.teacher?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const metadata = parseCourseMetadataFromDescription(course.description);
  const parsedSection = parseSection(course.section || metadata.section);
  const fallbackColor = getCourseColor(index);
  const resolvedColor = resolveCourseColor(course.cover_image || metadata.theme, fallbackColor);

  return {
    id: course.id,
    name: course.title,
    section: parsedSection.section,
    block: parsedSection.block,
    level: parsedSection.level,
    teacher: course.teacher_name || teacherFullName || course.teacher?.email || 'Teacher',
    color: resolvedColor,
    students: course.enrollment_count || 0,
    pendingAssignments: course.pending_assignments_count || 0,
    room: course.room || metadata.room || 'Room TBA',
    schedule: course.schedule || metadata.schedule || 'Schedule TBA',
    coverImage: course.cover_image,
    archived: Boolean(course.archived || course.status === 'archived'),
  };
}

export function transformAssignment(assignment: BackendAssignment): Assignment {
  const statusMap: Record<string, Assignment['status']> = {
    'pending': 'assigned',
    'submitted': 'submitted',
    'graded': 'graded',
    'late': 'late',
  };

  const typeMap: Record<string, Assignment['type']> = {
    'homework': 'assignment',
    'quiz': 'quiz',
    'project': 'project',
    'discussion': 'discussion',
  };

  return {
    id: assignment.id,
    classId: assignment.course_id,
    title: assignment.title,
    description: assignment.description || '',
    dueDate: assignment.due_date,
    points: assignment.max_points,
    status: statusMap[assignment.submission_status || 'pending'] || 'assigned',
    type: typeMap[assignment.assignment_type || 'homework'] || 'assignment',
    attachments: assignment.attachments_count,
  };
}

export function transformUserToStudent(user: BackendUser): Student {
  const fullName = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'User';

  return {
    id: user.id,
    name: fullName,
    email: user.email,
    avatar: user.avatar_url || fullName.charAt(0).toUpperCase(),
    grade: user.grade,
  };
}

export function transformMaterial(material: BackendMaterial): LearningMaterial {
  const materialType = material.type || material.file_type;

  const fileTypeMap: Record<string, LearningMaterial['fileType']> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'video/mp4': 'video',
    'video/webm': 'video',
    'application/vnd.ms-powerpoint': 'presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
    'application/vnd.ms-excel': 'spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
    'application/zip': 'archive',
    'application/x-zip-compressed': 'archive',
    pdf: 'pdf',
    video: 'video',
    document: 'doc',
    link: 'link',
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      const kb = bytes / 1024;
      return `${kb.toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  return {
    id: material.id,
    classId: material.course_id,
    title: material.title,
    description: material.description || '',
    fileType: fileTypeMap[materialType] || 'pdf',
    fileSize: formatFileSize(material.file_size),
    uploadedBy: material.uploaded_by || 'Unknown',
    uploadedDate: material.uploaded_at || material.created_at || new Date().toISOString(),
    downloads: material.download_count || 0,
    url: material.file_url,
  };
}

// Batch transformers
export function transformCourses(courses: BackendCourse[]): ClassItem[] {
  return courses.map((course, index) => transformCourseToClassItem(course, index));
}

export function transformAssignments(assignments: BackendAssignment[]): Assignment[] {
  return assignments.map(transformAssignment);
}

export function transformUsers(users: BackendUser[]): Student[] {
  return users.map(transformUserToStudent);
}

export function transformMaterials(materials: BackendMaterial[]): LearningMaterial[] {
  return materials.map(transformMaterial);
}
