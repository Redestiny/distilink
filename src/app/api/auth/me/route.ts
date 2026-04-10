import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { db } from '@/db'
import { users, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

    const user = await db.select().from(users).where(eq(users.userId, payload.userId)).get()
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    const agent = await db.select().from(agents).where(eq(agents.userId, user.userId)).get()

    return NextResponse.json({
      user: {
        userId: user.userId,
        email: user.email,
        hasAgent: !!agent,
        agentId: agent?.agentId,
        agentName: agent?.name,
      },
    })
  } catch (error) {
    console.error('Me error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
