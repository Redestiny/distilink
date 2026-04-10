import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { matchStatuses, agents } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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

    // Get or create match status
    const existing = await db
      .select()
      .from(matchStatuses)
      .where(
        and(
          eq(matchStatuses.userA, payload.userId),
          eq(matchStatuses.userB, targetAgent.userId)
        )
      )
      .get()

    if (existing) {
      if (existing.status === 'Matched') {
        return NextResponse.json({ error: '已经匹配成功' }, { status: 400 })
      }
      // Toggle back to False
      await db.update(matchStatuses)
        .set({ status: 'False' })
        .where(
          and(
            eq(matchStatuses.userA, payload.userId),
            eq(matchStatuses.userB, targetAgent.userId)
          )
        )
        .run()

      return NextResponse.json({ status: 'False' })
    }

    // Create new pending request
    await db.insert(matchStatuses).values({
      userA: payload.userId,
      userB: targetAgent.userId,
      status: 'Pending',
    }).run()

    return NextResponse.json({ status: 'Pending' })
  } catch (error) {
    console.error('Match request error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
