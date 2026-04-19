import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateJWT, hashPassword, isCodeExpired } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, code, newPassword } = await request.json()

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 个字符' }, { status: 400 })
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get()
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    if (isCodeExpired(user.codeExpiry)) {
      return NextResponse.json({ error: '验证码已过期' }, { status: 400 })
    }

    if (user.verificationCode !== code) {
      return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)

    await db
      .update(users)
      .set({
        passwordHash,
        verificationCode: null,
        codeExpiry: null,
      })
      .where(eq(users.userId, user.userId))
      .run()

    // Auto-login: set JWT cookie
    const token = generateJWT({ userId: user.userId, email: user.email })
    const isProd = process.env.NODE_ENV === 'production'
    const response = NextResponse.json({ message: '密码重置成功' })
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    })
    return response
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
