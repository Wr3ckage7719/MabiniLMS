import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse } from '../types/index.js';
import {
  Course,
  CourseWithStats,
  PaginatedCourses,
  CourseMaterial,
  CreateCourseInput,
  UpdateCourseInput,
  UpdateCourseStatusInput,
  ListCoursesQuery,
  CreateMaterialInput,
  UpdateMaterialInput,
} from '../types/courses.js';
import * as courseService from '../services/courses.js';

// ============================================
// Course Controllers
// ============================================

/**
 * @openapi
 * /api/courses:
 *   post:
 *     summary: Create a new course
 *     description: Create a new course (Teacher/Admin only)
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *               description:
 *                 type: string
 *               syllabus:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 default: draft
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const createCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const input: CreateCourseInput = req.body;
    const teacherId = req.user!.id;

    const course = await courseService.createCourse(input, teacherId);

    const response: ApiResponse<Course> = {
      success: true,
      data: course,
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses:
 *   get:
 *     summary: List courses
 *     description: Get paginated list of courses with optional filtering
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *       - name: teacher_id
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of courses
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const listCourses = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const query: ListCoursesQuery = req.query as any;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const result = await courseService.listCourses(query, userId, userRole);

    const response: ApiResponse<PaginatedCourses> = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     description: Get detailed information about a specific course
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: include_stats
 *         in: query
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Course details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const getCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const includeStats = req.query.include_stats === 'true';

    const course = await courseService.getCourseById(id, includeStats);

    const response: ApiResponse<CourseWithStats> = {
      success: true,
      data: course,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses/{id}:
 *   put:
 *     summary: Update course
 *     description: Update course details (Owner/Admin only)
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               syllabus:
 *                 type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const updateCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const input: UpdateCourseInput = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const course = await courseService.updateCourse(id, input, userId, userRole);

    const response: ApiResponse<Course> = {
      success: true,
      data: course,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses/{id}/status:
 *   patch:
 *     summary: Update course status
 *     description: Change course status (draft, published, archived)
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *     responses:
 *       200:
 *         description: Course status updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const updateCourseStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const input: UpdateCourseStatusInput = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const course = await courseService.updateCourseStatus(id, input, userId, userRole);

    const response: ApiResponse<Course> = {
      success: true,
      data: course,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses/{id}:
 *   delete:
 *     summary: Delete course
 *     description: Delete a course (Owner/Admin only)
 *     tags:
 *       - Courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const deleteCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    await courseService.deleteCourse(id, userId, userRole);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Course deleted successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ============================================
// Course Materials Controllers
// ============================================

/**
 * @openapi
 * /api/courses/{courseId}/materials:
 *   get:
 *     summary: List course materials
 *     description: Get all materials for a course
 *     tags:
 *       - Course Materials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of materials
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const listMaterials = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.params;
    const materials = await courseService.listMaterials(courseId);

    const response: ApiResponse<CourseMaterial[]> = {
      success: true,
      data: materials,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/courses/{courseId}/materials:
 *   post:
 *     summary: Add course material
 *     description: Add a new material to a course (Teacher/Admin only)
 *     tags:
 *       - Course Materials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - type
 *             properties:
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [pdf, video, document, link]
 *               file_url:
 *                 type: string
 *                 format: uri
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Material created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const createMaterial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.params;
    const input: CreateMaterialInput = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const material = await courseService.createMaterial(courseId, input, userId, userRole);

    const response: ApiResponse<CourseMaterial> = {
      success: true,
      data: material,
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/materials/{id}:
 *   get:
 *     summary: Get material by ID
 *     description: Get a specific material's details
 *     tags:
 *       - Course Materials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Material details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const getMaterial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const material = await courseService.getMaterialById(id);

    const response: ApiResponse<CourseMaterial> = {
      success: true,
      data: material,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/materials/{id}:
 *   put:
 *     summary: Update material
 *     description: Update a course material (Teacher/Admin only)
 *     tags:
 *       - Course Materials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [pdf, video, document, link]
 *               file_url:
 *                 type: string
 *                 format: uri
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Material updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const updateMaterial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const input: UpdateMaterialInput = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const material = await courseService.updateMaterial(id, input, userId, userRole);

    const response: ApiResponse<CourseMaterial> = {
      success: true,
      data: material,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/materials/{id}:
 *   delete:
 *     summary: Delete material
 *     description: Delete a course material (Teacher/Admin only)
 *     tags:
 *       - Course Materials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Material deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const deleteMaterial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    await courseService.deleteMaterial(id, userId, userRole);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Material deleted successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
