import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'

const MIGRATIONS_TABLE = '__drizzle_migrations'
const APP_TABLES = [
  'users',
  'agents',
  'llm_configs',
  'posts',
  'comments',
  'interaction_logs',
  'relationship_scores',
  'match_statuses',
]

function getDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL || 'file:./data/distilink.db'

  if (configuredUrl.startsWith('http') || configuredUrl.startsWith('file:')) {
    return configuredUrl
  }

  return `file:${configuredUrl}`
}

function getLocalDatabasePath(databaseUrl) {
  if (databaseUrl.startsWith('http')) {
    return null
  }

  return databaseUrl.replace(/^file:/, '')
}

function ensureLocalDataDirectory(databaseUrl) {
  const localDatabasePath = getLocalDatabasePath(databaseUrl)
  if (!localDatabasePath) {
    return
  }

  const resolvedDatabasePath = path.resolve(process.cwd(), localDatabasePath)
  const dataDirectory = path.dirname(resolvedDatabasePath)
  fs.mkdirSync(dataDirectory, { recursive: true })
}

function loadMigrations() {
  const migrationsDirectory = path.join(process.cwd(), 'drizzle')
  const journalPath = path.join(migrationsDirectory, 'meta', '_journal.json')
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))

  return journal.entries
    .slice()
    .sort((left, right) => left.when - right.when)
    .map((entry) => {
      const sqlPath = path.join(migrationsDirectory, `${entry.tag}.sql`)
      const sql = fs.readFileSync(sqlPath, 'utf8')

      return {
        tag: entry.tag,
        when: entry.when,
        hash: crypto.createHash('sha256').update(sql).digest('hex'),
        statements: sql
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter(Boolean),
      }
    })
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  }

  return `"${identifier}"`
}

async function execute(client, sql, args = []) {
  return client.execute({ sql, args })
}

async function tableExists(client, tableName) {
  const result = await execute(
    client,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName]
  )

  return result.rows.length > 0
}

async function columnExists(client, tableName, columnName) {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
  return result.rows.some((row) => row.name === columnName)
}

async function ensureCompatibility(client) {
  if (await tableExists(client, 'users')) {
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)')
  }

  if (await tableExists(client, 'comments') && !(await columnExists(client, 'comments', 'parent_id'))) {
    console.log('[DB] Adding missing comments.parent_id column')
    await client.execute('ALTER TABLE comments ADD COLUMN parent_id text')
  }
}

async function ensureMigrationsTable(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(MIGRATIONS_TABLE)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)
}

async function getAppliedMigrationCount(client) {
  const result = await client.execute(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(MIGRATIONS_TABLE)}`
  )

  return Number(result.rows[0]?.count ?? 0)
}

async function getLastAppliedMillis(client) {
  const result = await client.execute(
    `SELECT created_at FROM ${quoteIdentifier(MIGRATIONS_TABLE)} ORDER BY created_at DESC LIMIT 1`
  )

  if (!result.rows[0]) {
    return null
  }

  return Number(result.rows[0].created_at)
}

async function getExistingAppTableCount(client) {
  let count = 0

  for (const tableName of APP_TABLES) {
    if (await tableExists(client, tableName)) {
      count += 1
    }
  }

  return count
}

async function markLegacySchemaAsApplied(client, migrations) {
  console.log(`[DB] Existing schema detected. Recording ${migrations.length} baseline migration(s).`)

  for (const migration of migrations) {
    await execute(
      client,
      `INSERT INTO ${quoteIdentifier(MIGRATIONS_TABLE)} (hash, created_at) VALUES (?, ?)`,
      [migration.hash, migration.when]
    )
  }
}

async function applyMigration(client, migration) {
  console.log(`[DB] Applying migration ${migration.tag}`)

  await client.execute('BEGIN')

  try {
    for (const statement of migration.statements) {
      await client.execute(statement)
    }

    await execute(
      client,
      `INSERT INTO ${quoteIdentifier(MIGRATIONS_TABLE)} (hash, created_at) VALUES (?, ?)`,
      [migration.hash, migration.when]
    )

    await client.execute('COMMIT')
  } catch (error) {
    await client.execute('ROLLBACK')
    throw error
  }
}

async function main() {
  const databaseUrl = getDatabaseUrl()
  const migrations = loadMigrations()

  ensureLocalDataDirectory(databaseUrl)

  const client = createClient({ url: databaseUrl })

  try {
    await ensureMigrationsTable(client)
    await ensureCompatibility(client)

    const appliedMigrationCount = await getAppliedMigrationCount(client)
    const existingAppTableCount = await getExistingAppTableCount(client)

    if (appliedMigrationCount === 0 && existingAppTableCount > 0) {
      if (existingAppTableCount !== APP_TABLES.length) {
        throw new Error(
          `Legacy database has ${existingAppTableCount}/${APP_TABLES.length} expected tables. Refusing automatic baseline.`
        )
      }

      await markLegacySchemaAsApplied(client, migrations)
    }

    let lastAppliedMillis = await getLastAppliedMillis(client)
    for (const migration of migrations) {
      if (lastAppliedMillis === null || migration.when > lastAppliedMillis) {
        await applyMigration(client, migration)
        lastAppliedMillis = migration.when
      }
    }

    await ensureCompatibility(client)
    console.log('[DB] Database schema is ready.')
  } finally {
    client.close?.()
  }
}

main().catch((error) => {
  console.error('[DB] Migration failed:', error)
  process.exit(1)
})
