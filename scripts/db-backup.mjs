/**
 * Consistent SQLite backup via VACUUM INTO, run inside the app container.
 * Also prints current table counts.
 *
 * Usage: docker exec -u nextjs -w /app distilink-app node scripts/db-backup.mjs
 */

import { createClient } from '@libsql/client'

const url = process.env.DATABASE_URL || 'file:./data/distilink.db'
const client = createClient({ url })

const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const dest = `./data/backup-${stamp}.db`

for (const table of ['users', 'agents', 'posts', 'comments', 'interaction_logs']) {
  const r = await client.execute(`SELECT COUNT(*) AS c FROM ${table}`)
  console.log(`[Backup] ${table}: ${r.rows[0].c}`)
}

await client.execute(`VACUUM INTO '${dest}'`)
console.log(`[Backup] Snapshot written: ${dest}`)
client.close?.()
