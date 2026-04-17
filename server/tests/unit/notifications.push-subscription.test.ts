import { randomUUID } from 'crypto'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

type DbError = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

const MISSING_UUID_GENERATOR_ERROR: DbError = {
  code: '42883',
  message: 'function gen_random_uuid() does not exist',
}

const BASE_INPUT = {
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    expirationTime: null,
    keys: {
      p256dh: 'test-p256dh',
      auth: 'test-auth',
    },
  },
  user_agent: 'Mozilla/5.0',
  platform: 'Android',
}

const USER_ID = randomUUID()

const setWebPushEnv = () => {
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key'
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com'
}

const getPushSubscriptionsMock = (options?: {
  existingRows?: Array<{ id: string }>
  insertError?: DbError | null
}) => {
  const upsert = vi.fn().mockResolvedValue({ error: MISSING_UUID_GENERATOR_ERROR })

  const limit = vi
    .fn()
    .mockResolvedValue({ data: options?.existingRows ?? [], error: null })
  const eqForSelect = vi.fn().mockReturnValue({ limit })
  const select = vi.fn().mockReturnValue({ eq: eqForSelect })

  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq: updateEq })

  const insert = vi
    .fn()
    .mockResolvedValue({ error: options?.insertError ?? null })

  return {
    upsert,
    select,
    update,
    updateEq,
    insert,
    eqForSelect,
    limit,
  }
}

describe('registerWebPushSubscription', () => {
  const originalWebPushPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const originalWebPushPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  const originalWebPushSubject = process.env.WEB_PUSH_SUBJECT

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    setWebPushEnv()
  })

  afterAll(() => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = originalWebPushPublicKey
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = originalWebPushPrivateKey
    process.env.WEB_PUSH_SUBJECT = originalWebPushSubject
  })

  it('falls back to explicit id insert when uuid generator default is unavailable', async () => {
    const supabaseModule = await import('../../src/lib/supabase.js')
    const pushSubscriptionsMock = getPushSubscriptionsMock()

    vi.spyOn(supabaseModule.supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table !== 'push_subscriptions') {
        throw new Error(`Unexpected table ${table}`)
      }

      return pushSubscriptionsMock as any
    })

    const notificationsService = await import('../../src/services/notifications.js')

    await expect(
      notificationsService.registerWebPushSubscription(USER_ID, BASE_INPUT)
    ).resolves.toBeUndefined()

    expect(pushSubscriptionsMock.upsert).toHaveBeenCalledTimes(1)
    expect(pushSubscriptionsMock.insert).toHaveBeenCalledTimes(1)

    const insertPayload = pushSubscriptionsMock.insert.mock.calls[0][0]
    expect(insertPayload).toEqual(
      expect.objectContaining({
        user_id: USER_ID,
        endpoint: BASE_INPUT.subscription.endpoint,
        p256dh: BASE_INPUT.subscription.keys.p256dh,
        auth: BASE_INPUT.subscription.keys.auth,
      })
    )
    expect(insertPayload.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i))
  })

  it('updates an existing endpoint on fallback path instead of inserting a new row', async () => {
    const supabaseModule = await import('../../src/lib/supabase.js')
    const pushSubscriptionsMock = getPushSubscriptionsMock({
      existingRows: [{ id: 'existing-subscription-id' }],
    })

    vi.spyOn(supabaseModule.supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table !== 'push_subscriptions') {
        throw new Error(`Unexpected table ${table}`)
      }

      return pushSubscriptionsMock as any
    })

    const notificationsService = await import('../../src/services/notifications.js')

    await expect(
      notificationsService.registerWebPushSubscription(USER_ID, BASE_INPUT)
    ).resolves.toBeUndefined()

    expect(pushSubscriptionsMock.insert).not.toHaveBeenCalled()
    expect(pushSubscriptionsMock.update).toHaveBeenCalledTimes(1)
    expect(pushSubscriptionsMock.updateEq).toHaveBeenCalledWith('id', 'existing-subscription-id')

    const updatePayload = pushSubscriptionsMock.update.mock.calls[0][0]
    expect(updatePayload.endpoint).toBeUndefined()
    expect(updatePayload.user_id).toBe(USER_ID)
  })
})
