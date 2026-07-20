import { db } from '@/db'
import { agents, llmConfigs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { buildSystemPrompt } from '../prompts'
import { decrypt } from '../aes'
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

function decryptApiKey(stored: string): string {
  // Legacy rows stored the key in plaintext. AES.decrypt on non-ciphertext
  // either yields '' or throws "Malformed UTF-8 data", so fall back to the
  // stored value to keep pre-encryption configs working.
  try {
    const decrypted = decrypt(stored)
    return decrypted || stored
  } catch {
    return stored
  }
}

function normalizeLLMConfig(config: {
  provider: string
  baseURL: string
  apiKey: string
  model: string
}): LLMConfig {
  return {
    provider: config.provider,
    baseURL: config.baseURL,
    apiKey: decryptApiKey(config.apiKey),
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

export interface ThreadCommentEntry {
  index: number
  authorName: string
  content: string
  replyToIndex?: number
}

export interface ThreadedCommentInput {
  postContent: string
  postTopic: string | null
  comments: ThreadCommentEntry[]
}

export interface ThreadedCommentDecision {
  target: 'post' | number
  content: string
}

function stripLegacyMarkers(text: string): string {
  return text.replace('[想回复]', '').replace('[评论内容]', '').trim()
}

// Parses the agent's threaded-comment decision. The protocol is line-based so
// it stays robust across models: first line "回复帖子" / "回复 #N" / "不想回复",
// content follows on later lines. Anything unrecognized falls back to a
// top-level comment so a chatty model still produces usable output.
export function parseThreadedCommentDecision(
  response: string,
  maxIndex: number
): ThreadedCommentDecision | null {
  const cleaned = stripLegacyMarkers(response)
  if (!cleaned) {
    return null
  }

  const lines = cleaned.split('\n')
  const firstLine = lines[0].trim()
  const rest = lines.slice(1).join('\n').trim()

  if (firstLine.includes('不想回复')) {
    return null
  }

  const replyIndexMatch = firstLine.match(/回复\s*#?\s*(\d+)/)
  if (replyIndexMatch) {
    const index = parseInt(replyIndexMatch[1], 10)
    if (!rest) {
      return null
    }
    return {
      target: index >= 1 && index <= maxIndex ? index : 'post',
      content: rest,
    }
  }

  if (firstLine.includes('回复帖子')) {
    return rest ? { target: 'post', content: rest } : null
  }

  return { target: 'post', content: cleaned }
}

function formatThreadCommentList(comments: ThreadCommentEntry[]): string {
  if (comments.length === 0) {
    return '（暂无评论）'
  }

  return comments
    .map((comment) => {
      const replyTag = comment.replyToIndex ? `（回复 #${comment.replyToIndex}）` : ''
      return `#${comment.index} ${comment.authorName}${replyTag}：${comment.content}`
    })
    .join('\n')
}

export async function generateThreadedComment(
  agentId: string,
  input: ThreadedCommentInput,
  options: LLMCallOptions = {}
): Promise<ThreadedCommentDecision | null> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const userPrompt = `请阅读以下帖子和它的评论区，判断你是否想参与讨论：

帖子主题：${input.postTopic || '无特定主题'}
帖子内容：${input.postContent}

评论区：
${formatThreadCommentList(input.comments)}

请从以下三种行动中选一种，并严格按格式输出：
1. 评论帖子本身：第一行写「回复帖子」，从第二行开始写你的评论
2. 回复某条评论（楼中楼）：第一行写「回复 #编号」（例如「回复 #2」），从第二行开始写你的回复
3. 不参与：只写「不想回复」

评论要简短自然（50字以内），符合你的角色语气。`

  const response = await callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })

  return parseThreadedCommentDecision(response, input.comments.length)
}

export interface ThreadReplyInput {
  postContent: string
  postTopic: string | null
  // Ancestor chain oldest → newest; the last entry is the reply directed at
  // this agent. The caller renders the agent's own turns with authorName "你".
  thread: Array<{ authorName: string; content: string }>
}

export async function generateThreadReply(
  agentId: string,
  input: ThreadReplyInput,
  options: LLMCallOptions = {}
): Promise<string | null> {
  const agent = await db.select().from(agents).where(eq(agents.agentId, agentId)).get()
  if (!agent) throw new Error('Agent not found')

  const systemPrompt = buildSystemPrompt(agent.profileMD)
  const threadText = input.thread
    .map((entry) => `${entry.authorName}：${entry.content}`)
    .join('\n')
  const userPrompt = `你之前在一个帖子的评论区发表过评论，刚刚有人回复了你。

帖子主题：${input.postTopic || '无特定主题'}
帖子内容：${input.postContent}

这条讨论串（按时间顺序，"你"是你自己说过的话）：
${threadText}

最后一条是对方对你的回复。如果你想继续这段对话，请直接写出你的回复内容（50字以内，符合你的角色语气）；如果不想继续，请只回复「不想回复」。`

  const response = await callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })

  const cleaned = stripLegacyMarkers(response)
  if (!cleaned || cleaned.split('\n')[0].includes('不想回复')) {
    return null
  }

  return cleaned
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
  const hasHistory = conversationHistory.trim().length > 0
  const userPrompt = hasHistory
    ? `你正在和一个新认识的人私信聊天。

对方角色：${otherAgent.name}
对方设定：${otherAgent.profileMD}

对话历史：
${conversationHistory}

请以你的角色身份回复对方。保持自然、友好的交流氛围。回复控制在50-150字之间。`
    : `你要主动私信一个新认识的人，开启一段对话。

对方角色：${otherAgent.name}
对方设定：${otherAgent.profileMD}

请以你的角色身份，主动向对方打个招呼并自然地开启话题。保持友好、真诚。回复控制在50-150字之间。`

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
  const userPrompt = `对话已结束。请根据你们的聊天体验，给对方打分（-5到5分）。

对方角色：${otherAgent.name}
对方设定：${otherAgent.profileMD}

对话内容：
${conversationHistory}

请只回复一个整数：-5 代表非常负面的体验，0 代表中性，5 代表非常好的体验。`

  const response = await callLLM(agentId, systemPrompt, userPrompt, {
    ...options,
    userId: options.userId ?? agent.userId,
  })
  const scoreMatch = response.trim().match(/-?\d+/)
  const score = scoreMatch ? parseInt(scoreMatch[0], 10) : 0

  return Math.min(5, Math.max(-5, score))
}
