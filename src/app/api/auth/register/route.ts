import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateUserId, generateVerificationCode, hashPassword, getExpiryTime } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 个字符' }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get()
    if (existingUser) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    // Generate verification code
    const code = generateVerificationCode()
    const codeExpiry = getExpiryTime(10) // 10 minutes

    // Create user with unverified status
    const userId = generateUserId()
    const passwordHash = await hashPassword(password)

    db.insert(users).values({
      userId,
      email,
      passwordHash,
      emailVerified: false,
      verificationCode: code,
      codeExpiry,
    }).run()

    // Send verification email
    await sendVerificationEmail(email, code)

    return NextResponse.json({
      message: '注册成功，验证码已生成',
      userId,
    })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
