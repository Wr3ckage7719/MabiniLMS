import { authenticate } from '../../src/middleware/auth.js';
import { supabaseAdmin } from '../../src/lib/supabase.js';
import { ApiError, UserRole } from '../../src/types/index.js';

const createJwtWithIssuedAt = (issuedAtSeconds: number): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      iat: issuedAtSeconds,
      exp: issuedAtSeconds + 3600,
      session_id: 'session-1',
    })
  ).toString('base64url');

  return `${header}.${payload}.signature`;
};

const mockSupabaseReadPaths = (passwordChangedAtIso: string) => {
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((tableName: string) => {
    if (tableName === 'system_settings') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { value: 480 },
              error: null,
            }),
          }),
        }),
      } as any;
    }

    if (tableName === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                role: UserRole.STUDENT,
                email: 'student@mabinicolleges.edu.ph',
                first_name: 'Student',
                last_name: 'User',
                pending_approval: false,
                password_changed_at: passwordChangedAtIso,
                two_factor_enabled: false,
              },
              error: null,
            }),
          }),
        }),
      } as any;
    }

    if (tableName === 'two_factor_auth') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as any;
    }

    throw new Error(`Unexpected table lookup: ${tableName}`);
  });
};

describe('authenticate password-change timing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps session valid when password change timestamp is within grace window', async () => {
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const token = createJwtWithIssuedAt(issuedAtSeconds);

    vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'student@mabinicolleges.edu.ph',
          last_sign_in_at: new Date(issuedAtSeconds * 1000).toISOString(),
          user_metadata: {},
          app_metadata: {},
          email_confirmed_at: new Date().toISOString(),
        } as any,
      },
      error: null,
    });

    mockSupabaseReadPaths(new Date((issuedAtSeconds * 1000) + 500).toISOString());

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as any;
    const next = vi.fn();

    await authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'student@mabinicolleges.edu.ph',
      role: UserRole.STUDENT,
    });
  });

  it('rejects session when password changed well after token issuance', async () => {
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const token = createJwtWithIssuedAt(issuedAtSeconds);

    vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'student@mabinicolleges.edu.ph',
          last_sign_in_at: new Date(issuedAtSeconds * 1000).toISOString(),
          user_metadata: {},
          app_metadata: {},
          email_confirmed_at: new Date().toISOString(),
        } as any,
      },
      error: null,
    });

    mockSupabaseReadPaths(new Date((issuedAtSeconds * 1000) + 5_000).toISOString());

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as any;
    const next = vi.fn();

    await authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const passedError = next.mock.calls[0]?.[0] as ApiError;
    expect(passedError).toBeInstanceOf(ApiError);
    expect(passedError.statusCode).toBe(401);
    expect(passedError.message).toBe('Your password was changed. Please sign in again.');
  });
});
