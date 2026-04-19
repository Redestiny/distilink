import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users, pendingUsers } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateUserId, generateVerificationCode, hashPassword, getExpiryTime } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

async function runRegisterRollback(rollbackAction: (() => Promise<void>) | null): Promise<boolean> {
  if (!rollbackAction) {
    return true
  }

  try {
    await rollbackAction()
    return true
  } catch (rollbackError) {
    console.error('Register rollback error:', rollbackError)
    return false
  }
}

export async function POST(request: NextRequest) {
  let rollbackAction: (() => Promise<void>) | null = null

  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 个字符' }, { status: 400 })
    }

    // Check if email already exists in users or pending_users
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get()
    if (existingUser) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    // Generate verification code
    const code = generateVerificationCode()
    const codeExpiry = getExpiryTime(10) // 10 minutes
    const passwordHash = await hashPassword(password)
    const existingPending = await db.select().from(pendingUsers).where(eq(pendingUsers.email, email)).get()
    const userId = existingPending?.userId ?? generateUserId()

    if (existingPending) {
      await db.update(pendingUsers)
        .set({
          passwordHash,
          verificationCode: code,
          codeExpiry,
        })
        .where(eq(pendingUsers.userId, existingPending.userId))
        .run()

      rollbackAction = async () => {
        await db.update(pendingUsers)
          .set({
            passwordHash: existingPending.passwordHash,
            verificationCode: existingPending.verificationCode,
            codeExpiry: existingPending.codeExpiry,
          })
          .where(eq(pendingUsers.userId, existingPending.userId))
          .run()
      }
    } else {
      await db.insert(pendingUsers).values({
        userId,
        email,
        passwordHash,
        verificationCode: code,
        codeExpiry,
      }).run()

      rollbackAction = async () => {
        await db.delete(pendingUsers).where(eq(pendingUsers.userId, userId)).run()
      }
    }

    // Send verification email
    const emailSent = await sendVerificationEmail(email, code)
    if (!emailSent) {
      const rolledBack = await runRegisterRollback(rollbackAction)
      if (!rolledBack) {
        return NextResponse.json({ error: '服务器错误' }, { status: 500 })
      }

      return NextResponse.json(
        { error: '验证码发送失败，请稍后重试' },
        { status: 502 }
      )
    }

    rollbackAction = null

    return NextResponse.json({
      message: '注册成功，验证码已生成',
      userId,
    })
  } catch (error) {
    const rolledBack = await runRegisterRollback(rollbackAction)
    console.error('Register error:', error)

    if (rollbackAction && !rolledBack) {
      return NextResponse.json({ error: '服务器错误' }, { status: 500 })
    }

    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
