import { db } from '@/db'
import { agents, llmConfigs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { buildSystemPrompt } from '../prompts'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

interface LLMConfig {
  provider: string
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMResolveOptions {
  allowEnvFallback?: boolean
  userId?: string
}

export interface LLMCallOptions extends LLMResolveOptions {}

function normalizeLLMConfig(config: {
  provider: string
  baseURL: string
  apiKey: string
  model: string
}): LLMConfig {
  return {
    provider: config.provider,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
  }
}

function getEnvLLMConfig(): LLMConfig | null {
  const baseURL = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!baseURL || !apiKey || !model) {
    return null
  }

  return {
    provider: 'openai',
    baseURL,
    apiKey,
    model,
  }
}

export async function resolveLLMConfig(
  agentId: string,
  options: LLMResolveOptions = {}
): Promise<LLMConfig> {
  const { allowEnvFallback = true, userId } = options

  const agentConfig = await db.select().from(llmConfigs).where(eq(llmConfigs.agentId, agentId)).get()
  if (agentConfig) {
    return normalizeLLMConfig(agentConfig)
  }

  let resolvedUserId = userId
  if (!resolvedUserId) {
    const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
    resolvedUserId = agent?.userId
  }

  if (resolvedUserId) {
    const userConfigs = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, resolvedUserId)).all()
    const genericConfig = userConfigs.find((config) => config.agentId == null)

    if (genericConfig) {
      return normalizeLLMConfig(genericConfig)
    }
  }

  const envConfig = getEnvLLMConfig()
  if (allowEnvFallback && envConfig) {
    return envConfig
  }

  throw new Error('LLM config not found')
}

function createProvider(config: LLMConfig) {
  if (config.provider === 'anthropic') {
    return createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
  }
  // Default to OpenAI compatible
  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })
}

export async function testLLMConnection(config: LLMConfig): Promise<void> {
  const provider = createProvider(config)

  await generateText({
    model: provider.chat(config.model),
    system: 'You are a connection test assistant.',
    prompt: 'Reply with exactly: OK',
    maxOutputTokens: 50,
    temperature: 0,
  })
}

export async function callLLM(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const config = await resolveLLMConfig(agentId, options)
  const provider = createProvider(config)

  try {
    const result = await generateText({
      model: provider.chat(config.model),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 5000,
      temperature: 0.8,
    })

    // Log only safe metadata fields to avoid leaking prompts/content to logs
    console.log('[LLM] Response:', {
      finishReason: result.finishReason,
      textLength: result.text?.length,
    })

    if (!result.text || result.text.length === 0) {
      const reason = result.finishReason || 'unknown'
      console.error(`[LLM] Empty response, finishReason: ${reason}`)
      throw new Error(`LLM returned empty response, finishReason: ${reason}`)
    }

    return result.text
  } catch (error) {
    console.error('LLM call failed:', error)
    throw error
  }
}

export async function generatePost(
  agentId: string,
  topic: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `请以你的角色身份，针对"${topic}"这个话题，发一条帖子。内容要自然、符合你的性格，不要太长，控制在100字以内。`

  return callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })
}

export async function generateComment(
  agentId: string,
  postContent: string,
  postTopic: string | null,
  options: LLMCallOptions = {}
): Promise<string | null> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `请判断你是否想回复以下帖子：

帖子主题：${postTopic || '无特定主题'}
帖子内容：${postContent}

如果你想回复，请用你的角色语气写一条简短的评论（50字以内）。
如果不想回复，请只回复"不想回复"。`

  const response = await callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })

  if (response.includes('不想回复')) {
    return null
  }

  return response.replace('[想回复]', '').replace('[评论内容]', '').trim()
}

export async function generateDM(
  agentId: string,
  otherAgentId: string,
  conversationHistory: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  const otherAgent = await db.select().from(agents).where(eq(agents.agentId, otherAgentId)).get()

  if (!agent || !otherAgent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `你正在和一个新认识的人私信聊天。

对方角色：${otherAgent.name}
对方设定：${otherAgent.profileMD}

对话历史：
${conversationHistory}

请以你的角色身份回复对方。保持自然、友好的交流氛围。回复控制在50-150字之间。`

  return callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })
}

export async function generateScore(
  agentId: string,
  otherAgentId: string,
  conversationHistory: string,
  options: LLMCallOptions = {}
): Promise<number> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  const otherAgent = await db.select().from(agents).where(eq(agents.agentId, otherAgentId)).get()

  if (!agent || !otherAgent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `对话已结束。请根据你们的聊天体验，给对方打分（1-10分）。

对方角色：${otherAgent.name}
对方设定：${otherAgent.profileMD}

对话内容：
${conversationHistory}

只回复一个1-10的数字即可。`

  const response = await callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })
  const score = parseInt(response.trim().replace(/[^0-9]/g, ''))

  return Math.min(10, Math.max(1, score || 5))
}
