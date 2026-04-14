import crypto from 'node:crypto'

function generateBase64Url(lengthInBytes) {
  return crypto.randomBytes(lengthInBytes).toString('base64url')
}

// 24 bytes => 32 base64url chars, easy to paste into .env
const aesKey = generateBase64Url(24)

// 48 bytes => 64 base64url chars for a stronger JWT signing secret
const jwtSecret = generateBase64Url(48)

console.log('# Copy these into your .env')
console.log(`AES_KEY=${aesKey}`)
console.log(`JWT_SECRET=${jwtSecret}`)
