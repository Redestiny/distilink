import CryptoJS from 'crypto-js'

const AES_KEY = process.env.AES_KEY || '0123456789abcdef0123456789abcdef'

export function encryptContact(contact: string): string {
  return CryptoJS.AES.encrypt(contact, AES_KEY).toString()
}

export function decryptContact(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, AES_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}
