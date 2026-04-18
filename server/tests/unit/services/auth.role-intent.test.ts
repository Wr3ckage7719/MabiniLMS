import { supabaseAdmin } from '../../../src/lib/supabase.js'
import * as supabaseLib from '../../../src/lib/supabase.js'
import * as authService from '../../../src/services/auth.js'
import * as auditService from '../../../src/services/audit.js'
import { UserRole, ApiError } from '../../../src/types/index.js'

const buildProfileRow = (role: UserRole) => ({
  id: '11111111-1111-1111-1111-111111111111',
  email: role === UserRole.TEACHER ? 'teacher@mabinicolleges.edu.ph' : 'student@mabinicolleges.edu.ph',
  first_name: role === UserRole.TEACHER ? 'Teacher' : 'Student',
  last_name: 'User',
  role,
  avatar_url: null,
  email_verified: true,
  email_verified_at: new Date().toISOString(),
  pending_approval: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

const mockProfileLookup = (role: UserRole) => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((tableName: string) => {
    if (tableName === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: buildProfileRow(role),
              error: null,
            }),
          }),
        }),
      } as any
    }

    if (tableName === 'session_logs') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any
    }

    throw new Error(`Unexpected table lookup: ${tableName}`)
  })
}

describe('authService.login role intent enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(supabaseLib, 'createIsolatedAuthClient').mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: { id: '11111111-1111-1111-1111-111111111111' },
            session: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_in: 3600,
            },
          },
          error: null,
        }),
      },
    } as any)

    vi.spyOn(auditService, 'logAuthEvent').mockResolvedValue(undefined as any)
    vi.spyOn(supabaseAdmin.auth.admin, 'signOut').mockResolvedValue({ error: null } as any)
  })

  it('blocks student account when teacher intent is requested', async () => {
    mockProfileLookup(UserRole.STUDENT)

    await expect(
      authService.login({
        email: 'student@mabinicolleges.edu.ph',
        password: 'Password123!',
        portal: 'app',
        roleIntent: 'teacher',
        remember_me: true,
      })
    ).rejects.toMatchObject<ApiError>({
      statusCode: 403,
      message: 'Teacher login requires a teacher account.',
    })

    expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
  })

  it('blocks teacher account when student intent is requested', async () => {
    mockProfileLookup(UserRole.TEACHER)

    await expect(
      authService.login({
        email: 'teacher@mabinicolleges.edu.ph',
        password: 'Password123!',
        portal: 'app',
        roleIntent: 'student',
        remember_me: true,
      })
    ).rejects.toMatchObject<ApiError>({
      statusCode: 403,
      message: 'Student login requires a student account.',
    })

    expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
  })
})
