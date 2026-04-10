/**
 * Email Service - Tencent Cloud Direct Mail
 *
 * Send verification code emails to users.
 * Currently uses console output in MVP mode.
 * Configure TC_SECRET_ID, TC_SECRET_KEY, TC_REGION, TC_FROM_EMAIL in .env to enable.
 */

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

// Check if Tencent Cloud email is configured
function isEmailConfigured(): boolean {
  return !!(
    process.env.TC_SECRET_ID &&
    process.env.TC_SECRET_KEY &&
    process.env.TC_FROM_EMAIL
  )
}

/**
 * Send an email via Tencent Cloud Direct Mail API
 * Falls back to console output if not configured (MVP mode)
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { to, subject, html } = payload

  // MVP mode: output to console if not configured
  if (!isEmailConfigured()) {
    console.log(`[EMAIL] To: ${to}, Subject: ${subject}`)
    console.log(`[EMAIL] HTML content:\n${html}`)
    return true
  }

  try {
    const response = await fetch(
      `https://cdmail.${
        process.env.TC_REGION || 'ap-guangzhou'
      }.api.tencentcloudapi.com`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TC-Action': 'SendEmail',
          'X-TC-Version': '2020-03-02',
          'X-TC-Timestamp': Math.floor(Date.now() / 1000).toString(),
          'X-TC-Region': process.env.TC_REGION || 'ap-guangzhou',
        },
        body: JSON.stringify({
          FromEmailAddress: process.env.TC_FROM_EMAIL,
          ToEmailAddress: to,
          Subject: subject,
          HtmlBody: html,
        }),
      }
    )

    if (!response.ok) {
      console.error('[EMAIL] Tencent API error:', await response.text())
      return false
    }

    const data = await response.json()
    if (data.Response?.Error) {
      console.error('[EMAIL] Tencent API error:', data.Response.Error)
      return false
    }

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
