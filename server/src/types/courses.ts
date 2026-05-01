import { z } from 'zod';

// ============================================
// Course Status Enum
// ============================================

export enum CourseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

// ============================================
// Course Schemas
// ============================================

// LMS configuration knobs the teacher controls per course (see
// migration 033_course_lms_config.sql).

const courseTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((values) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  });

const completionPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_items_viewed') }),
  z.object({
    type: z.literal('passing_score_on'),
    assignment_id: z.string().uuid(),
    threshold: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal('weighted_score_threshold'),
    threshold: z.number().min(0).max(100),
  }),
]);

const categoryWeightsSchema = z.object({
  exam: z.number().min(0).max(1),
  quiz: z.number().min(0).max(1),
  activity: z.number().min(0).max(1),
  recitation: z.number().min(0).max(1),
  attendance: z.number().min(0).max(1),
  project: z.number().min(0).max(1),
});

// Short shared-classroom secret. Trim whitespace and cap length, but do
// not require any specific complexity — these are not user passwords.
const enrolmentKeySchema = z.string().trim().min(1).max(64);

export const createCourseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  syllabus: z.string().optional(),
  status: z.nativeEnum(CourseStatus).optional().default(CourseStatus.DRAFT),
  tags: courseTagsSchema.optional(),
  completion_policy: completionPolicySchema.nullable().optional(),
  category_weights: categoryWeightsSchema.nullable().optional(),
  enrolment_key: enrolmentKeySchema.nullable().optional(),
});

export const updateCourseSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  syllabus: z.string().nullable().optional(),
  tags: courseTagsSchema.optional(),
  completion_policy: completionPolicySchema.nullable().optional(),
  category_weights: categoryWeightsSchema.nullable().optional(),
  enrolment_key: enrolmentKeySchema.nullable().optional(),
});

export type CourseCompletionPolicy = z.infer<typeof completionPolicySchema>;
export type CourseCategoryWeights = z.infer<typeof categoryWeightsSchema>;

export const updateCourseStatusSchema = z.object({
  status: z.nativeEnum(CourseStatus),
});

export const courseIdParamSchema = z.object({
  id: z.string().uuid('Invalid course ID'),
});

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(CourseStatus).optional(),
  teacher_id: z.string().uuid().optional(),
  search: z.string().optional(),
  include_enrollment_count: z.enum(['true', 'false']).optional(),
});

// ============================================
// Course Material Schemas
// ============================================

export enum MaterialType {
  PDF = 'pdf',
  VIDEO = 'video',
  DOCUMENT = 'document',
  LINK = 'link',
}

export const createMaterialSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  type: z.nativeEnum(MaterialType),
  file_url: z.string().url().optional(),
  // Multipart form bodies arrive as strings, so accept the lesson_id as a
  // string and let the service validate it as a UUID. When present, the new
  // material is attached to that lesson via lesson_materials.
  lesson_id: z.string().uuid('Invalid lesson ID').optional(),
});

export const updateMaterialSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: z.nativeEnum(MaterialType).optional(),
  file_url: z.string().url().nullable().optional(),
});

export const materialIdParamSchema = z.object({
  id: z.string().uuid('Invalid material ID'),
});

export const courseMaterialsParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export const updateMaterialProgressSchema = z
  .object({
    progress_percent: z.number().min(0).max(100).optional(),
    completed: z.boolean().optional(),
    last_viewed_at: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one progress field is required',
  });

export const trackMaterialViewStartSchema = z.object({
  user_agent: z.string().max(512).optional(),
  device_type: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
});

export const trackMaterialViewEndSchema = z.object({
  time_spent_seconds: z.number().int().min(0),
  final_scroll_percent: z.number().min(0).max(100),
  completed: z.boolean().optional(),
  page_number: z.number().int().min(1).optional(),
});

export const trackMaterialDownloadSchema = z.object({
  file_name: z.string().max(255).optional(),
  file_size: z.number().int().min(0).optional(),
});

export const trackMaterialProgressSchema = z.object({
  scroll_percent: z.number().min(0).max(100),
  page_number: z.number().int().min(1).optional(),
  pages_viewed: z.array(z.number().int().min(1)).max(500).optional(),
  active_seconds: z.number().int().min(0).max(3600).optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCourseStatusInput = z.infer<typeof updateCourseStatusSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type UpdateMaterialProgressInput = z.infer<typeof updateMaterialProgressSchema>;
export type TrackMaterialViewStartInput = z.infer<typeof trackMaterialViewStartSchema>;
export type TrackMaterialViewEndInput = z.infer<typeof trackMaterialViewEndSchema>;
export type TrackMaterialDownloadInput = z.infer<typeof trackMaterialDownloadSchema>;
export type TrackMaterialProgressInput = z.infer<typeof trackMaterialProgressSchema>;

// ============================================
// Response Types
// ============================================

export interface CourseTeacher {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Course {
  id: string;
  teacher_id: string | null;
  title: string;
  description: string | null;
  syllabus: string | null;
  status: CourseStatus;
  tags?: string[];
  completion_policy?: CourseCompletionPolicy | null;
  category_weights?: CourseCategoryWeights | null;
  enrolment_key?: string | null;
  created_at: string;
  updated_at: string;
  teacher?: CourseTeacher | null;
}

export interface CourseWithStats extends Course {
  enrollment_count?: number;
  assignment_count?: number;
}

export interface CourseMaterial {
  id: string;
  course_id: string;
  title: string;
  type: MaterialType;
  file_url: string | null;
  file_size?: number | null;
  uploaded_by?: string | null;
  drive_file_id?: string | null;
  drive_view_link?: string | null;
  uploaded_at: string;
}

export interface MaterialProgress {
  id: string;
  material_id: string;
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed: boolean;
  last_viewed_at: string;
  completed_at: string | null;
  download_count?: number | null;
  current_scroll_position?: number | null;
  pages_viewed?: number[] | null;
  interaction_events?: MaterialEngagementEvent[] | null;
  created_at: string;
  updated_at: string;
}

export type MaterialEngagementEventType = 'view_start' | 'view_end' | 'download' | 'scroll';

export interface MaterialEngagementEvent {
  type: MaterialEngagementEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface MaterialProgressWithStudent extends MaterialProgress {
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface MaterialEngagementSummary {
  id: string;
  material_id: string;
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed: boolean;
  download_count: number;
  current_scroll_position: number;
  pages_viewed: number[];
  interaction_events: MaterialEngagementEvent[];
  event_count: number;
  view_count: number;
  avg_session_duration_seconds: number | null;
  total_scan_seconds: number;
  last_viewed_at: string;
  completed_at: string | null;
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface PaginatedCourses {
  courses: CourseWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
