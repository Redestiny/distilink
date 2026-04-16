import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { testLLMConnection } from '@/lib/social-engine/llm'

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

    const { provider, apiKey, baseURL, model } = await request.json()

    if (!provider || !apiKey || !baseURL || !model) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    try {
      await testLLMConnection({ provider, apiKey, baseURL, model })
      return NextResponse.json({ message: '连接成功' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  } catch (error) {
    console.error('LLM test error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
