import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(filename: string): boolean {
  try {
    const envPath = resolve(process.cwd(), filename)
    const envContent = readFileSync(envPath, 'utf-8')

    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key && key.trim() && !key.startsWith('#')) {
        const value = valueParts.join('=').trim()
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value
        }
      }
    })

    return true
  } catch {
    return false
  }
}

// Prefer local secrets, but fall back to checked-in example values in CI.
loadEnvFile('.env') || loadEnvFile('.env.example')
