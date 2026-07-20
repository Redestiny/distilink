import { db } from '@/db'
import { Agent, agents, posts, comments, Comment } from '@/db/schema'
import { eq, sql, and, ne, inArray, asc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generateThreadedComment, generateThreadReply, ThreadCommentEntry } from './llm'

// Reddit-style threads: an agent stops continuing a back-and-forth once the
// chain reaches this depth, so two agents can't ping-pong forever.
const MAX_THREAD_DEPTH = 6
// How many recent comments of a post the LLM sees when deciding where to reply.
const THREAD_CONTEXT_COMMENTS = 12
// How many recent replies to the agent's own comments are considered per run.
const THREAD_REPLY_CANDIDATES = 10

export interface CommentActionResult {
  status: 'created' | 'skipped' | 'failed'
  commentId?: string
  postId?: string
  parentId?: string | null
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

async function getAgentNameMap(agentIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(agentIds))
  if (uniqueIds.length === 0) {
    return new Map()
  }

  const rows = await db
    .select({ agentId: agents.agentId, name: agents.name })
    .from(agents)
    .where(inArray(agents.agentId, uniqueIds))
    .all()

  return new Map(rows.map((row) => [row.agentId, row.name]))
}

// Walks parentId links from a comment up to the top-level comment.
// Returns the chain oldest → newest (root first, the given comment last).
function buildAncestorChain(comment: Comment, postComments: Comment[]): Comment[] {
  const byId = new Map(postComments.map((c) => [c.commentId, c]))
  const chain: Comment[] = [comment]
  const visited = new Set([comment.commentId])

  let current = comment
  while (current.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent || visited.has(parent.commentId)) {
      break
    }
    chain.unshift(parent)
    visited.add(parent.commentId)
    current = parent
  }

  return chain
}

// Branch A: continue a thread where someone replied to one of this agent's
// comments (the Reddit-style back-and-forth that creates deep 楼中楼 chains).
// Returns null when there is nothing to reply to or the agent declines, so the
// caller falls through to commenting on a fresh post.
async function tryThreadReply(
  agent: Pick<Agent, 'agentId' | 'name' | 'userId'>,
  options: RunSingleCommentActionOptions
): Promise<CommentActionResult | null> {
  const { allowEnvFallback = true } = options

  const myComments = await db
    .select()
    .from(comments)
    .where(eq(comments.agentId, agent.agentId))
    .orderBy(sql`${comments.createdAt} DESC`)
    .limit(50)
    .all()

  if (myComments.length === 0) {
    return null
  }

  // Recent replies from others to this agent's comments; stale replies
  // (older than a day) are left alone like on any real forum.
  const replies = await db
    .select()
    .from(comments)
    .where(
      and(
        inArray(comments.parentId, myComments.map((c) => c.commentId)),
        ne(comments.agentId, agent.agentId),
        sql`datetime(${comments.createdAt}) >= datetime('now', '-1 day')`
      )
    )
    .orderBy(sql`${comments.createdAt} DESC`)
    .limit(THREAD_REPLY_CANDIDATES)
    .all()

  for (const reply of replies) {
    const alreadyAnswered = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.parentId, reply.commentId),
          eq(comments.agentId, agent.agentId)
        )
      )
      .get()

    if (alreadyAnswered) {
      continue
    }

    const post = await db
      .select()
      .from(posts)
      .where(eq(posts.postId, reply.postId))
      .get()

    if (!post) {
      continue
    }

    const postComments = await db
      .select()
      .from(comments)
      .where(eq(comments.postId, reply.postId))
      .all()

    const chain = buildAncestorChain(reply, postComments)
    if (chain.length >= MAX_THREAD_DEPTH) {
      continue
    }

    const nameMap = await getAgentNameMap(chain.map((c) => c.agentId))
    const thread = chain.map((c) => ({
      authorName: c.agentId === agent.agentId ? '你' : (nameMap.get(c.agentId) ?? '匿名'),
      content: c.content,
    }))

    const replyContent = await generateThreadReply(
      agent.agentId,
      {
        postContent: post.content,
        postTopic: post.topic,
        thread,
      },
      {
        allowEnvFallback,
        userId: agent.userId,
      }
    )

    if (!replyContent) {
      console.log(`[Comment Action] Agent ${agent.name} chose not to continue thread on post ${reply.postId}`)
      return null
    }

    const commentId = uuidv4()
    db.insert(comments).values({
      commentId,
      postId: reply.postId,
      parentId: reply.commentId,
      agentId: agent.agentId,
      content: replyContent.slice(0, 200),
    }).run()

    console.log(`[Comment Action] Agent ${agent.name} replied in thread on post ${reply.postId}`)

    return {
      status: 'created',
      commentId,
      postId: reply.postId,
      parentId: reply.commentId,
    }
  }

  return null
}

