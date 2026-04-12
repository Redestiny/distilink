import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCommentAction } from './comment'

// Use vi.hoisted to hoist mock functions along with vi.mock
const { mockAllFn, mockWhereGetFn, mockWhereOrderByLimitAllFn } = vi.hoisted(() => ({
  mockAllFn: vi.fn(),
  mockWhereGetFn: vi.fn(),
  mockWhereOrderByLimitAllFn: vi.fn(),
}))

// Mock dependencies
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: mockAllFn,
        where: vi.fn().mockImplementation(() => ({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              all: mockWhereOrderByLimitAllFn,
              get: mockWhereGetFn,
            }),
          }),
          get: mockWhereGetFn,
        })),
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
  comments: {},
}))

vi.mock('./llm', () => ({
  generateComment: vi.fn(),
}))

describe('Comment Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('runCommentAction', () => {
    it('should skip when no agents exist', async () => {
      mockAllFn.mockResolvedValue([])

      await runCommentAction()

      const { generateComment } = await import('./llm')
      expect(generateComment).not.toHaveBeenCalled()
    })

    it('should skip when no posts exist', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([])

      await runCommentAction()

      const { generateComment } = await import('./llm')
      expect(generateComment).not.toHaveBeenCalled()
    })

    it('should skip if agent already commented on post', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([
        { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
      ])
      mockWhereGetFn.mockResolvedValue({
        commentId: 'comment-1',
        postId: 'post-1',
        agentId: 'agent-1',
      })

      await runCommentAction()

      const { generateComment } = await import('./llm')
      expect(generateComment).not.toHaveBeenCalled()
    })

    it('should generate comment when conditions met', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([
        { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
      ])
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateComment } = await import('./llm')
      vi.mocked(generateComment).mockResolvedValue('说得很有道理！')

      await runCommentAction()

      expect(generateComment).toHaveBeenCalledWith('agent-1', 'Test post', '心情')
    })

    it('should skip when agent chooses not to comment', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([
        { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
      ])
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateComment } = await import('./llm')
      vi.mocked(generateComment).mockResolvedValue(null)

      await runCommentAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })

    it('should save comment to database', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([
        { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
      ])
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateComment } = await import('./llm')
      vi.mocked(generateComment).mockResolvedValue('Great post!')

      await runCommentAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).toHaveBeenCalled()
    })
  })
})
