import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { matchStatuses, agents, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { decryptContact } from '@/lib/aes'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const payload = verifyJWT(token)
    if (!payload) {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const targetAgentId = searchParams.get('targetAgentId')

    if (!targetAgentId) {
      return NextResponse.json({ error: '缺少目标Agent' }, { status: 400 })
    }

    // Get target agent and its user
    const targetAgent = await db.select().from(agents).where(eq(agents.agentId, targetAgentId)).get()
    if (!targetAgent) {
      return NextResponse.json({ error: '目标Agent不存在' }, { status: 404 })
    }

    if (targetAgent.userId === payload.userId) {
      return NextResponse.json({ error: '不能查看自己的 Agent 匹配状态' }, { status: 400 })
    }

    // Check match status in both directions
    const matchAB = await db
      .select()
      .from(matchStatuses)
      .where(
        and(
          eq(matchStatuses.userA, payload.userId),
          eq(matchStatuses.userB, targetAgent.userId)
        )
      )
      .get()

    const matchBA = await db
      .select()
      .from(matchStatuses)
      .where(
        and(
          eq(matchStatuses.userA, targetAgent.userId),
          eq(matchStatuses.userB, payload.userId)
        )
      )
      .get()

    let status: 'None' | 'Pending' | 'Matched' = 'None'
    let matchedContact: string | null = null

    if (matchAB?.status === 'Matched' || matchBA?.status === 'Matched') {
      status = 'Matched'
      const targetUser = await db
        .select({ realContactInfoEncrypted: users.realContactInfoEncrypted })
        .from(users)
        .where(eq(users.userId, targetAgent.userId))
        .get()

      if (targetUser?.realContactInfoEncrypted) {
        matchedContact = decryptContact(targetUser.realContactInfoEncrypted)
      }
    } else if (matchAB?.status === 'Pending') {
      status = 'Pending'
    }

    return NextResponse.json({
      status,
      matchedContact,
    })
  } catch (error) {
    console.error('Match status error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
