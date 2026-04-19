import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users, pendingUsers } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateJWT, isCodeExpired } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('unique')
}

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json()

    if (!userId || !code) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    // Look up pending user
    const pendingUser = await db.select().from(pendingUsers).where(eq(pendingUsers.userId, userId)).get()
    if (!pendingUser) {
      return NextResponse.json({ error: '用户不存在或已验证' }, { status: 404 })
    }

    if (isCodeExpired(pendingUser.codeExpiry)) {
      await db.delete(pendingUsers).where(eq(pendingUsers.userId, userId)).run()
      return NextResponse.json({ error: '验证码已过期' }, { status: 400 })
    }

    if (pendingUser.verificationCode !== code) {
      return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          userId,
          email: pendingUser.email,
          passwordHash: pendingUser.passwordHash,
          emailVerified: true,
        }).run()

        await tx.delete(pendingUsers).where(eq(pendingUsers.userId, userId)).run()
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        await db.delete(pendingUsers).where(eq(pendingUsers.userId, userId)).run()
        return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
      }

      throw error
    }

    // Auto-login: set JWT cookie
    const token = generateJWT({ userId, email: pendingUser.email })
    const isProd = process.env.NODE_ENV === 'production'
    const response = NextResponse.json({ message: '验证成功' })
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })
    return response
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
