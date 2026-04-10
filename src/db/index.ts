import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

function getLocalDatabasePath(databaseUrl: string): string | null {
  if (databaseUrl.startsWith('http')) {
    return null
  }

  return databaseUrl.replace(/^file:/, '')
}

const dbPath = process.env.DATABASE_URL || 'file:./data/distilink.db'
const localDatabasePath = getLocalDatabasePath(dbPath)

if (localDatabasePath) {
  const resolvedDatabasePath = path.resolve(process.cwd(), localDatabasePath)
  const dataDir = path.dirname(resolvedDatabasePath)

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const client = createClient({
  url: dbPath.startsWith('http') || dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`,
})

export const db = drizzle(client, { schema })
export { schema }
