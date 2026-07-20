import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  callLLM,
  generatePost,
  generateThreadedComment,
  generateThreadReply,
  parseThreadedCommentDecision,
  generateDM,
  generateScore,
  resolveLLMConfig,
} from './llm'

const { mockWhereGetFn, mockWhereAllFn } = vi.hoisted(() => ({
  mockWhereGetFn: vi.fn<() => Promise<any>>(),
  mockWhereAllFn: vi.fn<() => Promise<any[]>>(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: mockWhereGetFn,
          all: mockWhereAllFn,
        }),
      }),
    }),
  },
}))

vi.mock('@/db/schema', () => ({
  agents: {},
  llmConfigs: {},
}))

vi.mock('@/lib/prompts', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('You are a test agent.'),
}))

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue({
    chat: vi.fn().mockReturnValue({}),
  }),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue({
    chat: vi.fn().mockReturnValue({}),
  }),
}))

describe('LLM Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhereAllFn.mockResolvedValue([])
  })

  describe('env configuration', () => {
    it('should have LLM_API_KEY available in the test environment', () => {
      expect(process.env.LLM_API_KEY).toBeTruthy()
    })

    it('should have LLM_BASE_URL available in the test environment', () => {
      expect(process.env.LLM_BASE_URL).toBeTruthy()
    })

    it('should have LLM_MODEL available in the test environment', () => {
      expect(process.env.LLM_MODEL).toBeTruthy()
    })
  })

  describe('resolveLLMConfig', () => {
    it('should fall back to env vars when no user config exists', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)

      const result = await resolveLLMConfig('nonexistent-agent')

      expect(result).toEqual({
        provider: 'openai',
        baseURL: process.env.LLM_BASE_URL,
        apiKey: process.env.LLM_API_KEY,
        model: process.env.LLM_MODEL,
      })
    })

    it('should use user generic config when no agent config exists', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)
      mockWhereAllFn.mockResolvedValue([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const result = await resolveLLMConfig('test-agent', { userId: 'user-1' })

      expect(result).toEqual({
        provider: 'openai',
        baseURL: 'https://generic.api.com',
        apiKey: 'generic-key',
        model: 'generic-model',
      })
    })

    it('should reject when env fallback is disabled and only env config exists', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)
      mockWhereAllFn.mockResolvedValue([])

      await expect(resolveLLMConfig('test-agent', {
        userId: 'user-1',
        allowEnvFallback: false,
      })).rejects.toThrow('LLM config not found')
    })
  })

  describe('callLLM', () => {
    it('should use user config when available', async () => {
      mockWhereGetFn.mockResolvedValue({
        provider: 'openai',
        baseURL: 'https://custom.api.com',
        apiKey: 'custom-key',
        model: 'custom-model',
        agentId: 'test-agent',
      })

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: 'custom response' } as any)

      const result = await callLLM('test-agent', 'system', 'user')

      expect(result).toBe('custom response')
    })

    it('should throw error when LLM returns empty response', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '', finishReason: 'stop' } as any)

      await expect(callLLM('test-agent', 'system', 'user')).rejects.toThrow('LLM returned empty response')
    })

    it('should throw error when LLM returns undefined response', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: undefined, finishReason: 'unknown' } as any)

      await expect(callLLM('test-agent', 'system', 'user')).rejects.toThrow('LLM returned empty response')
    })
  })

  describe('generatePost', () => {
    it('should generate post content', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '这是一条测试帖子。' } as any)

      const post = await generatePost('test-agent', 'AI的未来')

      expect(post).toBe('这是一条测试帖子。')
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.anything(),
          system: 'You are a test agent.',
          prompt: expect.stringContaining('AI的未来'),
        })
      )
    })

    it('should throw when agent not found', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)

      await expect(generatePost('nonexistent', 'test')).rejects.toThrow('Agent not found')
    })
  })

  describe('parseThreadedCommentDecision', () => {
    it('should return null when agent declines', () => {
      expect(parseThreadedCommentDecision('不想回复', 3)).toBeNull()
      expect(parseThreadedCommentDecision('我选择：不想回复。', 3)).toBeNull()
    })

    it('should parse a top-level comment decision', () => {
      expect(parseThreadedCommentDecision('回复帖子\n这是我的评论', 3)).toEqual({
        target: 'post',
        content: '这是我的评论',
      })
    })

    it('should parse a threaded reply decision', () => {
      expect(parseThreadedCommentDecision('回复 #2\n同感，我也这么觉得！', 3)).toEqual({
        target: 2,
        content: '同感，我也这么觉得！',
      })
      expect(parseThreadedCommentDecision('回复#1\n哈哈', 3)).toEqual({
        target: 1,
        content: '哈哈',
      })
    })

    it('should fall back to post when the index is out of range', () => {
      expect(parseThreadedCommentDecision('回复 #9\n有意思', 3)).toEqual({
        target: 'post',
        content: '有意思',
      })
    })

    it('should treat unstructured output as a top-level comment', () => {
      expect(parseThreadedCommentDecision('说得很有道理！', 3)).toEqual({
        target: 'post',
        content: '说得很有道理！',
      })
    })

    it('should return null when a reply directive has no content', () => {
      expect(parseThreadedCommentDecision('回复 #2', 3)).toBeNull()
      expect(parseThreadedCommentDecision('回复帖子', 3)).toBeNull()
      expect(parseThreadedCommentDecision('', 3)).toBeNull()
    })
  })

  describe('generateThreadedComment', () => {
    const mockLLMSetup = () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])
    }

    it('should return null when agent chooses not to comment', async () => {
      mockLLMSetup()

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '不想回复' } as any)

      const decision = await generateThreadedComment('test-agent', {
        postContent: 'Some post content',
        postTopic: 'Test Topic',
        comments: [],
      })

      expect(decision).toBeNull()
    })

    it('should include existing comments in the prompt and parse the reply target', async () => {
      mockLLMSetup()

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '回复 #1\n确实如此！' } as any)

      const decision = await generateThreadedComment('test-agent', {
        postContent: 'Some post content',
        postTopic: 'Test Topic',
        comments: [
          { index: 1, authorName: 'Alice', content: '很有意思的观点' },
          { index: 2, authorName: 'Bob', content: '我不太同意', replyToIndex: 1 },
        ],
      })

      expect(decision).toEqual({ target: 1, content: '确实如此！' })
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('#1 Alice：很有意思的观点'),
        })
      )
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('#2 Bob（回复 #1）：我不太同意'),
        })
      )
    })
  })

  describe('generateThreadReply', () => {
    const mockLLMSetup = () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])
    }

    it('should return null when agent declines to continue the thread', async () => {
      mockLLMSetup()

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '不想回复' } as any)

      const reply = await generateThreadReply('test-agent', {
        postContent: 'Some post content',
        postTopic: null,
        thread: [
          { authorName: '你', content: '我觉得不错' },
          { authorName: 'Alice', content: '为什么这么说？' },
        ],
      })

      expect(reply).toBeNull()
    })

    it('should return reply content and include the thread in the prompt', async () => {
      mockLLMSetup()

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '因为我亲身体验过呀。' } as any)

      const reply = await generateThreadReply('test-agent', {
        postContent: 'Some post content',
        postTopic: 'Test Topic',
        thread: [
          { authorName: '你', content: '我觉得不错' },
          { authorName: 'Alice', content: '为什么这么说？' },
        ],
      })

      expect(reply).toBe('因为我亲身体验过呀。')
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Alice：为什么这么说？'),
        })
      )
    })
  })

  describe('generateDM', () => {
    it('should generate DM response', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'agent1',
          userId: 'user1',
          name: 'Agent1',
          profileMD: '# Agent1\nFriendly agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'agent2',
          userId: 'user2',
          name: 'Agent2',
          profileMD: '# Agent2\nAnother agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '你好，很高兴认识你！' } as any)

      const response = await generateDM('agent1', 'agent2', 'Hello!')

      expect(response).toBe('你好，很高兴认识你！')
    })

    it('should throw when agent not found', async () => {
      mockWhereGetFn.mockResolvedValue(undefined)

      await expect(generateDM('agent1', 'agent2', 'Hello')).rejects.toThrow('Agent not found')
    })
  })

  describe('generateScore', () => {
    it('should generate score within the new range', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '4' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello there!')

      expect(score).toBe(4)
    })

    it('should clamp score to valid range', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '15' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(5)
    })

    it('should parse negative score correctly', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '-3' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(-3)
    })

    it('should clamp negative score to valid range', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '-9' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(-5)
    })

    it('should preserve zero score', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: '0' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(0)
    })

    it('should default to 0 for invalid score', async () => {
      mockWhereGetFn
        .mockResolvedValueOnce({
          agentId: 'test-agent',
          userId: 'test-user',
          name: 'TestAgent',
          profileMD: '# Test Agent\nA friendly AI agent.',
        })
        .mockResolvedValueOnce({
          agentId: 'other-agent',
          userId: 'other-user',
          name: 'OtherAgent',
          profileMD: '# Other Agent\nFriendly AI agent.',
        })
        .mockResolvedValueOnce(undefined)
      mockWhereAllFn.mockResolvedValueOnce([
        {
          provider: 'openai',
          baseURL: 'https://generic.api.com',
          apiKey: 'generic-key',
          model: 'generic-model',
          agentId: null,
        },
      ])

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({ text: 'invalid' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(0)
    })
  })
})
