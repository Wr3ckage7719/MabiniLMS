import { loginSchema } from '../../src/types/auth'

describe('Auth Login Schema', () => {
  it('accepts teacher role intent', () => {
    const parsed = loginSchema.parse({
      email: 'teacher@mabinicolleges.edu.ph',
      password: 'Password123!',
      portal: 'app',
      roleIntent: 'teacher',
      remember_me: true,
    })

    expect(parsed.roleIntent).toBe('teacher')
  })

  it('accepts student role intent', () => {
    const parsed = loginSchema.parse({
      email: 'student@mabinicolleges.edu.ph',
      password: 'Password123!',
      portal: 'app',
      roleIntent: 'student',
      remember_me: true,
    })

    expect(parsed.roleIntent).toBe('student')
  })

  it('rejects invalid role intent value', () => {
    const result = loginSchema.safeParse({
      email: 'user@mabinicolleges.edu.ph',
      password: 'Password123!',
      portal: 'app',
      roleIntent: 'admin',
      remember_me: true,
    })

    expect(result.success).toBe(false)
  })
})
