import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyJWTMock = vi.fn()
const testLLMConnectionMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  verifyJWT: verifyJWTMock,
}))

vi.mock('@/lib/social-engine/llm', () => ({
  testLLMConnection: testLLMConnectionMock,
}))

function createRequest(body?: Record<string, unknown>) {
  return {
    cookies: {
      get: vi.fn((name: string) => {
        if (name === 'auth_token') {
          return { value: 'valid-token' }
        }

        return undefined
      }),
    },
    json: vi.fn(async () => body ?? {
      provider: 'openai',
      apiKey: 'sk-test',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-test',
    }),
  } as any
}

describe('POST /api/config/llm/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyJWTMock.mockReturnValue({ userId: 'user-1', email: 'test@example.com' })
    testLLMConnectionMock.mockResolvedValue(undefined)
  })

  it('should return 401 when not logged in', async () => {
    const { POST } = await import('./route')
    const request = {
      cookies: {
        get: vi.fn(() => undefined),
      },
    } as any

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '未登录' })
  })

  it('should return 400 when parameters are incomplete', async () => {
    const { POST } = await import('./route')
    const response = await POST(createRequest({
      provider: 'openai',
      apiKey: '',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-test',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '参数不完整' })
  })

  it('should return success when connection test passes', async () => {
    const { POST } = await import('./route')
    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(testLLMConnectionMock).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'sk-test',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-test',
    })
    expect(await response.json()).toEqual({ message: '连接成功' })
  })

  it('should return provider error when connection test fails', async () => {
    testLLMConnectionMock.mockRejectedValue(new Error('Cannot connect to API'))
    const { POST } = await import('./route')
    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Cannot connect to API' })
  })
})
