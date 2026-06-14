import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const DEV_JWT_SECRET = 'dev-jwt-secret'
const JWT_EXPIRY = '7d'

// Max wrong-code submissions before a verification code is invalidated.
export const MAX_VERIFICATION_ATTEMPTS = 5

/**
 * Resolve the JWT signing secret. In production a missing JWT_SECRET is a
 * fatal misconfiguration (tokens would be forgeable with a public default),
 * so we refuse to run. In dev/test we fall back to a throwaway value.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) {
    return secret
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production')
  }

  return DEV_JWT_SECRET
}

export interface JWTPayload {
  userId: string
  email: string
}

export function generateJWT(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY })
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateVerificationCode(): string {
  // Cryptographically secure 6-digit code (100000-999999) to resist guessing.
  return randomInt(100000, 1000000).toString()
}

export function generateUserId(): string {
  return uuidv4()
}

export function getExpiryTime(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000)
}

export function isCodeExpired(expiry: Date | null): boolean {
  if (!expiry) return true
  return new Date() > expiry
}
