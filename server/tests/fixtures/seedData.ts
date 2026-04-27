import {
  createTestUser,
  createTestCourse,
  createTestEnrollment,
  createTestAssignment,
  createTestSubmission,
} from '../setup'

/**
 * Test data fixtures for database seeding
 */

export const seedData = {
  /**
   * Create multiple test users with roles
   */
  users: {
    admin: createTestUser({
      email: 'admin@mabinicolleges.edu.ph',
      role: 'admin',
    }),
    teacher: createTestUser({
      email: 'teacher@mabinicolleges.edu.ph',
      role: 'teacher',
    }),
    student1: createTestUser({
      email: 'student1@mabinicolleges.edu.ph',
      role: 'student',
    }),
    student2: createTestUser({
      email: 'student2@mabinicolleges.edu.ph',
      role: 'student',
    }),
  },

  /**
   * Create test courses
   */
  courses: () => {
    const teacherId = seedData.users.teacher.id
    return {
      published: createTestCourse(teacherId, {
        title: 'Introduction to Web Development',
        status: 'published',
      }),
      draft: createTestCourse(teacherId, {
        title: 'Advanced Database Design',
        status: 'draft',
      }),
      archived: createTestCourse(teacherId, {
        title: 'Deprecated Course',
        status: 'archived',
      }),
    }
  },

  /**
   * Create test enrollments
   */
  enrollments: () => {
    const courseId = seedData.courses().published.id
    return {
      active: createTestEnrollment(courseId, seedData.users.student1.id, {
        status: 'active',
      }),
      completed: createTestEnrollment(courseId, seedData.users.student2.id, {
        status: 'completed',
      }),
      dropped: createTestEnrollment(courseId, seedData.users.student1.id, {
        status: 'dropped',
      }),
    }
  },

  /**
   * Create test assignments
   */
  assignments: () => {
    const courseId = seedData.courses().published.id
    return {
      upcoming: createTestAssignment(courseId, {
        title: 'Assignment 1: Basics',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      due_soon: createTestAssignment(courseId, {
        title: 'Assignment 2: Advanced',
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
      overdue: createTestAssignment(courseId, {
        title: 'Assignment 3: Extra',
        due_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    }
  },

  /**
   * Create test submissions
   */
  submissions: () => {
    const assignmentId = seedData.assignments().upcoming.id
    return {
      submitted: createTestSubmission(assignmentId, seedData.users.student1.id, {
        status: 'submitted',
      }),
      graded: createTestSubmission(assignmentId, seedData.users.student2.id, {
        status: 'graded',
      }),
      late: createTestSubmission(assignmentId, seedData.users.student1.id, {
        status: 'late',
        submitted_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    }
  },
}

/**
 * Batch helper for creating multiple records
 */
export const createBatchUsers = (count: number, roleOverride?: string) => {
  return Array.from({ length: count }, (_, i) =>
    createTestUser({
      email: `batchuser${i}@mabinicolleges.edu.ph`,
      role: roleOverride || 'student',
    })
  )
}

/**
 * Create enrollment scenarios
 */
export const createEnrollmentScenarios = () => {
  const student1 = seedData.users.student1
  const student2 = seedData.users.student2

  const course = seedData.courses().published

  return {
    enrolledStudents: [
      createTestEnrollment(course.id, student1.id, { status: 'active' }),
      createTestEnrollment(course.id, student2.id, { status: 'active' }),
    ],
    droppedStudent: createTestEnrollment(course.id, student1.id, { status: 'dropped' }),
  }
}

/**
 * Create assignment submission scenarios
 */
export const createSubmissionScenarios = () => {
  const assignment = seedData.assignments().upcoming
  const student1 = seedData.users.student1
  const student2 = seedData.users.student2

  return {
    submitted: createTestSubmission(assignment.id, student1.id, {
      status: 'submitted',
      content: 'My solution to the assignment',
    }),
    notSubmitted: createTestSubmission(assignment.id, student2.id, {
      status: 'submitted',
      content: null,
      submitted_at: null,
    }),
  }
}
