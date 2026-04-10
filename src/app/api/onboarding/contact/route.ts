import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'
import { encryptContact } from '@/lib/aes'

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

    const { contact } = await request.json()

    if (!contact || contact.length < 2) {
      return NextResponse.json({ error: '联系方式不能为空' }, { status: 400 })
    }

    const encrypted = encryptContact(contact)

    db.update(users)
      .set({ realContactInfoEncrypted: encrypted })
      .where(eq(users.userId, payload.userId))
      .run()

    return NextResponse.json({ message: '联系方式已保存' })
  } catch (error) {
    console.error('Contact save error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
