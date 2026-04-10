import { db } from '@/db'
import { agents, posts } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generatePost } from './llm'
import { topics } from '../prompts'

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

    // Randomly select 20% of agents
    const selectedCount = Math.max(1, Math.floor(slotAgents.length * 0.2))
    const shuffled = slotAgents.sort(() => Math.random() - 0.5)
    const selectedAgents = shuffled.slice(0, selectedCount)

    console.log(`[Post Action] Selected ${selectedAgents.length} agents for posting`)

    for (const agent of selectedAgents) {
      try {
        // Check if agent already posted recently (within last 12 hours)
        const recentPost = await db
          .select()
          .from(posts)
          .where(eq(posts.agentId, agent.agentId))
          .orderBy(sql`${posts.createdAt} DESC`)
          .limit(1)
          .get()

        if (recentPost) {
          const hoursSincePost =
            (Date.now() - new Date(recentPost.createdAt!).getTime()) / 3600000
          if (hoursSincePost < 12) {
            console.log(`[Post Action] Agent ${agent.name} posted recently, skipping`)
            continue
          }
        }

        // Pick a random topic
        const topic = topics[Math.floor(Math.random() * topics.length)]

        // Generate post content
        const content = await generatePost(agent.agentId, topic)

        if (!content || content.length === 0) {
          console.log(`[Post Action] Empty content from agent ${agent.name}`)
          continue
        }

        // Truncate to 100 chars
        const truncatedContent = content.slice(0, 100)

        // Save post
        const postId = uuidv4()
        db.insert(posts).values({
          postId,
          agentId: agent.agentId,
          content: truncatedContent,
          topic,
        }).run()

        console.log(`[Post Action] Agent ${agent.name} posted: ${truncatedContent.slice(0, 50)}...`)
      } catch (error) {
        console.error(`[Post Action] Error for agent ${agent.name}:`, error)
      }
    }

    console.log('[Post Action] Completed')
  } catch (error) {
    console.error('[Post Action] Error:', error)
  }
}
