import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()

const deleteRunMock = vi.fn()
const deleteWhereMock = vi.fn(() => ({
  run: deleteRunMock,
}))
const deleteMock = vi.fn(() => ({
  where: deleteWhereMock,
}))

const txUpdateRunMock = vi.fn()
const txUpdateWhereMock = vi.fn(() => ({
  run: txUpdateRunMock,
}))
const txUpdateSetMock = vi.fn(() => ({
  where: txUpdateWhereMock,
}))
const txUpdateMock = vi.fn(() => ({
  set: txUpdateSetMock,
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
    update: txUpdateMock,
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

const hashPasswordMock = vi.fn(async () => 'new-password-hash')
const isCodeExpiredMock = vi.fn(() => false)
const generateJWTMock = vi.fn(() => 'jwt-token')
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
    email: 'users.email',
    userId: 'users.user_id',
  },
  passwordResetTokens: {
    userId: 'password_reset_tokens.user_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
}))

vi.mock('@/lib/auth', () => ({
  generateJWT: generateJWTMock,
  hashPassword: hashPasswordMock,
  isCodeExpired: isCodeExpiredMock,
}))

describe('Reset Password Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCodeExpiredMock.mockReturnValue(false)
  })

  it('should require an existing reset token', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce(undefined)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '请先请求验证码' })
  })

  it('should delete expired token and return 400', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    isCodeExpiredMock.mockReturnValue(true)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '验证码已过期' })
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'password_reset_tokens.user_id',
      right: 'user-123',
    })
  })

  it('should keep token when the code is wrong', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '验证码错误' })
    expect(deleteMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('should update password and delete token in a transaction', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: '密码重置成功' })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(txUpdateSetMock).toHaveBeenCalledWith({
      passwordHash: 'new-password-hash',
    })
    expect(txUpdateWhereMock).toHaveBeenCalledWith({
      left: 'users.user_id',
      right: 'user-123',
    })
    expect(txDeleteWhereMock).toHaveBeenCalledWith({
      left: 'password_reset_tokens.user_id',
      right: 'user-123',
    })
    expect(response.cookies.get('auth_token')?.value).toBe('jwt-token')
  })
})
