import cron from 'node-cron'
import { runPostAction } from './social-engine/post'
import { runCommentAction } from './social-engine/comment'
import { checkAndTriggerDM } from './social-engine/dm'
import { db } from '@/db'
import { matchStatuses, relationshipScores } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { decryptContact } from './aes'

// Slot counter for load balancing
let currentSlot = 0

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...')

  // Post action: Every 10 minutes
  // We use slot-based approach within the job
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Cron] Post + Comment action triggered')
    currentSlot = (currentSlot + 1) % 144

    // Run post action
    await runPostAction()

    // Run comment action
    await runCommentAction()
  })

  // DM check: Every 10 minutes (after comment action has run)
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Cron] DM check triggered')
    await checkAndTriggerDM()
  })

  // Match check: Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Match check triggered')
    await checkMutualMatches()
  })

  // Daily reset: Midnight UTC
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Daily reset triggered')
    await resetWeeklyScores()
  })

  console.log('[Cron] All cron jobs scheduled')
}

async function checkMutualMatches() {
  try {
    // Find all Pending matches
    const pendingMatches = await db
      .select()
      .from(matchStatuses)
      .where(eq(matchStatuses.status, 'Pending'))
      .all()

    for (const match of pendingMatches) {
      // Check if there's a mutual pending
      const mutual = await db
        .select()
        .from(matchStatuses)
        .where(
          and(
            eq(matchStatuses.userA, match.userB),
            eq(matchStatuses.userB, match.userA),
            eq(matchStatuses.status, 'Pending')
          )
        )
        .get()

      if (mutual) {
        // Both want to match - set to Matched
        db.update(matchStatuses)
          .set({ status: 'Matched', updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(matchStatuses.userA, match.userA),
              eq(matchStatuses.userB, match.userB)
            )
          )
          .run()

        db.update(matchStatuses)
          .set({ status: 'Matched', updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(matchStatuses.userA, match.userB),
              eq(matchStatuses.userB, match.userA)
            )
          )
          .run()

        console.log(`[Match] Users ${match.userA} and ${match.userB} matched!`)
      }
    }
  } catch (error) {
    console.error('[Cron] Match check error:', error)
  }
}

async function resetWeeklyScores() {
  try {
    // In a production system, you'd archive or reset scores
    // For MVP, we'll just reset scores to 0
    const allScores = await db.select().from(relationshipScores).all()

    for (const score of allScores) {
      db.update(relationshipScores)
        .set({ score: 0, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(relationshipScores.agentA, score.agentA),
            eq(relationshipScores.agentB, score.agentB)
          )
        )
        .run()
    }

    console.log('[Cron] Weekly scores reset')
  } catch (error) {
    console.error('[Cron] Score reset error:', error)
  }
}
