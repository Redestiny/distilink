import { db } from '@/db'
import { Agent, agents, posts, comments } from '@/db/schema'
import { eq, sql, and, ne } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generateComment } from './llm'

export interface CommentActionResult {
  status: 'created' | 'skipped' | 'failed'
  commentId?: string
  postId?: string
  reason?: string
}

interface RunSingleCommentActionOptions {
  allowEnvFallback?: boolean
}

export async function runCommentAction() {
  console.log('[Comment Action] Starting...')

  try {
    // Get all agents
    const allAgents = await db.select().from(agents).all()

    if (allAgents.length === 0) {
      console.log('[Comment Action] No agents found')
      return
    }

    // Get current slot (0-143, reset daily)
    const now = new Date()
    const minuteOfDay = now.getHours() * 60 + now.getMinutes()
    const currentSlot = Math.floor(minuteOfDay / 10)

    // Get agents for this slot
    const slotAgents = allAgents.filter(
      (agent) => agent.slot % 12 === currentSlot % 12
    )

    console.log(`[Comment Action] Processing ${slotAgents.length} agents`)

    for (const agent of slotAgents) {
      const result = await runSingleCommentAction(agent)
      if (result.status === 'failed') {
        console.error(`[Comment Action] Error for agent ${agent.name}: ${result.reason}`)
      }
    }

    console.log('[Comment Action] Completed')
  } catch (error) {
    console.error('[Comment Action] Error:', error)
  }
}

async function getRecentCandidatePosts(agentId: string) {
  return db
    .select()
    .from(posts)
    .where(ne(posts.agentId, agentId))
    .orderBy(sql`${posts.createdAt} DESC`)
    .limit(20)
    .all()
}

async function hasCommentedOnPost(agentId: string, postId: string) {
  return db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.postId, postId),
        eq(comments.agentId, agentId)
      )
    )
    .get()
}

export async function runSingleCommentAction(
  agent: Pick<Agent, 'agentId' | 'name' | 'userId'>,
  options: RunSingleCommentActionOptions = {}
): Promise<CommentActionResult> {
  const { allowEnvFallback = true } = options

  try {
    const recentPosts = await getRecentCandidatePosts(agent.agentId)
    if (recentPosts.length === 0) {
      return {
        status: 'skipped',
        reason: 'no posts available to comment on',
      }
    }

    const post = recentPosts[0]
    if (!post) {
      return {
        status: 'skipped',
        reason: 'no posts available to comment on',
      }
    }

    const existingComment = await hasCommentedOnPost(agent.agentId, post.postId)
    if (existingComment) {
      console.log(`[Comment Action] Agent ${agent.name} already commented on post ${post.postId}`)
      return {
        status: 'skipped',
        postId: post.postId,
        reason: 'agent already commented on post',
      }
    }

    const commentContent = await generateComment(
      agent.agentId,
      post.content,
      post.topic,
      {
        allowEnvFallback,
        userId: agent.userId,
      }
    )

    if (!commentContent) {
      console.log(`[Comment Action] Agent ${agent.name} chose not to comment`)
      return {
        status: 'skipped',
        postId: post.postId,
        reason: 'agent chose not to comment',
      }
    }

    const truncatedContent = commentContent.slice(0, 200)
    const commentId = uuidv4()

    db.insert(comments).values({
      commentId,
      postId: post.postId,
      agentId: agent.agentId,
      content: truncatedContent,
    }).run()

    console.log(`[Comment Action] Agent ${agent.name} commented on post ${post.postId}: ${truncatedContent.slice(0, 50)}...`)

    return {
      status: 'created',
      commentId,
      postId: post.postId,
    }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'comment action failed',
    }
  }
}
