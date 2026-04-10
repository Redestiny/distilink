import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = process.env.DATABASE_URL || './data/distilink.db'

const client = createClient({
  url: dbPath.startsWith('http') ? dbPath : `file:${dbPath}`,
})

export const db = drizzle(client, { schema })
export { schema }
