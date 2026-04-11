import { db } from '@/db'
import { agents, posts, comments, interactionLogs, relationshipScores } from '@/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generateDM, generateScore } from './llm'

export async function checkAndTriggerDM() {
  console.log('[DM Action] Checking for DM triggers...')

  try {
    // Find agent pairs who have mutual comments on the same post
    // Group comments by (postId, agentId)
    const allComments = await db.select().from(comments).all()

    // Count comments per agent per post
    const commentCounts: Record<string, Record<string, number>> = {}
    for (const comment of allComments) {
      if (!commentCounts[comment.postId]) {
        commentCounts[comment.postId] = {}
      }
      commentCounts[comment.postId][comment.agentId] =
        (commentCounts[comment.postId][comment.agentId] || 0) + 1
    }

    // Find pairs with 2+ mutual comments on same post
    const triggerPairs: Array<{ postId: string; agentA: string; agentB: string }> = []

    for (const postId of Object.keys(commentCounts)) {
      const agentsOnPost = Object.keys(commentCounts[postId])
      for (let i = 0; i < agentsOnPost.length; i++) {
        for (let j = i + 1; j < agentsOnPost.length; j++) {
          const agentA = agentsOnPost[i]
          const agentB = agentsOnPost[j]
          const countA = commentCounts[postId][agentA]
          const countB = commentCounts[postId][agentB]

          if (countA >= 1 && countB >= 1) {
            // At least 1 comment each on same post triggers DM
            triggerPairs.push({ postId, agentA, agentB })
          }
        }
      }
    }

    console.log(`[DM Action] Found ${triggerPairs.length} potential DM pairs`)

    for (const pair of triggerPairs) {
      await runDMSession(pair.agentA, pair.agentB)
    }

    console.log('[DM Action] Completed')
  } catch (error) {
    console.error('[DM Action] Error:', error)
  }
}

async function runDMSession(agentAId: string, agentBId: string) {
  try {
    // Check if DM already exists between these agents
    const existingDM = await db
      .select()
      .from(interactionLogs)
      .where(
        and(
          eq(interactionLogs.type, 'DM'),
          eq(interactionLogs.agentA, agentAId),
          eq(interactionLogs.agentB, agentBId)
        )
      )
      .limit(1)
      .get()

    if (existingDM) {
      console.log(`[DM Action] DM already exists between ${agentAId} and ${agentBId}`)
      return
    }

    console.log(`[DM Action] Starting DM session between ${agentAId} and ${agentBId}`)

    const agentA = await db.select().from(agents).where(eq(agents.agentId, agentAId)).get()
    const agentB = await db.select().from(agents).where(eq(agents.agentId, agentBId)).get()

    if (!agentA || !agentB) {
      console.error('[DM Action] Agent not found')
      return
    }

    const ROUNDS = 8 // 5-10 rounds
    let conversationHistory = ''
    let lastMessageA = ''
    let lastMessageB = ''

    // Alternating DM conversation
    for (let round = 0; round < ROUNDS; round++) {
      // Agent A speaks
      const messageA = await generateDM(
        agentAId,
        agentBId,
        conversationHistory || `你好，很高兴认识你！`
      )
      lastMessageA = messageA

      // Save to interaction log
      db.insert(interactionLogs).values({
        actionId: uuidv4(),
        type: 'DM',
        agentA: agentAId,
        agentB: agentBId,
        content: messageA,
      }).run()

      conversationHistory += `${agentA.name}: ${messageA}\n`
      console.log(`[DM Action] Round ${round + 1}A: ${agentA.name}: ${messageA.slice(0, 50)}...`)

      // Agent B responds
      const messageB = await generateDM(
        agentBId,
        agentAId,
        conversationHistory
      )
      lastMessageB = messageB

      db.insert(interactionLogs).values({
        actionId: uuidv4(),
        type: 'DM',
        agentA: agentBId,
        agentB: agentAId,
        content: messageB,
      }).run()

      conversationHistory += `${agentB.name}: ${messageB}\n`
      console.log(`[DM Action] Round ${round + 1}B: ${agentB.name}: ${messageB.slice(0, 50)}...`)
    }

    // Both agents score each other
    const scoreAtoB = await generateScore(agentAId, agentBId, conversationHistory)
    const scoreBtoA = await generateScore(agentBId, agentAId, conversationHistory)

    console.log(`[DM Action] Scores: ${agentA.name} -> ${agentB.name}: ${scoreAtoB}, ${agentB.name} -> ${agentA.name}: ${scoreBtoA}`)

    // Update relationship scores
    await updateRelationshipScore(agentAId, agentBId, scoreAtoB)
    await updateRelationshipScore(agentBId, agentAId, scoreBtoA)

    console.log(`[DM Action] DM session completed`)
  } catch (error) {
    console.error('[DM Action] DM session error:', error)
  }
}

async function updateRelationshipScore(agentA: string, agentB: string, score: number) {
  const existing = await db
    .select()
    .from(relationshipScores)
    .where(
      and(
        eq(relationshipScores.agentA, agentA),
        eq(relationshipScores.agentB, agentB)
      )
    )
    .get()

  if (existing) {
    db.update(relationshipScores)
      .set({
        score: (existing.score || 0) + score,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(relationshipScores.agentA, agentA),
          eq(relationshipScores.agentB, agentB)
        )
      )
      .run()
  } else {
    db.insert(relationshipScores).values({
      agentA,
      agentB,
      score,
    }).run()
  }
}
