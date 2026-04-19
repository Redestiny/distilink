import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()

const insertRunMock = vi.fn()
const insertValuesMock = vi.fn(() => ({
  run: insertRunMock,
}))
const insertMock = vi.fn(() => ({
  values: insertValuesMock,
}))

const updateRunMock = vi.fn()
const updateWhereMock = vi.fn(() => ({
  run: updateRunMock,
}))
const updateSetMock = vi.fn(() => ({
  where: updateWhereMock,
}))
const updateMock = vi.fn(() => ({
  set: updateSetMock,
}))

const deleteRunMock = vi.fn()
const deleteWhereMock = vi.fn(() => ({
  run: deleteRunMock,
}))
const deleteMock = vi.fn(() => ({
  where: deleteWhereMock,
}))

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      get: getMock,
    })),
  })),
}))

const generateVerificationCodeMock = vi.fn(() => '123456')
const getExpiryTimeMock = vi.fn(() => new Date('2026-04-14T12:10:00.000Z'))
const sendVerificationEmailMock = vi.fn()
const eqMock = vi.fn((left, right) => ({ left, right }))

vi.mock('@/db', () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
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
  generateVerificationCode: generateVerificationCodeMock,
  getExpiryTime: getExpiryTimeMock,
}))

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}))

describe('Forgot Password Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendVerificationEmailMock.mockResolvedValue(true)
  })

  it('should return success and not create a token for unknown email', async () => {
    getMock.mockResolvedValueOnce(undefined)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: '验证码已发送' })
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
    expect(sendVerificationEmailMock).not.toHaveBeenCalled()
  })

  it('should create a token when the user requests reset for the first time', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce(undefined)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: '验证码已发送' })
    expect(insertValuesMock).toHaveBeenCalledWith({
      userId: 'user-123',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(sendVerificationEmailMock).toHaveBeenCalledWith('test@example.com', '123456')
  })

  it('should overwrite the old token on repeat request', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: '验证码已发送' })
    expect(updateSetMock).toHaveBeenCalledWith({
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(updateWhereMock).toHaveBeenCalledWith({
      left: 'password_reset_tokens.user_id',
      right: 'user-123',
    })
  })

  it('should delete a newly created token when email sending fails', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce(undefined)
    sendVerificationEmailMock.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    }) as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: '验证码发送失败，请稍后重试' })
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'password_reset_tokens.user_id',
      right: 'user-123',
    })
  })

  it('should restore the old token when resend email fails', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      email: 'test@example.com',
    })
    getMock.mockResolvedValueOnce({
      userId: 'user-123',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
    sendVerificationEmailMock.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    }) as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: '验证码发送失败，请稍后重试' })
    expect(updateSetMock).toHaveBeenNthCalledWith(1, {
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(updateSetMock).toHaveBeenNthCalledWith(2, {
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
  })
})
