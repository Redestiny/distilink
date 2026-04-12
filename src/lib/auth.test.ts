import { describe, it, expect } from 'vitest'
import {
  generateJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  generateVerificationCode,
  generateUserId,
  getExpiryTime,
  isCodeExpired,
} from './auth'

describe('Auth Module', () => {
  describe('JWT', () => {
    it('should generate a valid JWT token', () => {
      const payload = { userId: 'user-123', email: 'test@example.com' }
      const token = generateJWT(payload)

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts
    })

    it('should verify a valid JWT token', () => {
      const payload = { userId: 'user-456', email: 'test@example.com' }
      const token = generateJWT(payload)
      const decoded = verifyJWT(token)

      expect(decoded).toBeTruthy()
      expect(decoded?.userId).toBe(payload.userId)
      expect(decoded?.email).toBe(payload.email)
    })

    it('should return null for invalid token', () => {
      const decoded = verifyJWT('invalid-token')

      expect(decoded).toBeNull()
    })

    it('should return null for tampered token', () => {
      const payload = { userId: 'user-789', email: 'test@example.com' }
      const token = generateJWT(payload)
      const tamperedToken = token.slice(0, -5) + 'xxxxx'
      const decoded = verifyJWT(tamperedToken)

      expect(decoded).toBeNull()
    })
  })

  describe('Password Hashing', () => {
    it('should hash a password', async () => {
      const password = 'securePassword123'
      const hash = await hashPassword(password)

      expect(hash).toBeTruthy()
      expect(hash).not.toBe(password)
      expect(hash.startsWith('$2a$')).toBe(true) // bcrypt hash prefix
    })

    it('should verify correct password', async () => {
      const password = 'myPassword456'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword(password, hash)

      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'correctPassword'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('wrongPassword', hash)

      expect(isValid).toBe(false)
    })

    it('should generate different hashes for same password', async () => {
      const password = 'samePassword'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Verification Code', () => {
    it('should generate 6-digit code', () => {
      const code = generateVerificationCode()

      expect(code).toBeTruthy()
      expect(code).toHaveLength(6)
      expect(/^\d{6}$/.test(code)).toBe(true)
    })

    it('should generate codes in valid range', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode()
        const num = parseInt(code)
        expect(num).toBeGreaterThanOrEqual(100000)
        expect(num).toBeLessThanOrEqual(999999)
      }
    })
  })

  describe('User ID Generation', () => {
    it('should generate a valid UUID', () => {
      const userId = generateUserId()

      expect(userId).toBeTruthy()
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)).toBe(true)
    })

    it('should generate unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateUserId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe('Expiry Time', () => {
    it('should calculate correct expiry time', () => {
      const before = Date.now()
      const expiry = getExpiryTime(30)
      const after = Date.now()

      const expectedMin = before + 30 * 60 * 1000
      const expectedMax = after + 30 * 60 * 1000

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin)
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax)
    })

    it('should handle zero minutes', () => {
      const expiry = getExpiryTime(0)

      expect(expiry.getTime()).toBeGreaterThanOrEqual(Date.now())
    })
  })

  describe('isCodeExpired', () => {
    it('should return true for null expiry', () => {
      expect(isCodeExpired(null)).toBe(true)
    })

    it('should return true for past date', () => {
      const pastDate = new Date(Date.now() - 60000) // 1 minute ago
      expect(isCodeExpired(pastDate)).toBe(true)
    })

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 60000) // 1 minute from now
      expect(isCodeExpired(futureDate)).toBe(false)
    })
  })
})
