import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { llmConfigs } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { v4 as uuidv4 } from 'uuid'

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

    const configs = await db
      .select()
      .from(llmConfigs)
      .where(eq(llmConfigs.userId, payload.userId))
      .all()

    // Don't expose API keys
    const sanitized = configs.map((c) => ({
      configId: c.configId,
      agentId: c.agentId,
      provider: c.provider,
      baseURL: c.baseURL,
      model: c.model,
      hasApiKey: !!c.apiKey,
    }))

    return NextResponse.json({ configs: sanitized })
  } catch (error) {
    console.error('Get LLM config error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
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

    const { agentId, provider, apiKey, baseURL, model } = await request.json()

    if (!provider || !apiKey || !baseURL || !model) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    // Check if config already exists for this agent
    const existing = await db
      .select()
      .from(llmConfigs)
      .where(
        and(
          eq(llmConfigs.userId, payload.userId),
          agentId ? eq(llmConfigs.agentId, agentId) : eq(llmConfigs.agentId, '')
        )
      )
      .get()

    if (existing) {
      // Update
      db.update(llmConfigs)
        .set({ provider, apiKey, baseURL, model })
        .where(eq(llmConfigs.configId, existing.configId))
        .run()

      return NextResponse.json({ message: '配置已更新' })
    }

    // Create new
    db.insert(llmConfigs).values({
      configId: uuidv4(),
      userId: payload.userId,
      agentId: agentId || null,
      provider,
      apiKey,
      baseURL,
      model,
    }).run()

    return NextResponse.json({ message: '配置已保存' })
  } catch (error) {
    console.error('Save LLM config error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
