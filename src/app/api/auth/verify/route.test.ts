import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const deleteRunMock = vi.fn()
const deleteWhereMock = vi.fn(() => ({
  run: deleteRunMock,
}))
const deleteMock = vi.fn(() => ({
  where: deleteWhereMock,
}))

const insertRunMock = vi.fn()
const insertValuesMock = vi.fn(() => ({
  run: insertRunMock,
}))
const txInsertMock = vi.fn(() => ({
  values: insertValuesMock,
}))

const txDeleteRunMock = vi.fn()
const txDeleteWhereMock = vi.fn(() => ({
  run: txDeleteRunMock,
}))
const txDeleteMock = vi.fn(() => ({
  where: txDeleteWhereMock,
}))

const transactionMock = vi.fn(async (callback) => {
  await callback({
    insert: txInsertMock,
    delete: txDeleteMock,
  })
})

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      get: getMock,
    })),
  })),
}))

const generateJWTMock = vi.fn(() => 'jwt-token')
const isCodeExpiredMock = vi.fn(() => false)
const eqMock = vi.fn((left, right) => ({ left, right }))

vi.mock('@/db', () => ({
  db: {
    select: selectMock,
    delete: deleteMock,
    transaction: transactionMock,
  },
}))

vi.mock('@/db/schema', () => ({
  users: {
    userId: 'users.user_id',
  },
  pendingUsers: {
    userId: 'pending_users.user_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
}))

vi.mock('@/lib/auth', () => ({
  generateJWT: generateJWTMock,
  isCodeExpired: isCodeExpiredMock,
}))

describe('Verify Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCodeExpiredMock.mockReturnValue(false)
  })

  it('should return 404 when pending user does not exist', async () => {
    getMock.mockResolvedValue(undefined)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'missing', code: '123456' }),
    }) as never)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '用户不存在或已验证' })
  })

  it('should reject an invalid code without deleting pending state', async () => {
    getMock.mockResolvedValue({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'pending-user', code: '123456' }),
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '验证码错误' })
    expect(deleteMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('should delete expired pending state and return 400', async () => {
    getMock.mockResolvedValue({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    isCodeExpiredMock.mockReturnValue(true)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'pending-user', code: '123456' }),
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '验证码已过期' })
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'pending_users.user_id',
      right: 'pending-user',
    })
  })

  it('should create the user and clear pending state in a transaction', async () => {
    getMock.mockResolvedValue({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'pending-user', code: '123456' }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: '验证成功' })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(insertValuesMock).toHaveBeenCalledWith({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      emailVerified: true,
    })
    expect(txDeleteWhereMock).toHaveBeenCalledWith({
      left: 'pending_users.user_id',
      right: 'pending-user',
    })
    expect(generateJWTMock).toHaveBeenCalledWith({
      userId: 'pending-user',
      email: 'test@example.com',
    })
    expect(response.cookies.get('auth_token')?.value).toBe('jwt-token')
  })

  it('should clean up pending state and return 409 on unique constraint conflict', async () => {
    getMock.mockResolvedValue({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    transactionMock.mockRejectedValueOnce(new Error('UNIQUE constraint failed: users.email'))
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'pending-user', code: '123456' }),
    }) as never)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: '该邮箱已注册' })
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'pending_users.user_id',
      right: 'pending-user',
    })
  })
})
