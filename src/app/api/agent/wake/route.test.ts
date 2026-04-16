import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const verifyJWTMock = vi.fn()
const resolveLLMConfigMock = vi.fn()
const runSinglePostActionMock = vi.fn()
const runSingleCommentActionMock = vi.fn()
const eqMock = vi.fn((left, right) => ({ left, right }))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: getMock,
        })),
      })),
    })),
  },
}))

vi.mock('@/db/schema', () => ({
  agents: {
    userId: 'user_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
}))

vi.mock('@/lib/auth', () => ({
  verifyJWT: verifyJWTMock,
}))

vi.mock('@/lib/social-engine/llm', () => ({
  resolveLLMConfig: resolveLLMConfigMock,
}))

vi.mock('@/lib/social-engine/post', () => ({
  runSinglePostAction: runSinglePostActionMock,
}))

vi.mock('@/lib/social-engine/comment', () => ({
  runSingleCommentAction: runSingleCommentActionMock,
}))

function createRequest() {
  return {
    cookies: {
      get: vi.fn((name: string) => {
        if (name === 'auth_token') {
          return { value: 'valid-token' }
        }

        return undefined
      }),
    },
  } as any
}

describe('POST /api/agent/wake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyJWTMock.mockReturnValue({ userId: 'user-1', email: 'test@example.com' })
    getMock.mockResolvedValue({
      agentId: 'agent-1',
      userId: 'user-1',
      name: 'Agent1',
    })
    resolveLLMConfigMock.mockResolvedValue({
      provider: 'openai',
      baseURL: 'https://example.com',
      apiKey: 'key',
      model: 'model',
    })
    runSinglePostActionMock.mockResolvedValue({
      status: 'created',
      postId: 'post-1',
    })
    runSingleCommentActionMock.mockResolvedValue({
      status: 'skipped',
      reason: 'agent chose not to comment',
    })
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

  it('should return 404 when user has no agent', async () => {
    getMock.mockResolvedValue(undefined)
    const { POST } = await import('./route')

    const response = await POST(createRequest())

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Agent 不存在' })
  })

  it('should return 400 when no user LLM config is available', async () => {
    resolveLLMConfigMock.mockRejectedValue(new Error('LLM config not found'))
    const { POST } = await import('./route')

    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '需先配置 LLM' })
  })

  it('should return 200 when user generic LLM config exists', async () => {
    const { POST } = await import('./route')

    const response = await POST(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(resolveLLMConfigMock).toHaveBeenCalledWith('agent-1', {
      allowEnvFallback: false,
      userId: 'user-1',
    })
    expect(runSinglePostActionMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
    }), {
      ignoreRecentPost: true,
      allowEnvFallback: false,
    })
    expect(runSingleCommentActionMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
    }), {
      allowEnvFallback: false,
    })
    expect(body).toEqual({
      message: 'Agent 已执行一次行动',
      result: {
        post: {
          status: 'created',
          postId: 'post-1',
        },
        comment: {
          status: 'skipped',
          reason: 'agent chose not to comment',
        },
      },
    })
  })

  it('should return 200 for partial success with post created and comment skipped', async () => {
    runSinglePostActionMock.mockResolvedValue({
      status: 'created',
      postId: 'post-1',
    })
    runSingleCommentActionMock.mockResolvedValue({
      status: 'skipped',
      postId: 'post-2',
      reason: 'agent chose not to comment',
    })
    const { POST } = await import('./route')

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Agent 已执行一次行动',
      result: {
        post: {
          status: 'created',
          postId: 'post-1',
        },
        comment: {
          status: 'skipped',
          postId: 'post-2',
          reason: 'agent chose not to comment',
        },
      },
    })
  })

  it('should return 200 for full success with post created and comment created', async () => {
    runSingleCommentActionMock.mockResolvedValue({
      status: 'created',
      commentId: 'comment-1',
      postId: 'post-2',
    })
    const { POST } = await import('./route')

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Agent 已执行一次行动',
      result: {
        post: {
          status: 'created',
          postId: 'post-1',
        },
        comment: {
          status: 'created',
          commentId: 'comment-1',
          postId: 'post-2',
        },
      },
    })
  })
})
