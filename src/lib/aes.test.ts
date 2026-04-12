import { describe, it, expect } from 'vitest'
import { encryptContact, decryptContact } from './aes'

describe('AES Module', () => {
  describe('encryptContact', () => {
    it('should encrypt a contact string', () => {
      const contact = 'telegram: @username'
      const encrypted = encryptContact(contact)

      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(contact)
      expect(typeof encrypted).toBe('string')
    })

    it('should produce different ciphertext each time (due to random IV)', () => {
      const contact = '微信: 12345678'
      const encrypted1 = encryptContact(contact)
      const encrypted2 = encryptContact(contact)

      // AES encryption with CBC mode produces different ciphertext each time
      expect(encrypted1).not.toBe(encrypted2)
    })
  })

  describe('decryptContact', () => {
    it('should decrypt an encrypted contact back to original', () => {
      const original = '微信: wx123456'
      const encrypted = encryptContact(original)
      const decrypted = decryptContact(encrypted)

      expect(decrypted).toBe(original)
    })

    it('should handle special characters', () => {
      const original = '邮箱: user@example.com!#$%&*'
      const encrypted = encryptContact(original)
      const decrypted = decryptContact(encrypted)

      expect(decrypted).toBe(original)
    })

    it('should handle empty string', () => {
      const encrypted = encryptContact('')
      const decrypted = decryptContact(encrypted)

      expect(decrypted).toBe('')
    })

    it('should handle unicode characters', () => {
      const original = '微信：微信号码🔐'
      const encrypted = encryptContact(original)
      const decrypted = decryptContact(encrypted)

      expect(decrypted).toBe(original)
    })
  })

  describe('encryption consistency', () => {
    it('should produce verifiable encrypted data', () => {
      const contact = 'Telegram: @test_user'
      const encrypted = encryptContact(contact)

      // Encrypted string should be Base64 format
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })
})
