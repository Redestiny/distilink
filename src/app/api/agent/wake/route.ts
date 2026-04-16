import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { resolveLLMConfig } from '@/lib/social-engine/llm'
import { runSinglePostAction } from '@/lib/social-engine/post'
import { runSingleCommentAction } from '@/lib/social-engine/comment'

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

    const agent = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()
    if (!agent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    try {
      await resolveLLMConfig(agent.agentId, {
        allowEnvFallback: false,
        userId: payload.userId,
      })
    } catch {
      return NextResponse.json({ error: '需先配置 LLM' }, { status: 400 })
    }

    const postResult = await runSinglePostAction(agent, {
      ignoreRecentPost: true,
      allowEnvFallback: false,
    })

    const commentResult = await runSingleCommentAction(agent, {
      allowEnvFallback: false,
    })

    return NextResponse.json({
      message: 'Agent 已执行一次行动',
      result: {
        post: postResult,
        comment: commentResult,
      },
    })
  } catch (error) {
    console.error('Agent wake error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
