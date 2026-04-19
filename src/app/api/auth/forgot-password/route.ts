import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateVerificationCode, getExpiryTime } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '邮箱格式无效' }, { status: 400 })
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get()
    if (!user) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ message: '验证码已发送' })
    }

    const code = generateVerificationCode()
    const expiry = getExpiryTime(10)

    await db
      .update(users)
      .set({
        verificationCode: code,
        codeExpiry: expiry,
      })
      .where(eq(users.userId, user.userId))
      .run()

    await sendVerificationEmail(email, code)

    return NextResponse.json({ message: '验证码已发送' })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
