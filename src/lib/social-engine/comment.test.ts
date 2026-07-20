import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCommentAction, runSingleCommentAction } from './comment'

// Use vi.hoisted to hoist mock functions along with vi.mock
const {
  mockAllFn,
  mockWhereGetFn,
  mockWhereAllFn,
  mockWhereOrderByAllFn,
  mockWhereOrderByLimitAllFn,
  mockInsertValuesFn,
} = vi.hoisted(() => ({
  mockAllFn: vi.fn(),
  mockWhereGetFn: vi.fn(),
  mockWhereAllFn: vi.fn(),
  mockWhereOrderByAllFn: vi.fn(),
  mockWhereOrderByLimitAllFn: vi.fn(),
  mockInsertValuesFn: vi.fn(),
}))

// Mock dependencies
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: mockAllFn,
        where: vi.fn().mockImplementation(() => ({
          get: mockWhereGetFn,
          all: mockWhereAllFn,
          orderBy: vi.fn().mockReturnValue({
            all: mockWhereOrderByAllFn,
            limit: vi.fn().mockReturnValue({
              all: mockWhereOrderByLimitAllFn,
              get: mockWhereGetFn,
            }),
          }),
        })),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: mockInsertValuesFn.mockReturnValue({
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
  generateThreadedComment: vi.fn(),
  generateThreadReply: vi.fn(),
}))

const testAgent = {
  agentId: 'agent-1',
  userId: 'user-1',
  name: 'Agent1',
}

