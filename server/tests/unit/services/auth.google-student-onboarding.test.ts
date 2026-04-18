import { supabaseAdmin } from '../../../src/lib/supabase.js'
import * as authService from '../../../src/services/auth.js'
import { ApiError, UserRole } from '../../../src/types/index.js'

const USER_ID = '22222222-2222-2222-2222-222222222222'

const buildProfile = (overrides: Partial<Record<string, any>> = {}) => ({
  id: USER_ID,
  email: 'student@mabinicolleges.edu.ph',
  first_name: 'Student',
  last_name: 'User',
  role: UserRole.STUDENT,
  avatar_url: null,
  email_verified: true,
  email_verified_at: new Date().toISOString(),
  pending_approval: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

const mockProfileQueries = (profile: Record<string, any>, passwordChangedAt: string | null = null) => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((tableName: string) => {
    if (tableName === 'profiles') {
      return {
        select: vi.fn().mockImplementation((columns: string) => {
          if (columns.includes('password_changed_at')) {
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { password_changed_at: passwordChangedAt },
                  error: null,
                }),
              }),
            }
          }

          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: profile,
                error: null,
              }),
            }),
          }
        }),
      } as any
    }

    throw new Error(`Unexpected table lookup: ${tableName}`)
  })
}

describe('authService.completeGoogleStudentOnboarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects non-student roles', async () => {
    mockProfileQueries(buildProfile({ role: UserRole.TEACHER, email: 'teacher@mabinicolleges.edu.ph' }))

    const getUserByIdSpy = vi.spyOn(supabaseAdmin.auth.admin, 'getUserById')

    await expect(
      authService.completeGoogleStudentOnboarding(USER_ID, {
        first_name: 'Teacher',
        last_name: 'Person',
        password: 'StrongPass1!',
      })
    ).rejects.toMatchObject<ApiError>({
      statusCode: 403,
      message: 'Only student accounts can complete Google onboarding.',
    })

    expect(getUserByIdSpy).not.toHaveBeenCalled()
  })

  it('rejects student accounts that did not sign in with Google', async () => {
    mockProfileQueries(buildProfile())

    vi.spyOn(supabaseAdmin.auth.admin, 'getUserById').mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          app_metadata: { provider: 'email', providers: ['email'] },
        },
      },
      error: null,
    } as any)

    const updateUserByIdSpy = vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById')

    await expect(
      authService.completeGoogleStudentOnboarding(USER_ID, {
        first_name: 'Student',
        last_name: 'Only',
        password: 'StrongPass1!',
      })
    ).rejects.toMatchObject<ApiError>({
      statusCode: 403,
      message: 'Google onboarding is only available for Google-based student accounts.',
    })

    expect(updateUserByIdSpy).not.toHaveBeenCalled()
  })

  it('rejects onboarding when setup is already complete', async () => {
    mockProfileQueries(
      buildProfile({
        first_name: 'Juan',
        last_name: 'Dela Cruz',
      }),
      new Date().toISOString()
    )

    const getUserByIdSpy = vi.spyOn(supabaseAdmin.auth.admin, 'getUserById').mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          app_metadata: { provider: 'google', providers: ['google'] },
        },
      },
      error: null,
    } as any)

    const updateUserByIdSpy = vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById')

    await expect(
      authService.completeGoogleStudentOnboarding(USER_ID, {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        password: 'StrongPass1!',
      })
    ).rejects.toMatchObject<ApiError>({
      statusCode: 409,
      message: 'Google student onboarding has already been completed for this account.',
    })

    expect(getUserByIdSpy).toHaveBeenCalledTimes(2)
    expect(updateUserByIdSpy).not.toHaveBeenCalled()
  })
})
