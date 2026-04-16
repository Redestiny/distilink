import { db } from '@/db'
import { Agent, agents, posts } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generatePost } from './llm'
import { topics } from '../prompts'

export interface PostActionResult {
  status: 'created' | 'skipped' | 'failed'
  postId?: string
  reason?: string
}

interface RunSinglePostActionOptions {
  ignoreRecentPost?: boolean
  allowEnvFallback?: boolean
}

export async function runPostAction() {
  console.log('[Post Action] Starting...')

  try {
    // Get current hour block (0-143 slots, 10 min each = 144 per day)
    const now = new Date()
    const minuteOfDay = now.getHours() * 60 + now.getMinutes()
    const currentSlot = Math.floor(minuteOfDay / 10) // 0-143

    // Get all agents
    const allAgents = await db.select().from(agents).all()

    if (allAgents.length === 0) {
      console.log('[Post Action] No agents found')
      return
    }

    // Filter agents whose slot matches current slot
    const slotAgents = allAgents.filter(
      (agent) => agent.slot % 12 === currentSlot % 12
    )

    // If fewer than 10 agents in this slot, post all; otherwise select 20%
    const MIN_AGENTS_FOR_SAMPLING = 10
    const selectedAgents =
      slotAgents.length <= MIN_AGENTS_FOR_SAMPLING
        ? slotAgents
        : slotAgents
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.max(1, Math.floor(slotAgents.length * 0.2)))

    console.log(`[Post Action] Selected ${selectedAgents.length} agents for posting`)

    for (const agent of selectedAgents) {
      const result = await runSinglePostAction(agent)
      if (result.status === 'failed') {
        console.error(`[Post Action] Error for agent ${agent.name}: ${result.reason}`)
      }
    }

    console.log('[Post Action] Completed')
  } catch (error) {
    console.error('[Post Action] Error:', error)
  }
}

async function getRecentPost(agentId: string) {
  return db
    .select()
    .from(posts)
    .where(eq(posts.agentId, agentId))
    .orderBy(sql`${posts.createdAt} DESC`)
    .limit(1)
    .get()
}

function hasPostedRecently(recentPost?: { createdAt?: string | null }) {
  if (!recentPost?.createdAt) {
    return false
  }

  const hoursSincePost =
    (Date.now() - new Date(recentPost.createdAt).getTime()) / 3600000

  return hoursSincePost < 12
}

export async function runSinglePostAction(
  agent: Pick<Agent, 'agentId' | 'name' | 'userId'>,
  options: RunSinglePostActionOptions = {}
): Promise<PostActionResult> {
  const { ignoreRecentPost = false, allowEnvFallback = true } = options

  try {
    if (!ignoreRecentPost) {
      const recentPost = await getRecentPost(agent.agentId)
      if (hasPostedRecently(recentPost)) {
        console.log(`[Post Action] Agent ${agent.name} posted recently, skipping`)
        return {
          status: 'skipped',
          reason: 'agent posted within last 12 hours',
        }
      }
    }

    const topic = topics[Math.floor(Math.random() * topics.length)]
    const content = await generatePost(agent.agentId, topic, {
      allowEnvFallback,
      userId: agent.userId,
    })

    if (!content || content.length === 0) {
      console.log(`[Post Action] Empty content from agent ${agent.name}`)
      return {
        status: 'skipped',
        reason: 'empty post content',
      }
    }

    const truncatedContent = content.slice(0, 100)
    const postId = uuidv4()

    db.insert(posts).values({
      postId,
      agentId: agent.agentId,
      content: truncatedContent,
      topic,
    }).run()

    console.log(`[Post Action] Agent ${agent.name} posted: ${truncatedContent.slice(0, 50)}...`)

    return {
      status: 'created',
      postId,
    }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'post action failed',
    }
  }
}
