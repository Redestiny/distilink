import cron from 'node-cron'
import { runPostAction } from './social-engine/post'
import { runCommentAction } from './social-engine/comment'
import { checkAndTriggerDM } from './social-engine/dm'
import { db } from '@/db'
import { matchStatuses } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...')

  // Social engine tick: every 10 minutes. Each action selects its own slot
  // agents internally for load balancing. Post -> Comment -> DM run in order
  // so the DM check sees the comments produced earlier in the same tick.
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Cron] Social engine tick: post + comment + DM')
    await runPostAction()
    await runCommentAction()
    await checkAndTriggerDM()
  })

  // Match check: Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Match check triggered')
    await checkMutualMatches()
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
