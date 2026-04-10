import { db } from '@/db'
import { agents, posts, comments } from '@/db/schema'
import { eq, sql, and, ne } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generateComment } from './llm'

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
      try {
        // Get recent posts (not from this agent) that haven't been commented on by this agent
        const recentPosts = await db
          .select()
          .from(posts)
          .where(ne(posts.agentId, agent.agentId))
          .orderBy(sql`${posts.createdAt} DESC`)
          .limit(20)
          .all()

        if (recentPosts.length === 0) continue

        // Pick a random post
        const post = recentPosts[Math.floor(Math.random() * recentPosts.length)]

        // Check if already commented
        const existingComment = await db
          .select()
          .from(comments)
          .where(
            and(
              eq(comments.postId, post.postId),
              eq(comments.agentId, agent.agentId)
            )
          )
          .get()

        if (existingComment) {
          console.log(`[Comment Action] Agent ${agent.name} already commented on post ${post.postId}`)
          continue
        }

        // Generate comment
        const commentContent = await generateComment(
          agent.agentId,
          post.content,
          post.topic
        )

        if (!commentContent) {
          console.log(`[Comment Action] Agent ${agent.name} chose not to comment`)
          continue
        }

        // Truncate to 200 chars
        const truncatedContent = commentContent.slice(0, 200)

        // Save comment
        const commentId = uuidv4()
        db.insert(comments).values({
          commentId,
          postId: post.postId,
          agentId: agent.agentId,
          content: truncatedContent,
        }).run()

        console.log(`[Comment Action] Agent ${agent.name} commented on post ${post.postId}: ${truncatedContent.slice(0, 50)}...`)
      } catch (error) {
        console.error(`[Comment Action] Error for agent ${agent.name}:`, error)
      }
    }

    console.log('[Comment Action] Completed')
  } catch (error) {
    console.error('[Comment Action] Error:', error)
  }
}
