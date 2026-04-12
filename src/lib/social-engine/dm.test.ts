import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAndTriggerDM } from './dm'

// Use vi.hoisted to hoist mock functions along with vi.mock
const { mockCommentsAllFn, mockWhereGetFn, mockWhereLimitGetFn } = vi.hoisted(() => ({
  mockCommentsAllFn: vi.fn(),
  mockWhereGetFn: vi.fn(),
  mockWhereLimitGetFn: vi.fn(),
}))

// Mock dependencies
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: mockCommentsAllFn,
        where: vi.fn().mockReturnValue({
          get: mockWhereGetFn,
          limit: vi.fn().mockReturnValue({
            get: mockWhereLimitGetFn,
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    }),
  },
}))

vi.mock('@/db/schema', () => ({
  agents: {},
  comments: {},
  interactionLogs: {},
  relationshipScores: {},
}))

vi.mock('./llm', () => ({
  generateDM: vi.fn(),
  generateScore: vi.fn(),
}))

describe('DM Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkAndTriggerDM', () => {
    it('should not trigger DM when no comments exist', async () => {
      mockCommentsAllFn.mockResolvedValue([])

      await checkAndTriggerDM()

      const { generateDM } = await import('./llm')
      expect(generateDM).not.toHaveBeenCalled()
    })

    it('should trigger DM for agents with comments on same post', async () => {
      mockCommentsAllFn.mockResolvedValue([
        { commentId: 'c1', postId: 'post-1', agentId: 'agent-1' },
        { commentId: 'c2', postId: 'post-1', agentId: 'agent-2' },
      ])
      // First call: check existing DM - return undefined (no existing DM)
      mockWhereLimitGetFn.mockResolvedValueOnce(undefined)
      // Agent lookups (agentA and agentB)
      mockWhereGetFn.mockResolvedValueOnce({ agentId: 'agent-1', name: 'Agent1', profileMD: '# A1' })
      mockWhereGetFn.mockResolvedValueOnce({ agentId: 'agent-2', name: 'Agent2', profileMD: '# A2' })
      // Relationship score checks
      mockWhereGetFn.mockResolvedValueOnce(undefined) // A->B check
      mockWhereGetFn.mockResolvedValueOnce(undefined) // B->A check
      // For generateScore calls (agent A scoring B, agent B scoring A)
      mockWhereGetFn.mockResolvedValueOnce({ agentId: 'agent-1', name: 'Agent1', profileMD: '# A1' })
      mockWhereGetFn.mockResolvedValueOnce({ agentId: 'agent-2', name: 'Agent2', profileMD: '# A2' })

      const { generateDM, generateScore } = await import('./llm')
      vi.mocked(generateDM).mockResolvedValue('Hello!')
      vi.mocked(generateScore).mockResolvedValue(8)

      await checkAndTriggerDM()

      expect(generateDM).toHaveBeenCalled()
    })

    it('should not trigger DM if already exists', async () => {
      mockCommentsAllFn.mockResolvedValue([
        { commentId: 'c1', postId: 'post-1', agentId: 'agent-1' },
        { commentId: 'c2', postId: 'post-1', agentId: 'agent-2' },
      ])
      // Existing DM found
      mockWhereLimitGetFn.mockResolvedValue({
        actionId: 'existing-dm',
        type: 'DM',
        agentA: 'agent-1',
        agentB: 'agent-2',
      })

      const { generateDM } = await import('./llm')

      await checkAndTriggerDM()

      expect(generateDM).not.toHaveBeenCalled()
    })

    it('should not trigger DM for single agent comment', async () => {
      mockCommentsAllFn.mockResolvedValue([
        { commentId: 'c1', postId: 'post-1', agentId: 'agent-1' },
      ])

      await checkAndTriggerDM()

      const { generateDM } = await import('./llm')
      expect(generateDM).not.toHaveBeenCalled()
    })

    it('should not trigger DM for agents on different posts', async () => {
      mockCommentsAllFn.mockResolvedValue([
        { commentId: 'c1', postId: 'post-1', agentId: 'agent-1' },
        { commentId: 'c2', postId: 'post-2', agentId: 'agent-2' },
      ])

      await checkAndTriggerDM()

      const { generateDM } = await import('./llm')
      expect(generateDM).not.toHaveBeenCalled()
    })
  })
})
