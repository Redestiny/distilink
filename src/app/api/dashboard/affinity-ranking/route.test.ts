import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { agents, relationshipScores, users } from '@/db/schema'
import * as schema from '@/db/schema'

vi.mock('@/db', () => ({
  db: testDb,
}))

const verifyJWTMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  verifyJWT: verifyJWTMock,
}))

const client = createClient({ url: ':memory:' })
const testDb = drizzle(client, { schema })

async function resetDatabase() {
  await client.batch([
    'DROP TABLE IF EXISTS relationship_scores',
    'DROP TABLE IF EXISTS agents',
    'DROP TABLE IF EXISTS users',
    `CREATE TABLE users (
      user_id text PRIMARY KEY NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      real_contact_info_encrypted text,
      email_verified integer DEFAULT false,
      created_at text DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE agents (
      agent_id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      profile_md text NOT NULL,
      slot integer NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE relationship_scores (
      agent_a text NOT NULL,
      agent_b text NOT NULL,
      score integer DEFAULT 0,
      updated_at text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_a) REFERENCES agents(agent_id),
      FOREIGN KEY (agent_b) REFERENCES agents(agent_id)
    )`,
  ])

  await testDb.insert(users).values([
    {
      userId: 'user-main',
      email: 'main@example.com',
      passwordHash: 'hash',
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      userId: `user-${index + 1}`,
      email: `user-${index + 1}@example.com`,
      passwordHash: 'hash',
    })),
  ]).run()

  await testDb.insert(agents).values([
    {
      agentId: 'agent-main',
      userId: 'user-main',
      name: 'Main Agent',
      profileMD: 'profile',
      slot: 0,
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      agentId: `agent-${String(index + 1).padStart(2, '0')}`,
      userId: `user-${index + 1}`,
      name: `Agent ${index + 1}`,
      profileMD: 'profile',
      slot: index + 1,
    })),
  ]).run()
}

function createRequest() {
  return {
    cookies: {
      get: vi.fn((name: string) => {
        if (name === 'auth_token') {
          return { value: 'valid-token' }
        }

        return undefined
      }),
    },
  } as any
}

describe('GET /api/dashboard/affinity-ranking', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    verifyJWTMock.mockReturnValue({ userId: 'user-main', email: 'main@example.com' })
    await resetDatabase()
  })

  it('returns only positive real relationship scores and does not apply a 7-day cutoff', async () => {
    await testDb.insert(relationshipScores).values([
      {
        agentA: 'agent-main',
        agentB: 'agent-01',
        score: 5,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        agentA: 'agent-main',
        agentB: 'agent-02',
        score: 0,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        agentA: 'agent-main',
        agentB: 'agent-03',
        score: -2,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]).run()
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rankings).toEqual([
      {
        agentId: 'agent-01',
        name: 'Agent 1',
        score: 5,
      },
    ])
  })

  it('does not fill rankings with zero-score random agents', async () => {
    await testDb.insert(relationshipScores).values({
      agentA: 'agent-main',
      agentB: 'agent-01',
      score: 3,
      updatedAt: '2026-04-25T00:00:00.000Z',
    }).run()
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rankings).toHaveLength(1)
  })

  it('limits rankings to top 7 and uses agent id as the score tie breaker', async () => {
    await testDb.insert(relationshipScores).values([
      {
        agentA: 'agent-main',
        agentB: 'agent-07',
        score: 10,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        agentA: 'agent-main',
        agentB: 'agent-02',
        score: 9,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        agentA: 'agent-main',
        agentB: 'agent-01',
        score: 9,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        agentA: 'agent-main',
        agentB: `agent-${String(index + 3).padStart(2, '0')}`,
        score: 8 - index,
        updatedAt: '2026-04-25T00:00:00.000Z',
      })),
    ]).run()
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rankings.map((ranking: { agentId: string }) => ranking.agentId)).toEqual([
      'agent-07',
      'agent-01',
      'agent-02',
      'agent-03',
      'agent-04',
      'agent-05',
      'agent-06',
    ])
  })

  it('returns 401 when not logged in', async () => {
    const { GET } = await import('./route')
    const request = {
      cookies: {
        get: vi.fn(() => undefined),
      },
    } as any

    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '未登录' })
  })
})
