import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const runInsertMock = vi.fn()
const insertValuesMock = vi.fn(() => ({
  run: runInsertMock,
}))
const insertMock = vi.fn(() => ({
  values: insertValuesMock,
}))

const runUpdateMock = vi.fn()
const updateWhereMock = vi.fn(() => ({
  run: runUpdateMock,
}))
const updateSetMock = vi.fn(() => ({
  where: updateWhereMock,
}))
const updateMock = vi.fn(() => ({
  set: updateSetMock,
}))

const runDeleteMock = vi.fn()
const deleteWhereMock = vi.fn(() => ({
  run: runDeleteMock,
}))
const deleteMock = vi.fn(() => ({
  where: deleteWhereMock,
}))

const selectFromMock = vi.fn(() => ({
  where: vi.fn(() => ({
    get: getMock,
  })),
}))
const selectMock = vi.fn(() => ({
  from: selectFromMock,
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
    update: updateMock,
    delete: deleteMock,
  },
}))

vi.mock('@/db/schema', () => ({
  users: {
    email: 'users.email',
    userId: 'users.user_id',
  },
  pendingUsers: {
    email: 'pending_users.email',
    userId: 'pending_users.user_id',
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

  it('should register a new pending user when email sending succeeds', async () => {
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertValuesMock).toHaveBeenCalledWith({
      userId: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(updateMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
    expect(sendVerificationEmailMock).toHaveBeenCalledWith('test@example.com', '123456')
  })

  it('should reject when the address is already registered in users', async () => {
    getMock.mockResolvedValueOnce({
      userId: 'existing-user',
      email: 'test@example.com',
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    expect(updateMock).not.toHaveBeenCalled()
    expect(sendVerificationEmailMock).not.toHaveBeenCalled()
  })

  it('should reuse the pending user and resend code when the address is already pending', async () => {
    getMock.mockResolvedValueOnce(undefined)
    getMock.mockResolvedValueOnce({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'old-hash',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: '注册成功，验证码已生成',
      userId: 'pending-user',
    })
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateSetMock).toHaveBeenCalledWith({
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(updateWhereMock).toHaveBeenCalledWith({
      left: 'pending_users.user_id',
      right: 'pending-user',
    })
  })

  it('should delete a newly created pending user when email sending fails', async () => {
    sendVerificationEmailMock.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: '验证码发送失败，请稍后重试',
    })
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteWhereMock).toHaveBeenCalledWith({
      left: 'pending_users.user_id',
      right: 'user-123',
    })
  })

  it('should restore the old pending state when resending email fails', async () => {
    getMock.mockResolvedValueOnce(undefined)
    getMock.mockResolvedValueOnce({
      userId: 'pending-user',
      email: 'test@example.com',
      passwordHash: 'old-hash',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
    sendVerificationEmailMock.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret123',
      }),
    }) as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: '验证码发送失败，请稍后重试',
    })
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateSetMock).toHaveBeenNthCalledWith(1, {
      passwordHash: 'hashed-password',
      verificationCode: '123456',
      codeExpiry: new Date('2026-04-14T12:10:00.000Z'),
    })
    expect(updateSetMock).toHaveBeenNthCalledWith(2, {
      passwordHash: 'old-hash',
      verificationCode: '654321',
      codeExpiry: new Date('2026-04-14T11:00:00.000Z'),
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
