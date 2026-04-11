import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'

const MAX_PROFILE_LENGTH = 5000

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

    const agent = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()

    if (!agent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    return NextResponse.json({
      name: agent.name,
      profileMD: agent.profileMD,
    })
  } catch (error) {
    console.error('Agent profile get error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

    const existing = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()

    if (!existing) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    db.update(agents)
      .set({ name, profileMD })
      .where(eq(agents.userId, payload.userId))
      .run()

    return NextResponse.json({ message: 'Agent 更新成功' })
  } catch (error) {
    console.error('Agent profile update error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
