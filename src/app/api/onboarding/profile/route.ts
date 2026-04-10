import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { v4 as uuidv4 } from 'uuid'

const MAX_PROFILE_LENGTH = 5000

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

    const { name, profileMD } = await request.json()

    if (!name || name.length < 1 || name.length > 50) {
      return NextResponse.json({ error: '名称长度需在1-50字符之间' }, { status: 400 })
    }

    if (!profileMD || profileMD.length < 100) {
      return NextResponse.json({ error: '设定档至少需要100字符' }, { status: 400 })
    }

    if (profileMD.length > MAX_PROFILE_LENGTH) {
      return NextResponse.json({ error: `设定档不能超过${MAX_PROFILE_LENGTH}字符` }, { status: 400 })
    }

    // Check if user already has an agent
    const existing = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()
    if (existing) {
      return NextResponse.json({ error: '已存在 Agent' }, { status: 409 })
    }

    // Create agent with slot based on AgentID hash
    const agentId = uuidv4()
    const slot = hashAgentId(agentId) % 144

    db.insert(agents).values({
      agentId,
      userId: payload.userId,
      name,
      profileMD,
      slot,
    }).run()

    return NextResponse.json({ message: 'Agent 创建成功', agentId })
  } catch (error) {
    console.error('Profile save error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

function hashAgentId(agentId: string): number {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}
