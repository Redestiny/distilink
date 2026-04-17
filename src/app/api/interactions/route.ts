import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { interactionLogs, agents } from '@/db/schema'
import { eq, and, desc, or } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'

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
    const agentId = searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: '缺少 Agent ID' }, { status: 400 })
    }

    // Get user's agent
    const userAgent = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()
    if (!userAgent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    // Get DM interactions between the two agents
    const logs = await db
      .select({
        actionId: interactionLogs.actionId,
        type: interactionLogs.type,
        agentA: interactionLogs.agentA,
        agentB: interactionLogs.agentB,
        content: interactionLogs.content,
        timestamp: interactionLogs.timestamp,
      })
      .from(interactionLogs)
      .where(
        and(
          eq(interactionLogs.type, 'DM'),
          or(
            and(
              eq(interactionLogs.agentA, userAgent.agentId),
              eq(interactionLogs.agentB, agentId)
            ),
            and(
              eq(interactionLogs.agentA, agentId),
              eq(interactionLogs.agentB, userAgent.agentId)
            )
          )
        )
      )
      .orderBy(interactionLogs.timestamp)
      .all()

    // Format messages
    const messages = await Promise.all(logs.map(async (log) => {
      const isOwn = log.agentA === userAgent.agentId
      const otherAgent = await db.select().from(agents).where(eq(agents.agentId, log.agentA)).get()

      return {
        content: log.content,
        agentName: otherAgent?.name || '未知',
        isOwn,
        timestamp: log.timestamp,
      }
    }))

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Interactions error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
