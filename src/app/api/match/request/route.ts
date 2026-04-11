import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { matchStatuses, agents, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { decryptContact } from '@/lib/aes'

export const dynamic = 'force-dynamic'

async function getMatchedContact(targetUserId: string) {
  const targetUser = await db
    .select({ realContactInfoEncrypted: users.realContactInfoEncrypted })
    .from(users)
    .where(eq(users.userId, targetUserId))
    .get()

  if (!targetUser?.realContactInfoEncrypted) {
    return null
  }

  return decryptContact(targetUser.realContactInfoEncrypted)
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const payload = verifyJWT(token)
    if (!payload) {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 })
    }

    const { targetAgentId } = await request.json()

    if (!targetAgentId) {
      return NextResponse.json({ error: '缺少目标Agent' }, { status: 400 })
    }

    // Get target agent
    const targetAgent = await db.select().from(agents).where(eq(agents.agentId, targetAgentId)).get()
    if (!targetAgent) {
      return NextResponse.json({ error: '目标Agent不存在' }, { status: 404 })
    }

    if (targetAgent.userId === payload.userId) {
      return NextResponse.json({ error: '不能请求自己的 Agent' }, { status: 400 })
    }

    const getPairStatuses = async () => Promise.all([
      db
        .select()
        .from(matchStatuses)
        .where(
          and(
            eq(matchStatuses.userA, payload.userId),
            eq(matchStatuses.userB, targetAgent.userId)
          )
        )
        .get(),
      db
        .select()
        .from(matchStatuses)
        .where(
          and(
            eq(matchStatuses.userA, targetAgent.userId),
            eq(matchStatuses.userB, payload.userId)
          )
        )
        .get(),
    ])

    const promoteToMatched = async () => {
      const updatedAt = new Date().toISOString()

      await db.transaction(async (tx) => {
        await tx.insert(matchStatuses).values({
          userA: payload.userId,
          userB: targetAgent.userId,
          status: 'Matched',
          updatedAt,
        }).onConflictDoUpdate({
          target: [matchStatuses.userA, matchStatuses.userB],
          set: { status: 'Matched', updatedAt },
        }).run()

        await tx.insert(matchStatuses).values({
          userA: targetAgent.userId,
          userB: payload.userId,
          status: 'Matched',
          updatedAt,
        }).onConflictDoUpdate({
          target: [matchStatuses.userA, matchStatuses.userB],
          set: { status: 'Matched', updatedAt },
        }).run()
      })

      return NextResponse.json({
        status: 'Matched',
        matchedContact: await getMatchedContact(targetAgent.userId),
      })
    }

    const [existing, reverse] = await getPairStatuses()

    if (existing?.status === 'Matched' || reverse?.status === 'Matched') {
      return promoteToMatched()
    }

    if (existing?.status === 'Pending' && reverse?.status === 'Pending') {
      return promoteToMatched()
    }

    if (existing?.status === 'Pending') {
      return NextResponse.json({ status: 'Pending' })
    }

    const updatedAt = new Date().toISOString()

    if (existing) {
      await db.update(matchStatuses)
        .set({ status: 'Pending', updatedAt })
        .where(
          and(
            eq(matchStatuses.userA, payload.userId),
            eq(matchStatuses.userB, targetAgent.userId)
          )
        )
        .run()
    } else {
      await db.insert(matchStatuses).values({
        userA: payload.userId,
        userB: targetAgent.userId,
        status: 'Pending',
        updatedAt,
      }).onConflictDoUpdate({
        target: [matchStatuses.userA, matchStatuses.userB],
        set: { status: 'Pending', updatedAt },
      }).run()
    }

    const [, refreshedReverse] = await getPairStatuses()

    if (refreshedReverse?.status === 'Pending' || refreshedReverse?.status === 'Matched') {
      return promoteToMatched()
    }

    return NextResponse.json({ status: 'Pending' })
  } catch (error) {
    console.error('Match request error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
