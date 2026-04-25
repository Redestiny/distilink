import { db } from '@/db'
import { agents, comments, interactionLogs, relationshipScores } from '@/db/schema'
import { desc, eq, and, or, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { generateDM, generateScore } from './llm'

interface TriggerPair {
  agentA: string
  agentB: string
  latestCommentAt: string | null
}

function getPairKey(agentA: string, agentB: string) {
  return [agentA, agentB].sort().join(':')
}

function parseTimestamp(value?: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) {
    return parsed
  }

  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const normalizedParsed = Date.parse(normalized)
  return Number.isNaN(normalizedParsed) ? Number.NEGATIVE_INFINITY : normalizedParsed
}

function getLatestTimestamp(left?: string | null, right?: string | null) {
  return parseTimestamp(left) >= parseTimestamp(right) ? (left ?? null) : (right ?? null)
}

function isTimestampAfter(left?: string | null, right?: string | null) {
  return parseTimestamp(left) > parseTimestamp(right)
}

function getTriggerPairs(allComments: Array<{ postId: string; agentId: string; createdAt?: string | null }>) {
  const commentsByPost: Record<string, Record<string, Array<{ createdAt?: string | null }>>> = {}

  for (const comment of allComments) {
    if (!commentsByPost[comment.postId]) {
      commentsByPost[comment.postId] = {}
    }
    if (!commentsByPost[comment.postId][comment.agentId]) {
      commentsByPost[comment.postId][comment.agentId] = []
    }
    commentsByPost[comment.postId][comment.agentId].push(comment)
  }

  const triggerPairsByKey = new Map<string, TriggerPair>()

  for (const postId of Object.keys(commentsByPost)) {
    const commentsByAgent = commentsByPost[postId]
    const agentsOnPost = Object.keys(commentsByAgent).sort()

    for (let i = 0; i < agentsOnPost.length; i++) {
      for (let j = i + 1; j < agentsOnPost.length; j++) {
        const agentA = agentsOnPost[i]
        const agentB = agentsOnPost[j]
        const agentAComments = commentsByAgent[agentA]
        const agentBComments = commentsByAgent[agentB]

        if (agentAComments.length === 0 || agentBComments.length === 0) {
          continue
        }

        const latestCommentAt = [...agentAComments, ...agentBComments].reduce<string | null>(
          (latest, comment) => getLatestTimestamp(latest, comment.createdAt),
          null
        )
        const pairKey = getPairKey(agentA, agentB)
        const existing = triggerPairsByKey.get(pairKey)

        if (!existing || isTimestampAfter(latestCommentAt, existing.latestCommentAt)) {
          triggerPairsByKey.set(pairKey, {
            agentA,
            agentB,
            latestCommentAt,
          })
        }
      }
    }
  }

  return Array.from(triggerPairsByKey.values())
}

async function getLatestDMTimestamp(agentAId: string, agentBId: string) {
  const latestDM = await db
    .select({ timestamp: interactionLogs.timestamp })
    .from(interactionLogs)
    .where(
      and(
        eq(interactionLogs.type, 'DM'),
        or(
          and(
            eq(interactionLogs.agentA, agentAId),
            eq(interactionLogs.agentB, agentBId),
          ),
          and(
            eq(interactionLogs.agentA, agentBId),
            eq(interactionLogs.agentB, agentAId),
          ),
        )
      )
    )
    .orderBy(desc(sql`COALESCE(datetime(${interactionLogs.timestamp}), ${interactionLogs.timestamp})`))
    .limit(1)
    .get()

  return latestDM?.timestamp ?? null
}

export async function checkAndTriggerDM() {
  console.log('[DM Action] Checking for DM triggers...')

  try {
    const allComments = await db.select().from(comments).all()
    const candidatePairs = getTriggerPairs(allComments)
    const triggerPairs: TriggerPair[] = []

    for (const pair of candidatePairs) {
      const latestDMAt = await getLatestDMTimestamp(pair.agentA, pair.agentB)
      if (!latestDMAt || isTimestampAfter(pair.latestCommentAt, latestDMAt)) {
        triggerPairs.push(pair)
      }
    }

    console.log(`[DM Action] Found ${triggerPairs.length} DM pairs with new mutual comments (${candidatePairs.length} potential pairs)`)

    for (const pair of triggerPairs) {
      await runDMSession(pair.agentA, pair.agentB, pair.latestCommentAt)
    }

    console.log('[DM Action] Completed')
  } catch (error) {
    console.error('[DM Action] Error:', error)
  }
}

async function runDMSession(agentAId: string, agentBId: string, latestCommentAt?: string | null) {
  try {
    const latestDMAt = await getLatestDMTimestamp(agentAId, agentBId)
    if (latestDMAt && !isTimestampAfter(latestCommentAt, latestDMAt)) {
      console.log(`[DM Action] No new mutual comments between ${agentAId} and ${agentBId}`)
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

    // Alternating DM conversation
    for (let round = 0; round < ROUNDS; round++) {
      // Agent A speaks
      const messageA = await generateDM(
        agentAId,
        agentBId,
        conversationHistory || `你好，很高兴认识你！`
      )

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
    let scoreAtoB: number | null = null
    try {
      scoreAtoB = await generateScore(agentAId, agentBId, conversationHistory)
    } catch (error) {
      console.error('[DM Action] Score A->B LLM call failed:', error)
    }

    let scoreBtoA: number | null = null
    try {
      scoreBtoA = await generateScore(agentBId, agentAId, conversationHistory)
    } catch (error) {
      console.error('[DM Action] Score B->A LLM call failed:', error)
    }

    console.log(`[DM Action] Scores: ${agentA.name} -> ${agentB.name}: ${scoreAtoB}, ${agentB.name} -> ${agentA.name}: ${scoreBtoA}`)

    // Update relationship scores
    if (scoreAtoB !== null) {
      await updateRelationshipScore(agentAId, agentBId, scoreAtoB)
    }
    if (scoreBtoA !== null) {
      await updateRelationshipScore(agentBId, agentAId, scoreBtoA)
    }

    console.log(`[DM Action] DM session completed`)
  } catch (error) {
    console.error('[DM Action] DM session error:', error)
  }
}

async function updateRelationshipScore(agentA: string, agentB: string, score: number) {
  if (score === 0) {
    return
  }

  const updatedAt = new Date().toISOString()

  await db.insert(relationshipScores).values({
      agentA,
      agentB,
      score,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [relationshipScores.agentA, relationshipScores.agentB],
      set: {
        score: sql`coalesce(${relationshipScores.score}, 0) + ${score}`,
        updatedAt,
      },
    })
    .run()
}
