import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const runInsertMock = vi.fn()
const valuesMock = vi.fn(() => ({
  run: runInsertMock,
}))
const insertMock = vi.fn(() => ({
  values: valuesMock,
}))
const runDeleteMock = vi.fn()
const deleteWhereMock = vi.fn(() => ({
  run: runDeleteMock,
}))
const deleteMock = vi.fn(() => ({
  where: deleteWhereMock,
}))
const whereMock = vi.fn(() => ({
  get: getMock,
}))
const fromMock = vi.fn(() => ({
  where: whereMock,
}))
const selectMock = vi.fn(() => ({
  from: fromMock,
}))

const sendVerificationEmailMock = vi.fn()
const generateUserIdMock = vi.fn(() => 'user-123')
const generateVerificationCodeMock = vi.fn(() => '123456')
const hashPasswordMock = vi.fn(async () => 'hashed-password')
const getExpiryTimeMock = vi.fn(() => new Date('2026-04-14T12:10:00.000Z'))
const eqMock = vi.fn((left, right) => ({ left, right }))

vi.mock('@/db', () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    delete: deleteMock,
  },
}))

vi.mock('@/db/schema', () => ({
  users: {
    email: 'email',
    userId: 'user_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
}))

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}))

vi.mock('@/lib/auth', () => ({
  generateUserId: generateUserIdMock,
  generateVerificationCode: generateVerificationCodeMock,
  hashPassword: hashPasswordMock,
  getExpiryTime: getExpiryTimeMock,
}))

describe('Register Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockResolvedValue(undefined)
    sendVerificationEmailMock.mockResolvedValue(true)
  })

  it('should register a user when email sending succeeds', async () => {
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: '注册成功，验证码已生成',
      userId: 'user-123',
    })
    expect(insertMock).toHaveBeenCalled()
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '123456',
    }))
    expect(sendVerificationEmailMock).toHaveBeenCalledWith('test@example.com', '123456')
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('should roll back the created user when email sending fails', async () => {
    sendVerificationEmailMock.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: '验证码发送失败，请稍后重试',
    })
    expect(deleteMock).toHaveBeenCalled()
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'user_id',
      right: 'user-123',
    })
  })

  it('should not send email when the address is already registered', async () => {
    getMock.mockResolvedValue({
      userId: 'existing-user',
      email: 'test@example.com',
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: '该邮箱已注册',
    })
    expect(insertMock).not.toHaveBeenCalled()
    expect(sendVerificationEmailMock).not.toHaveBeenCalled()
  })
})
