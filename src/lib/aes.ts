import CryptoJS from 'crypto-js'

const DEV_AES_KEY = '0123456789abcdef0123456789abcdef'

/**
 * Resolve the AES passphrase used to encrypt contact info / LLM keys at rest.
 * In production a missing AES_KEY is fatal: the hardcoded dev key is public,
 * so anyone could decrypt stored secrets. In dev/test we fall back to it.
 */
function getAesKey(): string {
  const key = process.env.AES_KEY
  if (key) {
    return key
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AES_KEY must be set in production')
  }

  return DEV_AES_KEY
}

export function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, getAesKey()).toString()
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, getAesKey())
  return bytes.toString(CryptoJS.enc.Utf8)
}

export function encryptContact(contact: string): string {
  return encrypt(contact)
}

export function decryptContact(encrypted: string): string {
  return decrypt(encrypted)
}
