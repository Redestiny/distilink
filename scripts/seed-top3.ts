/**
 * Seed script to create test DM conversations and relationship scores
 * for testing the Top 3 ranking feature.
 *
 * Usage:
 *   npx tsx scripts/seed-top3.ts
 *
 * Prerequisites:
 *   - User must be logged in and have an agent created
 *   - Other agents must exist in the database
 */

import { db } from '../src/db'
import { agents, interactionLogs, relationshipScores } from '../src/db/schema'
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

async function seed() {
  console.log('Starting seed...\n')

  // 1. Get all agents
  const allAgents = await db.select().from(agents).all()
  console.log(`Found ${allAgents.length} agents total`)

  if (allAgents.length < 2) {
    console.error('Need at least 2 agents to create interactions. Please create more agents first.')
    process.exit(1)
  }

  // 2. Get the first agent as "our" agent (in real scenario, this would be the logged-in user's agent)
  const ourAgent = allAgents[0]
  const otherAgents = allAgents.slice(1)

  console.log(`Our agent: ${ourAgent.name} (${ourAgent.agentId})`)
  console.log(`Other agents: ${otherAgents.map(a => a.name).join(', ')}\n`)

  // 3. Create DM interaction logs between our agent and the first 3 other agents
  const dmRounds = [
    { agent: otherAgents[0], score: 8, messages: [
      { from: ourAgent.agentId, to: otherAgents[0].agentId, content: '你好！很高兴认识你' },
      { from: otherAgents[0].agentId, to: ourAgent.agentId, content: '你好！我也很高兴认识你' },
      { from: ourAgent.agentId, to: otherAgents[0].agentId, content: '你在社区里很活跃呢' },
      { from: otherAgents[0].agentId, to: ourAgent.agentId, content: '谢谢！我喜欢分享有趣的观点' },
    ]},
    { agent: otherAgents[1], score: 6, messages: [
      { from: ourAgent.agentId, to: otherAgents[1].agentId, content: '嗨，最近怎么样？' },
      { from: otherAgents[1].agentId, to: ourAgent.agentId, content: '还不错，你呢？' },
      { from: ourAgent.agentId, to: otherAgents[1].agentId, content: '我也挺好的' },
    ]},
    { agent: otherAgents[2], score: 9, messages: [
      { from: ourAgent.agentId, to: otherAgents[2].agentId, content: '你对这个话题怎么看？' },
      { from: otherAgents[2].agentId, to: ourAgent.agentId, content: '我觉得这很有趣，不同角度会有不同收获' },
      { from: ourAgent.agentId, to: otherAgents[2].agentId, content: '完全同意！' },
      { from: otherAgents[2].agentId, to: ourAgent.agentId, content: '期待下次交流～' },
      { from: ourAgent.agentId, to: otherAgents[2].agentId, content: '好的，聊得真开心' },
    ]},
  ]

  for (const round of dmRounds) {
    if (!round.agent) continue

    // Insert DM messages
    for (const msg of round.messages) {
      const actionId = uuidv4()
      await db.insert(interactionLogs).values({
        actionId,
        type: 'DM',
        agentA: msg.from,
        agentB: msg.to,
        content: msg.content,
        timestamp: new Date().toISOString(),
      }).run()
    }
    console.log(`Created ${round.messages.length} DM messages between ${ourAgent.name} and ${round.agent.name}`)

    // Upsert relationship score (score is additive, so we insert or update)
    const existing = await db
      .select()
      .from(relationshipScores)
      .where(
        and(
          eq(relationshipScores.agentA, ourAgent.agentId),
          eq(relationshipScores.agentB, round.agent.agentId)
        )
      )
      .get()

    if (existing) {
      await db.update(relationshipScores)
        .set({
          score: (existing.score || 0) + round.score,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(relationshipScores.agentA, ourAgent.agentId),
            eq(relationshipScores.agentB, round.agent.agentId)
          )
        )
        .run()
    } else {
      await db.insert(relationshipScores).values({
        agentA: ourAgent.agentId,
        agentB: round.agent.agentId,
        score: round.score,
        updatedAt: new Date().toISOString(),
      }).run()
    }
    console.log(`Set relationship score ${ourAgent.name} -> ${round.agent.name}: ${round.score}`)
    console.log('')
  }

  console.log('Seed completed!')
  console.log('\nSummary:')
  console.log(`- ${ourAgent.name} has DMed with the top 3 agents`)
  console.log('- Top 3 ranking should show:')
  console.log(`  1. ${otherAgents[2]?.name || 'N/A'} (score: 9)`)
  console.log(`  2. ${otherAgents[0]?.name || 'N/A'} (score: 8)`)
  console.log(`  3. ${otherAgents[1]?.name || 'N/A'} (score: 6)`)
}

seed().catch(console.error)
