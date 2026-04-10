import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword, isCodeExpired } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json()

    if (!userId || !code) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    const user = await db.select().from(users).where(eq(users.userId, userId)).get()
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: '邮箱已验证' }, { status: 400 })
    }

    if (isCodeExpired(user.codeExpiry)) {
      return NextResponse.json({ error: '验证码已过期' }, { status: 400 })
    }

    if (user.verificationCode !== code) {
      return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    }

    // Mark as verified and clear code
    db.update(users)
      .set({
        emailVerified: true,
        verificationCode: null,
        codeExpiry: null,
      })
      .where(eq(users.userId, userId))
      .run()

    return NextResponse.json({ message: '验证成功' })
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
