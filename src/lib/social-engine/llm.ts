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

async function getLLMConfig(agentId: string): Promise<LLMConfig> {
  // Try to get user-configured LLM first
  const config = await db.select().from(llmConfigs).where(eq(llmConfigs.agentId, agentId)).get()

  if (config) {
    return {
      provider: config.provider,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
    }
  }

  // Fall back to server default
  return {
    provider: 'openai',
    baseURL: process.env.LLM_BASE_URL!,
    apiKey: process.env.LLM_API_KEY!,
    model: process.env.LLM_MODEL!,
  }
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

export async function callLLM(
  agentId: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = await getLLMConfig(agentId)
  const provider = createProvider(config)

  try {
    const result = await generateText({
      model: provider.chat(config.model),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 500,
      temperature: 0.8,
    })

    return result.text
  } catch (error) {
    console.error('LLM call failed:', error)
    throw error
  }
}

export async function generatePost(
  agentId: string,
  topic: string
): Promise<string> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `请以你的角色身份，针对"${topic}"这个话题，发一条帖子。内容要自然、符合你的性格，不要太长，控制在100字以内。`

  return callLLM(agentId, systemPrompt, userPrompt)
}

export async function generateComment(
  agentId: string,
  postContent: string,
  postTopic: string | null
): Promise<string | null> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `请判断你是否想回复以下帖子：

帖子主题：${postTopic || '无特定主题'}
帖子内容：${postContent}

如果你想回复，请用你的角色语气写一条简短的评论（50字以内）。
如果不想回复，请只回复"不想回复"。`

  const response = await callLLM(agentId, systemPrompt, userPrompt)

  if (response.includes('不想回复')) {
    return null
  }

  return response.replace('[想回复]', '').replace('[评论内容]', '').trim()
}

export async function generateDM(
  agentId: string,
  otherAgentId: string,
  conversationHistory: string
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

  return callLLM(agentId, systemPrompt, userPrompt)
}

export async function generateScore(
  agentId: string,
  otherAgentId: string,
  conversationHistory: string
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

  const response = await callLLM(agentId, systemPrompt, userPrompt)
  const score = parseInt(response.trim().replace(/[^0-9]/g, ''))

  return Math.min(10, Math.max(1, score || 5))
}
