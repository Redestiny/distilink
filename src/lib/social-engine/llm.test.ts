import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  callLLM,
  generatePost,
  generateComment,
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

  describe('generateComment', () => {
    it('should return null when agent chooses not to comment', async () => {
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
      vi.mocked(generateText).mockResolvedValue({ text: '不想回复' } as any)

      const comment = await generateComment('test-agent', 'Some post content', 'Test Topic')

      expect(comment).toBeNull()
    })

    it('should return comment when agent wants to respond', async () => {
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
      vi.mocked(generateText).mockResolvedValue({ text: '说得很有道理！' } as any)

      const comment = await generateComment('test-agent', 'Some post content', 'Test Topic')

      expect(comment).toBe('说得很有道理！')
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
    it('should generate score between 1-10', async () => {
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
      vi.mocked(generateText).mockResolvedValue({ text: '8' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello there!')

      expect(score).toBe(8)
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

      expect(score).toBe(10)
    })

    it('should parse score \"10\" correctly', async () => {
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
      vi.mocked(generateText).mockResolvedValue({ text: '10' } as any)

      const score = await generateScore('test-agent', 'other-agent', 'Hello')

      expect(score).toBe(10)
    })

    it('should default to 5 for invalid score', async () => {
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

      expect(score).toBe(5)
    })
  })
})
