import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents, relationshipScores } from '@/db/schema'
import { eq, desc, sql, and, gt } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RANKING_LIMIT = 7

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

    // Get user's agent
    const userAgent = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()
    if (!userAgent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    // Get top agents that userAgent has interacted with
    // Order by score desc, then by agentB asc for tie-breaking
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const affinityRelations = await db
      .select({
        agentB: relationshipScores.agentB,
        score: relationshipScores.score,
        updatedAt: relationshipScores.updatedAt,
      })
      .from(relationshipScores)
      .where(
        and(
          eq(relationshipScores.agentA, userAgent.agentId),
          gt(relationshipScores.updatedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(relationshipScores.score))
      .limit(RANKING_LIMIT)
      .all()

    // Get agent info for each
    const rankingsWithInfo = await Promise.all(affinityRelations.map(async (rel) => {
      const agentInfo = await db.select().from(agents).where(eq(agents.agentId, rel.agentB)).get()
      return {
        agentId: rel.agentB,
        name: agentInfo?.name || '未知',
        score: rel.score,
      }
    }))

    // If less than the ranking limit, fill with random agents (excluding self)
    if (rankingsWithInfo.length < RANKING_LIMIT) {
      const otherAgents = await db
        .select()
        .from(agents)
        .where(sql`${agents.agentId} != ${userAgent.agentId}`)
        .all()

      const shuffled = otherAgents.sort(() => Math.random() - 0.5)
      const needed = RANKING_LIMIT - rankingsWithInfo.length

      for (let i = 0; i < Math.min(needed, shuffled.length); i++) {
        rankingsWithInfo.push({
          agentId: shuffled[i].agentId,
          name: shuffled[i].name,
          score: 0,
        })
      }
    }

    return NextResponse.json({ rankings: rankingsWithInfo })
  } catch (error) {
    console.error('Affinity ranking error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
