import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword, generateJWT } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 })
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get()
    if (!user) {
      return NextResponse.json({ error: '用户不存在或密码错误' }, { status: 401 })
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: '请先验证邮箱' }, { status: 401 })
    }

    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json({ error: '用户不存在或密码错误' }, { status: 401 })
    }

    const token = generateJWT({ userId: user.userId, email: user.email })

    const response = NextResponse.json({
      message: '登录成功',
      user: { userId: user.userId, email: user.email },
    })

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
