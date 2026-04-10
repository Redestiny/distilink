import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret'
const JWT_EXPIRY = '7d'

export interface JWTPayload {
  userId: string
  email: string
}

export function generateJWT(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
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
  return Math.floor(100000 + Math.random() * 900000).toString()
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
