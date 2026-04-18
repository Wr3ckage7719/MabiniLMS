import { completeGoogleStudentOnboardingSchema } from '../../src/types/auth'

describe('Google Student Onboarding Schema', () => {
  it('accepts a valid setup payload', () => {
    const parsed = completeGoogleStudentOnboardingSchema.parse({
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      password: 'StrongPass1!',
    })

    expect(parsed.first_name).toBe('Juan')
    expect(parsed.last_name).toBe('Dela Cruz')
  })

  it('rejects payload with weak password', () => {
    const result = completeGoogleStudentOnboardingSchema.safeParse({
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      password: 'weakpass',
    })

    expect(result.success).toBe(false)
  })

  it('rejects payload with missing names', () => {
    const result = completeGoogleStudentOnboardingSchema.safeParse({
      first_name: '',
      last_name: '',
      password: 'StrongPass1!',
    })

    expect(result.success).toBe(false)
  })
})
