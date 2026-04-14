import nodemailer from 'nodemailer'

/**
 * Email Service - Alibaba Cloud Direct Mail (SMTP)
 *
 * Send verification code emails to users.
 * In development, falls back to console output when SMTP is not configured.
 */

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromAlias: string
  replyTo?: string
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return defaultValue
}

function getSmtpConfig(): SmtpConfig | null {
  const user = process.env.ALIYUN_DM_SMTP_USER
  const password = process.env.ALIYUN_DM_SMTP_PASSWORD

  if (!user || !password) {
    return null
  }

  const portValue = process.env.ALIYUN_DM_SMTP_PORT
  const parsedPort = portValue ? Number.parseInt(portValue, 10) : 465

  return {
    host: process.env.ALIYUN_DM_SMTP_HOST || 'smtpdm.aliyun.com',
    port: Number.isNaN(parsedPort) ? 465 : parsedPort,
    secure: parseBoolean(process.env.ALIYUN_DM_SMTP_SECURE, true),
    user,
    password,
    fromAlias: process.env.ALIYUN_DM_FROM_ALIAS || 'Distilink',
    replyTo: process.env.ALIYUN_DM_REPLY_TO || undefined,
  }
}

function formatFromAddress(config: SmtpConfig): string {
  const alias = config.fromAlias.trim()
  if (!alias) {
    return config.user
  }

  return `${alias} <${config.user}>`
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Send an email via Alibaba Cloud Direct Mail SMTP.
 * In non-production, logs the payload when SMTP is not configured.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { to, subject, html } = payload
  const config = getSmtpConfig()

  if (!config) {
    if (isProduction()) {
      console.error('[EMAIL] Alibaba Cloud SMTP is not configured in production')
      return false
    }

    console.log(`[EMAIL] To: ${to}, Subject: ${subject}`)
    console.log(`[EMAIL] HTML content:\n${html}`)
    return true
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    })

    await transporter.sendMail({
      from: formatFromAddress(config),
      to,
      subject,
      html,
      replyTo: config.replyTo,
    })

    console.log(`[EMAIL] Sent successfully to ${to}`)
    return true
  } catch (error) {
    console.error('[EMAIL] Failed to send email:', error)
    return false
  }
}

/**
 * Send verification code email
 */
export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f4ed; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #faf9f5; border-radius: 12px; padding: 32px; }
    .code { font-size: 32px; font-weight: bold; color: #c96442; letter-spacing: 8px; margin: 24px 0; text-align: center; }
    .title { font-size: 18px; color: #141413; margin-bottom: 8px; }
    .hint { color: #87867f; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="title">您的验证码</p>
    <p class="hint">以下验证码将在 10 分钟内过期，请尽快使用：</p>
    <div class="code">${code}</div>
    <p class="hint">如果您没有请求此验证码，请忽略此邮件。</p>
  </div>
</body>
</html>
`

  return sendEmail({
    to,
    subject: 'Distilink 邮箱验证码',
    html,
  })
}