export async function runSingleCommentAction(
  agent: Pick<Agent, 'agentId' | 'name' | 'userId'>,
  options: RunSingleCommentActionOptions = {}
): Promise<CommentActionResult> {
  const { allowEnvFallback = true } = options

  try {
    // Branch A: answer fresh replies to this agent's own comments first.
    const threadResult = await tryThreadReply(agent, options)
    if (threadResult) {
      return threadResult
    }

    // Branch B: pick a post the agent hasn't participated in yet.
    const recentPosts = await getRecentCandidatePosts(agent.agentId)
    if (recentPosts.length === 0) {
      return {
        status: 'skipped',
        reason: 'no posts available to comment on',
      }
    }

    // Walk the candidate posts (newest first) and pick the first one this agent
    // hasn't commented on yet, so older posts still get attention instead of
    // every agent piling onto the single newest post.
    let post: (typeof recentPosts)[number] | null = null
    for (const candidate of recentPosts) {
      const existingComment = await hasCommentedOnPost(agent.agentId, candidate.postId)
      if (!existingComment) {
        post = candidate
        break
      }
    }

    if (!post) {
      console.log(`[Comment Action] Agent ${agent.name} already commented on all candidate posts`)
      return {
        status: 'skipped',
        reason: 'agent already commented on all candidate posts',
      }
    }

    // Show the agent the existing discussion so it can join a sub-thread
    // (楼中楼) instead of always commenting at the top level.
    const postComments = await db
      .select()
      .from(comments)
      .where(eq(comments.postId, post.postId))
      .orderBy(asc(comments.createdAt))
      .all()

    const recentComments = postComments.slice(-THREAD_CONTEXT_COMMENTS)
    const nameMap = await getAgentNameMap(recentComments.map((c) => c.agentId))
    const indexByCommentId = new Map(
      recentComments.map((c, i) => [c.commentId, i + 1])
    )
    const commentEntries: ThreadCommentEntry[] = recentComments.map((c, i) => ({
      index: i + 1,
      authorName: nameMap.get(c.agentId) ?? '匿名',
      content: c.content,
      replyToIndex: c.parentId ? indexByCommentId.get(c.parentId) : undefined,
    }))

    const decision = await generateThreadedComment(
      agent.agentId,
      {
        postContent: post.content,
        postTopic: post.topic,
        comments: commentEntries,
      },
      {
        allowEnvFallback,
        userId: agent.userId,
      }
    )

    if (!decision) {
      console.log(`[Comment Action] Agent ${agent.name} chose not to comment`)
      return {
        status: 'skipped',
        postId: post.postId,
        reason: 'agent chose not to comment',
      }
    }

    const parentId = decision.target === 'post'
      ? null
      : recentComments[decision.target - 1].commentId

    const truncatedContent = decision.content.slice(0, 200)
    const commentId = uuidv4()

    db.insert(comments).values({
      commentId,
      postId: post.postId,
      parentId,
      agentId: agent.agentId,
      content: truncatedContent,
    }).run()

    console.log(`[Comment Action] Agent ${agent.name} commented on post ${post.postId}${parentId ? ' (in thread)' : ''}: ${truncatedContent.slice(0, 50)}...`)

    return {
      status: 'created',
      commentId,
      postId: post.postId,
      parentId,
    }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'comment action failed',
    }
  }
}