describe('Comment Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))
    // Default: agent has no own comments, so Branch A (thread replies) is a no-op
    mockWhereOrderByLimitAllFn.mockResolvedValue([])
    mockWhereOrderByAllFn.mockResolvedValue([])
    mockWhereAllFn.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('runCommentAction', () => {
    it('should skip when no agents exist', async () => {
      mockAllFn.mockResolvedValue([])

      await runCommentAction()

      const { generateThreadedComment } = await import('./llm')
      expect(generateThreadedComment).not.toHaveBeenCalled()
    })

    it('should skip when no posts exist', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn.mockResolvedValue([])

      await runCommentAction()

      const { generateThreadedComment } = await import('./llm')
      expect(generateThreadedComment).not.toHaveBeenCalled()
    })

    it('should skip if agent already commented on post', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([]) // Branch A: agent's own comments
        .mockResolvedValueOnce([
          { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
        ])
      mockWhereGetFn.mockResolvedValue({
        commentId: 'comment-1',
        postId: 'post-1',
        agentId: 'agent-1',
      })

      await runCommentAction()

      const { generateThreadedComment } = await import('./llm')
      expect(generateThreadedComment).not.toHaveBeenCalled()
    })

    it('should generate comment when conditions met', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([]) // Branch A: agent's own comments
        .mockResolvedValueOnce([
          { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
        ])
      mockWhereGetFn.mockResolvedValue(undefined)
      mockWhereOrderByAllFn.mockResolvedValue([]) // no existing comments on post

      const { generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadedComment).mockResolvedValue({
        target: 'post',
        content: '说得很有道理！',
      })

      await runCommentAction()

      expect(generateThreadedComment).toHaveBeenCalledWith(
        'agent-1',
        {
          postContent: 'Test post',
          postTopic: '心情',
          comments: [],
        },
        expect.objectContaining({
          allowEnvFallback: true,
        })
      )
      expect(mockInsertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1',
          parentId: null,
          agentId: 'agent-1',
          content: '说得很有道理！',
        })
      )
    })

    it('should skip when agent chooses not to comment', async () => {
      mockAllFn.mockResolvedValue([
        { agentId: 'agent-1', name: 'Agent1', slot: 0 },
      ])
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { postId: 'post-1', content: 'Test post', topic: '心情', agentId: 'agent-2' },
        ])
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadedComment).mockResolvedValue(null)

      await runCommentAction()

      const { db } = await import('@/db')
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })
  })

  describe('runSingleCommentAction', () => {
    it('should comment on an older post when the newest is already commented', async () => {
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([]) // Branch A: agent's own comments
        .mockResolvedValueOnce([
          { postId: 'post-new', content: 'Newest post', topic: '心情', agentId: 'agent-2' },
          { postId: 'post-old', content: 'Older post', topic: '旅行见闻', agentId: 'agent-3' },
        ])
      // Already commented on the newest post, but not the older one.
      mockWhereGetFn.mockResolvedValueOnce({ commentId: 'c-1', postId: 'post-new', agentId: 'agent-1' })
      mockWhereGetFn.mockResolvedValueOnce(undefined)

      const { generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadedComment).mockResolvedValue({
        target: 'post',
        content: '好想去这个地方！',
      })

      const result = await runSingleCommentAction(testAgent)

      expect(generateThreadedComment).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          postContent: 'Older post',
          postTopic: '旅行见闻',
        }),
        expect.objectContaining({ allowEnvFallback: true })
      )
      expect(result).toMatchObject({ status: 'created', postId: 'post-old', parentId: null })
    })

    it('should create a threaded reply when the agent picks an existing comment', async () => {
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([]) // Branch A: agent's own comments
        .mockResolvedValueOnce([
          { postId: 'post-1', content: 'Test post', topic: '美食分享', agentId: 'agent-9' },
        ])
      mockWhereGetFn.mockResolvedValueOnce(undefined) // hasn't commented yet
      mockWhereOrderByAllFn.mockResolvedValueOnce([
        { commentId: 'c-1', postId: 'post-1', parentId: null, agentId: 'agent-2', content: '看起来好吃' },
        { commentId: 'c-2', postId: 'post-1', parentId: 'c-1', agentId: 'agent-3', content: '我也想吃' },
      ])
      mockWhereAllFn.mockResolvedValueOnce([
        { agentId: 'agent-2', name: 'Alice' },
        { agentId: 'agent-3', name: 'Bob' },
      ])

      const { generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadedComment).mockResolvedValue({
        target: 2,
        content: '一起去吃呀！',
      })

      const result = await runSingleCommentAction(testAgent)

      // The LLM saw the numbered comment list with reply structure
      expect(generateThreadedComment).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          comments: [
            { index: 1, authorName: 'Alice', content: '看起来好吃', replyToIndex: undefined },
            { index: 2, authorName: 'Bob', content: '我也想吃', replyToIndex: 1 },
          ],
        }),
        expect.anything()
      )
      // target 2 resolves to c-2 as the parent (楼中楼)
      expect(mockInsertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1',
          parentId: 'c-2',
          agentId: 'agent-1',
          content: '一起去吃呀！',
        })
      )
      expect(result).toMatchObject({ status: 'created', postId: 'post-1', parentId: 'c-2' })
    })

    it('should continue a thread when someone replied to the agent', async () => {
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([
          { commentId: 'my-c', postId: 'post-1', parentId: null, agentId: 'agent-1', content: '我的评论' },
        ])
        .mockResolvedValueOnce([
          { commentId: 'reply-1', postId: 'post-1', parentId: 'my-c', agentId: 'agent-2', content: '回复你一下' },
        ])
      mockWhereGetFn
        .mockResolvedValueOnce(undefined) // agent hasn't answered this reply yet
        .mockResolvedValueOnce({ postId: 'post-1', content: 'Post content', topic: '心情', agentId: 'agent-9' })
      mockWhereAllFn
        .mockResolvedValueOnce([
          { commentId: 'my-c', postId: 'post-1', parentId: null, agentId: 'agent-1', content: '我的评论' },
          { commentId: 'reply-1', postId: 'post-1', parentId: 'my-c', agentId: 'agent-2', content: '回复你一下' },
        ])
        .mockResolvedValueOnce([{ agentId: 'agent-2', name: 'Bob' }])

      const { generateThreadReply, generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadReply).mockResolvedValue('哈哈，谢谢你的回复！')

      const result = await runSingleCommentAction(testAgent)

      expect(generateThreadReply).toHaveBeenCalledWith(
        'agent-1',
        {
          postContent: 'Post content',
          postTopic: '心情',
          thread: [
            { authorName: '你', content: '我的评论' },
            { authorName: 'Bob', content: '回复你一下' },
          ],
        },
        expect.objectContaining({ allowEnvFallback: true })
      )
      expect(mockInsertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1',
          parentId: 'reply-1',
          agentId: 'agent-1',
          content: '哈哈，谢谢你的回复！',
        })
      )
      expect(result).toMatchObject({ status: 'created', postId: 'post-1', parentId: 'reply-1' })
      expect(generateThreadedComment).not.toHaveBeenCalled()
    })

    it('should fall through to commenting on a post when the agent declines a thread reply', async () => {
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([
          { commentId: 'my-c', postId: 'post-1', parentId: null, agentId: 'agent-1', content: '我的评论' },
        ])
        .mockResolvedValueOnce([
          { commentId: 'reply-1', postId: 'post-1', parentId: 'my-c', agentId: 'agent-2', content: '回复你一下' },
        ])
        .mockResolvedValueOnce([
          { postId: 'post-2', content: 'Another post', topic: null, agentId: 'agent-3' },
        ])
      mockWhereGetFn
        .mockResolvedValueOnce(undefined) // not answered yet
        .mockResolvedValueOnce({ postId: 'post-1', content: 'Post content', topic: '心情', agentId: 'agent-9' })
        .mockResolvedValueOnce(undefined) // hasn't commented on post-2
      mockWhereAllFn
        .mockResolvedValueOnce([
          { commentId: 'my-c', postId: 'post-1', parentId: null, agentId: 'agent-1', content: '我的评论' },
          { commentId: 'reply-1', postId: 'post-1', parentId: 'my-c', agentId: 'agent-2', content: '回复你一下' },
        ])
        .mockResolvedValueOnce([{ agentId: 'agent-2', name: 'Bob' }])
      mockWhereOrderByAllFn.mockResolvedValueOnce([])

      const { generateThreadReply, generateThreadedComment } = await import('./llm')
      vi.mocked(generateThreadReply).mockResolvedValue(null)
      vi.mocked(generateThreadedComment).mockResolvedValue(null)

      const result = await runSingleCommentAction(testAgent)

      expect(generateThreadReply).toHaveBeenCalled()
      expect(generateThreadedComment).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ postContent: 'Another post' }),
        expect.anything()
      )
      expect(result).toMatchObject({ status: 'skipped', postId: 'post-2' })
    })

    it('should not continue threads beyond the max depth', async () => {
      // Chain: c1 <- c2 <- c3 <- c4 <- my-c <- reply-deep (depth 6)
      const chain = [
        { commentId: 'c-1', postId: 'post-1', parentId: null, agentId: 'agent-2', content: '1楼' },
        { commentId: 'c-2', postId: 'post-1', parentId: 'c-1', agentId: 'agent-1', content: '2楼' },
        { commentId: 'c-3', postId: 'post-1', parentId: 'c-2', agentId: 'agent-2', content: '3楼' },
        { commentId: 'c-4', postId: 'post-1', parentId: 'c-3', agentId: 'agent-2', content: '4楼' },
        { commentId: 'my-c', postId: 'post-1', parentId: 'c-4', agentId: 'agent-1', content: '5楼' },
        { commentId: 'reply-deep', postId: 'post-1', parentId: 'my-c', agentId: 'agent-2', content: '6楼' },
      ]
      mockWhereOrderByLimitAllFn
        .mockResolvedValueOnce([chain[4]]) // agent's own comments
        .mockResolvedValueOnce([chain[5]]) // reply to the agent, but too deep
        .mockResolvedValueOnce([]) // Branch B: no candidate posts
      mockWhereGetFn
        .mockResolvedValueOnce(undefined) // not answered yet
        .mockResolvedValueOnce({ postId: 'post-1', content: 'Post content', topic: null, agentId: 'agent-9' })
      mockWhereAllFn.mockResolvedValueOnce(chain)

      const { generateThreadReply } = await import('./llm')

      const result = await runSingleCommentAction(testAgent)

      expect(generateThreadReply).not.toHaveBeenCalled()
      expect(result).toMatchObject({ status: 'skipped', reason: 'no posts available to comment on' })
    })

    it('should return skipped when manual single-agent action has no posts to comment on', async () => {
      mockWhereOrderByLimitAllFn.mockResolvedValue([])

      const result = await runSingleCommentAction(testAgent, {
        allowEnvFallback: false,
      })

      expect(result).toEqual({
        status: 'skipped',
        reason: 'no posts available to comment on',
      })
    })
  })
})
