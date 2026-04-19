import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users, passwordResetTokens } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateVerificationCode, getExpiryTime } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

async function runTokenRollback(rollbackAction: (() => Promise<void>) | null): Promise<boolean> {
  if (!rollbackAction) {
    return true
  }

  try {
    await rollbackAction()
    return true
  } catch (rollbackError) {
    console.error('Forgot password rollback error:', rollbackError)
    return false
  }
}

export async function POST(request: NextRequest) {
  let rollbackAction: (() => Promise<void>) | null = null

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
    const existingToken = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.userId))
      .get()

    if (existingToken) {
      await db.update(passwordResetTokens)
        .set({
          verificationCode: code,
          codeExpiry: expiry,
        })
        .where(eq(passwordResetTokens.userId, user.userId))
        .run()

      rollbackAction = async () => {
        await db.update(passwordResetTokens)
          .set({
            verificationCode: existingToken.verificationCode,
            codeExpiry: existingToken.codeExpiry,
          })
          .where(eq(passwordResetTokens.userId, user.userId))
          .run()
      }
    } else {
      await db.insert(passwordResetTokens).values({
        userId: user.userId,
        verificationCode: code,
        codeExpiry: expiry,
      }).run()

      rollbackAction = async () => {
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.userId)).run()
      }
    }

    const emailSent = await sendVerificationEmail(email, code)
    if (!emailSent) {
      const rolledBack = await runTokenRollback(rollbackAction)
      if (!rolledBack) {
        return NextResponse.json({ error: '服务器错误' }, { status: 500 })
      }

      return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 502 })
    }

    rollbackAction = null

    return NextResponse.json({ message: '验证码已发送' })
  } catch (error) {
    await runTokenRollback(rollbackAction)
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
