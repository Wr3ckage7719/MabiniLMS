import { supabaseAdmin } from '../../src/lib/supabase.js'
import * as adminService from '../../src/services/admin.js'

const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000002'

const baseProfile = {
  id: USER_ID,
  email: 'student@mabinicolleges.edu.ph',
  first_name: 'Jose',
  last_name: 'Rizal',
  role: 'student',
  pending_approval: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

const createSingleBuilder = (result: { data: any; error: any }) => {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
  }
  return builder
}

const createUpdateOnlyBuilder = (result: { error: any }) => {
  const builder: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  }
  return builder
}

describe('adminService.hardDeleteManagedUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockProfileLookup = (profile: any) => {
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createSingleBuilder({ data: profile, error: null }) as any
      }
      // audit_logs insert
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any
    })
  }

  it('rejects when confirmation_name does not match', async () => {
    mockProfileLookup(baseProfile)
    const authAdmin: any = supabaseAdmin.auth.admin
    vi.spyOn(authAdmin, 'deleteUser').mockResolvedValue({ data: null, error: null })

    await expect(
      adminService.hardDeleteManagedUser(USER_ID, ADMIN_ID, 'Wrong Name')
    ).rejects.toThrow(/Confirmation name does not match/)

    expect(authAdmin.deleteUser).not.toHaveBeenCalled()
  })

  it('accepts case-insensitive exact match', async () => {
    mockProfileLookup(baseProfile)
    const authAdmin: any = supabaseAdmin.auth.admin
    const deleteSpy = vi.spyOn(authAdmin, 'deleteUser').mockResolvedValue({ data: null, error: null })

    await adminService.hardDeleteManagedUser(USER_ID, ADMIN_ID, 'jose rizal')

    expect(deleteSpy).toHaveBeenCalledWith(USER_ID)
  })

  it('rejects empty confirmation_name', async () => {
    mockProfileLookup(baseProfile)
    await expect(
      adminService.hardDeleteManagedUser(USER_ID, ADMIN_ID, '')
    ).rejects.toThrow(/Confirmation name does not match/)
  })

  it('rejects when whitespace-only confirmation', async () => {
    mockProfileLookup(baseProfile)
    await expect(
      adminService.hardDeleteManagedUser(USER_ID, ADMIN_ID, '   ')
    ).rejects.toThrow(/Confirmation name does not match/)
  })
})

describe('adminService.deleteManagedUser (soft delete)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('updates deleted_at instead of calling auth.deleteUser', async () => {
    let profileUpdated = false

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        // Lookup
        const builder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: baseProfile, error: null }),
          update: vi.fn(function (this: any, _payload: any) {
            profileUpdated = true
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
        }
        return builder
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    const authAdmin: any = supabaseAdmin.auth.admin
    const deleteSpy = vi.spyOn(authAdmin, 'deleteUser').mockResolvedValue({ data: null, error: null })
    const updateSpy = vi.spyOn(authAdmin, 'updateUserById').mockResolvedValue({ data: null, error: null })

    await adminService.deleteManagedUser(USER_ID, ADMIN_ID)

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ ban_duration: expect.any(String) }))
    expect(profileUpdated).toBe(true)
  })
})
