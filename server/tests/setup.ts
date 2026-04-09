import { beforeAll, afterEach, afterAll } from 'vitest'
import { v4 as uuidv4 } from 'uuid'

/**
 * Global test setup and teardown
 * Runs before all tests and after each test
 */

// Set test environment
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'error' // Suppress logs during tests
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key'

/**
 * Mock JWT token for testing
 * Can be used with authenticate middleware
 */
export const createMockJWT = (userId: string = uuidv4()): string => {
  // Simple base64 encoded JWT structure (not cryptographically signed)
  // Format: header.payload.signature
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      iss: 'test-issuer',
      aud: 'test-audience',
    })
  ).toString('base64')
  const signature = Buffer.from('test-signature').toString('base64')

  return `${header}.${payload}.${signature}`
}

/**
 * Create test user object
 */
export const createTestUser = (overrides = {}) => {
  const userId = uuidv4()
  return {
    id: userId,
    email: `test${userId.substring(0, 8)}@mabinicolleges.edu.ph`,
    first_name: 'Test',
    last_name: 'User',
    role: 'student',
    avatar_url: null,
    google_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create test course object
 */
export const createTestCourse = (teacherId: string = uuidv4(), overrides = {}) => {
  return {
    id: uuidv4(),
    teacher_id: teacherId,
    title: 'Test Course',
    description: 'This is a test course',
    syllabus: 'Test syllabus',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create test enrollment object
 */
export const createTestEnrollment = (
  courseId: string = uuidv4(),
  studentId: string = uuidv4(),
  overrides = {}
) => {
  return {
    id: uuidv4(),
    course_id: courseId,
    student_id: studentId,
    enrolled_at: new Date().toISOString(),
    status: 'active',
    ...overrides,
  }
}

/**
 * Create test assignment object
 */
export const createTestAssignment = (courseId: string = uuidv4(), overrides = {}) => {
  return {
    id: uuidv4(),
    course_id: courseId,
    title: 'Test Assignment',
    description: 'This is a test assignment',
    assignment_type: 'activity',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    max_points: 100,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create test submission object
 */
export const createTestSubmission = (
  assignmentId: string = uuidv4(),
  studentId: string = uuidv4(),
  overrides = {}
) => {
  return {
    id: uuidv4(),
    assignment_id: assignmentId,
    student_id: studentId,
    content: 'Test submission content',
    file_url: null,
    drive_file_id: null,
    drive_view_link: null,
    drive_file_name: null,
    submitted_at: new Date().toISOString(),
    status: 'submitted',
    anti_cheat_violations: [],
    is_proctored: false,
    ...overrides,
  }
}

/**
 * Global setup - runs once before all tests
 */
beforeAll(() => {
  // Setup global configuration
  // Could initialize test database, mock services, etc.
})

/**
 * Global teardown - runs after each test
 */
afterEach(() => {
  // Clean up after each test
  // Could reset mocks, clear database, etc.
})

/**
 * Global cleanup - runs after all tests
 */
afterAll(() => {
  // Final cleanup
})
