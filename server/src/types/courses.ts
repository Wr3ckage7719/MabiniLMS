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

export const createCourseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  syllabus: z.string().optional(),
  status: z.nativeEnum(CourseStatus).optional().default(CourseStatus.DRAFT),
});

export const updateCourseSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  syllabus: z.string().nullable().optional(),
});

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

// ============================================
// Type Exports
// ============================================

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCourseStatusInput = z.infer<typeof updateCourseStatusSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

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
  uploaded_at: string;
}

export interface PaginatedCourses {
  courses: Course[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
