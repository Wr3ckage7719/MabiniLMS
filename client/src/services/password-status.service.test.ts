import { supabase } from '@/lib/supabase';
import { passwordStatusService } from '@/services/password-status.service';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockSupabaseFrom = vi.mocked(supabase.from);

const createTemporaryPasswordQueryBuilder = (result: {
  data: unknown;
  error: { message: string } | null;
}) => {
  const builder = {
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);

  return builder;
};

const createProfileQueryBuilder = (result: {
  data: unknown;
  error: { message: string } | null;
}) => {
  const builder = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);

  return builder;
};

describe('passwordStatusService.requiresPasswordChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when there is no active temporary password record', async () => {
    const temporaryPasswordBuilder = createTemporaryPasswordQueryBuilder({
      data: null,
      error: null,
    });

    mockSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'temporary_passwords') {
        return {
          select: vi.fn().mockReturnValue(temporaryPasswordBuilder),
        } as any;
      }

      throw new Error(`Unexpected table lookup: ${tableName}`);
    });

    const requiresPasswordChange = await passwordStatusService.requiresPasswordChange('user-1');

    expect(requiresPasswordChange).toBe(false);
    expect(mockSupabaseFrom).toHaveBeenCalledWith('temporary_passwords');
  });

  it('returns false when password was changed after temporary password issuance', async () => {
    const now = Date.now();
    const temporaryPasswordBuilder = createTemporaryPasswordQueryBuilder({
      data: {
        must_change_password: true,
        expires_at: new Date(now + 60_000).toISOString(),
        created_at: new Date(now - 60_000).toISOString(),
      },
      error: null,
    });
    const profileBuilder = createProfileQueryBuilder({
      data: {
        password_changed_at: new Date(now).toISOString(),
      },
      error: null,
    });

    mockSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'temporary_passwords') {
        return {
          select: vi.fn().mockReturnValue(temporaryPasswordBuilder),
        } as any;
      }

      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnValue(profileBuilder),
        } as any;
      }

      throw new Error(`Unexpected table lookup: ${tableName}`);
    });

    const requiresPasswordChange = await passwordStatusService.requiresPasswordChange('user-2');

    expect(requiresPasswordChange).toBe(false);
  });

  it('returns true when temporary password is active and password was not changed', async () => {
    const now = Date.now();
    const temporaryPasswordBuilder = createTemporaryPasswordQueryBuilder({
      data: {
        must_change_password: true,
        expires_at: new Date(now + 60_000).toISOString(),
        created_at: new Date(now - 60_000).toISOString(),
      },
      error: null,
    });
    const profileBuilder = createProfileQueryBuilder({
      data: {
        password_changed_at: null,
      },
      error: null,
    });

    mockSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'temporary_passwords') {
        return {
          select: vi.fn().mockReturnValue(temporaryPasswordBuilder),
        } as any;
      }

      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnValue(profileBuilder),
        } as any;
      }

      throw new Error(`Unexpected table lookup: ${tableName}`);
    });

    const requiresPasswordChange = await passwordStatusService.requiresPasswordChange('user-3');

    expect(requiresPasswordChange).toBe(true);
  });

  it('returns true for active temporary passwords when password_changed_at column is unavailable', async () => {
    const now = Date.now();
    const temporaryPasswordBuilder = createTemporaryPasswordQueryBuilder({
      data: {
        must_change_password: true,
        expires_at: new Date(now + 60_000).toISOString(),
        created_at: new Date(now - 60_000).toISOString(),
      },
      error: null,
    });
    const profileBuilder = createProfileQueryBuilder({
      data: null,
      error: {
        message: 'column profiles.password_changed_at does not exist',
      },
    });

    mockSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'temporary_passwords') {
        return {
          select: vi.fn().mockReturnValue(temporaryPasswordBuilder),
        } as any;
      }

      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnValue(profileBuilder),
        } as any;
      }

      throw new Error(`Unexpected table lookup: ${tableName}`);
    });

    const requiresPasswordChange = await passwordStatusService.requiresPasswordChange('user-4');

    expect(requiresPasswordChange).toBe(true);
  });
});
