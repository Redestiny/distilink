import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMailMock = vi.fn()
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}))

const ORIGINAL_ENV = { ...process.env }

describe('Email Module', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.ALIYUN_DM_SMTP_HOST
    delete process.env.ALIYUN_DM_SMTP_PORT
    delete process.env.ALIYUN_DM_SMTP_SECURE
    delete process.env.ALIYUN_DM_SMTP_USER
    delete process.env.ALIYUN_DM_SMTP_PASSWORD
    delete process.env.ALIYUN_DM_FROM_ALIAS
    delete process.env.ALIYUN_DM_REPLY_TO
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('should log email content in non-production when SMTP is not configured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { sendVerificationEmail } = await import('./email')

    const result = await sendVerificationEmail('test@example.com', '123456')

    expect(result).toBe(true)
    expect(createTransportMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('[EMAIL] To: test@example.com, Subject: Distilink 邮箱验证码')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('123456'))
  })

  it('should fail in production when SMTP is not configured', async () => {
    process.env.NODE_ENV = 'production'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendVerificationEmail } = await import('./email')

    const result = await sendVerificationEmail('test@example.com', '123456')

    expect(result).toBe(false)
    expect(createTransportMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[EMAIL] Alibaba Cloud SMTP is not configured in production'
    )
  })

  it('should send mail with configured Alibaba Cloud SMTP settings', async () => {
    process.env.ALIYUN_DM_SMTP_HOST = 'smtpdm.aliyun.com'
    process.env.ALIYUN_DM_SMTP_PORT = '465'
    process.env.ALIYUN_DM_SMTP_SECURE = 'true'
    process.env.ALIYUN_DM_SMTP_USER = 'no-reply@example.com'
    process.env.ALIYUN_DM_SMTP_PASSWORD = 'smtp-password'
    process.env.ALIYUN_DM_FROM_ALIAS = 'Distilink'
    process.env.ALIYUN_DM_REPLY_TO = 'support@example.com'
    sendMailMock.mockResolvedValueOnce({ messageId: 'test-message-id' })

    const { sendEmail } = await import('./email')

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
    })

    expect(result).toBe(true)
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtpdm.aliyun.com',
      port: 465,
      secure: true,
      auth: {
        user: 'no-reply@example.com',
        pass: 'smtp-password',
      },
    })
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'Distilink <no-reply@example.com>',
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      replyTo: 'support@example.com',
    })
  })

  it('should return false when SMTP send fails', async () => {
    process.env.ALIYUN_DM_SMTP_USER = 'no-reply@example.com'
    process.env.ALIYUN_DM_SMTP_PASSWORD = 'smtp-password'
    sendMailMock.mockRejectedValueOnce(new Error('SMTP unavailable'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendVerificationEmail } = await import('./email')
    const result = await sendVerificationEmail('user@example.com', '123456')

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      '[EMAIL] Failed to send email:',
      expect.any(Error)
    )
  })
})
