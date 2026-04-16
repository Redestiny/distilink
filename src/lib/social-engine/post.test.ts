import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runPostAction, runSinglePostAction } from './post'

// Use vi.hoisted to hoist mock functions along with vi.mock
const { mockFromAllFn, mockFromWhereOrderByLimitGetFn } = vi.hoisted(() => ({
  mockFromAllFn: vi.fn(),
  mockFromWhereOrderByLimitGetFn: vi.fn(),
}))

// Mock dependencies
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: mockFromAllFn,
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: mockFromWhereOrderByLimitGetFn,
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    }),
  },
}))

vi.mock('@/db/schema', () => ({
  agents: {},
  posts: {},
}))

vi.mock('./llm', () => ({
  generatePost: vi.fn(),
}))

describe('Post Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('runPostAction', () => {
    it('should skip when no agents exist', async () => {
      mockFromAllFn.mockResolvedValue([])

      await runPostAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })

    it('should not select agents not matching current slot', async () => {
      // Current slot is 0, agent slot is 5
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 5 },
      ])

      await runPostAction()

      const { generatePost } = await import('./llm')
      expect(generatePost).not.toHaveBeenCalled()
    })

    it('should select agents matching current slot', async () => {
      // Current slot is 0, slot 0 % 12 === 0
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockFromWhereOrderByLimitGetFn.mockResolvedValue(undefined) // no recent post

      const { generatePost } = await import('./llm')
      vi.mocked(generatePost).mockResolvedValue('Test post')

      await runPostAction()

      expect(generatePost).toHaveBeenCalled()
    })

    it('should skip agents that posted within 12 hours', async () => {
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      // Recent post from 1 hour ago
      mockFromWhereOrderByLimitGetFn.mockResolvedValue({
        postId: 'post-1',
        agentId: 'agent-1',
        content: 'Recent post',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      })

      const { generatePost } = await import('./llm')

      await runPostAction()

      expect(generatePost).not.toHaveBeenCalled()
    })

    it('should post for agents without recent posts', async () => {
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockFromWhereOrderByLimitGetFn.mockResolvedValue(undefined)

      const { generatePost } = await import('./llm')
      vi.mocked(generatePost).mockResolvedValue('New post content')

      await runPostAction()

      expect(generatePost).toHaveBeenCalledWith(
        'agent-1',
        expect.any(String),
        expect.objectContaining({
          allowEnvFallback: true,
        })
      )
    })

    it('should save post to database', async () => {
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockFromWhereOrderByLimitGetFn.mockResolvedValue(undefined)

      const { generatePost } = await import('./llm')
      vi.mocked(generatePost).mockResolvedValue('Database post')

      await runPostAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).toHaveBeenCalled()
    })

    it('should skip empty content', async () => {
      mockFromAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockFromWhereOrderByLimitGetFn.mockResolvedValue(undefined)

      const { generatePost } = await import('./llm')
      vi.mocked(generatePost).mockResolvedValue('')

      await runPostAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })

    it('should bypass recent post cooldown for manual single-agent action', async () => {
      mockFromWhereOrderByLimitGetFn.mockResolvedValue({
        postId: 'post-1',
        agentId: 'agent-1',
        content: 'Recent post',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      })

      const { generatePost } = await import('./llm')
      vi.mocked(generatePost).mockResolvedValue('Forced post content')

      const result = await runSinglePostAction({
        agentId: 'agent-1',
        userId: 'user-1',
        name: 'Agent1',
      }, {
        ignoreRecentPost: true,
        allowEnvFallback: false,
      })

      expect(result.status).toBe('created')
      expect(generatePost).toHaveBeenCalledWith(
        'agent-1',
        expect.any(String),
        expect.objectContaining({
          allowEnvFallback: false,
          userId: 'user-1',
        })
      )
    })
  })
})
