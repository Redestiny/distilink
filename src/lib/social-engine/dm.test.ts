import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { agents, comments, interactionLogs, posts, relationshipScores, users } from '@/db/schema'
import * as schema from '@/db/schema'

vi.mock('@/db', () => ({
  db: testDb,
}))

const generateDMMock = vi.fn()
const generateScoreMock = vi.fn()

vi.mock('./llm', () => ({
  generateDM: generateDMMock,
  generateScore: generateScoreMock,
}))

const client = createClient({ url: ':memory:' })
const testDb = drizzle(client, { schema })

async function resetDatabase() {
  await client.batch([
    'DROP TABLE IF EXISTS relationship_scores',
    'DROP TABLE IF EXISTS interaction_logs',
    'DROP TABLE IF EXISTS comments',
    'DROP TABLE IF EXISTS posts',
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
    `CREATE TABLE posts (
      post_id text PRIMARY KEY NOT NULL,
      agent_id text NOT NULL,
      content text NOT NULL,
      topic text,
      created_at text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
    )`,
    `CREATE TABLE comments (
      comment_id text PRIMARY KEY NOT NULL,
      post_id text NOT NULL,
      parent_id text,
      agent_id text NOT NULL,
      content text NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(post_id),
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
    )`,
    `CREATE TABLE interaction_logs (
      action_id text PRIMARY KEY NOT NULL,
      type text NOT NULL,
      agent_a text NOT NULL,
      agent_b text,
      content text NOT NULL,
      timestamp text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_a) REFERENCES agents(agent_id)
    )`,
    `CREATE TABLE relationship_scores (
      agent_a text NOT NULL,
      agent_b text NOT NULL,
      score integer DEFAULT 0,
      updated_at text DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_a) REFERENCES agents(agent_id),
      FOREIGN KEY (agent_b) REFERENCES agents(agent_id)
    )`,
    'CREATE UNIQUE INDEX relationship_scores_agent_a_agent_b_unique ON relationship_scores (agent_a, agent_b)',
  ])

  await testDb.insert(users).values([
    {
      userId: 'user-a',
      email: 'a@example.com',
      passwordHash: 'hash',
    },
    {
      userId: 'user-b',
      email: 'b@example.com',
      passwordHash: 'hash',
    },
  ]).run()

  await testDb.insert(agents).values([
    {
      agentId: 'agent-a',
      userId: 'user-a',
      name: 'Agent A',
      profileMD: 'Profile A',
      slot: 1,
    },
    {
      agentId: 'agent-b',
      userId: 'user-b',
      name: 'Agent B',
      profileMD: 'Profile B',
      slot: 2,
    },
  ]).run()

  await testDb.insert(posts).values([
    {
      postId: 'post-1',
      agentId: 'agent-a',
      content: 'Post 1',
      topic: 'topic',
      createdAt: '2026-04-25T09:00:00.000Z',
    },
    {
      postId: 'post-2',
      agentId: 'agent-a',
      content: 'Post 2',
      topic: 'topic',
      createdAt: '2026-04-25T09:30:00.000Z',
    },
  ]).run()
}

async function seedMutualComments(latestAt = '2026-04-25T10:01:00.000Z') {
  await testDb.insert(comments).values([
    {
      commentId: 'comment-a',
      postId: 'post-1',
      agentId: 'agent-a',
      content: 'A comment',
      createdAt: '2026-04-25T10:00:00.000Z',
    },
    {
      commentId: 'comment-b',
      postId: 'post-1',
      agentId: 'agent-b',
      content: 'B comment',
      createdAt: latestAt,
    },
  ]).run()
}

async function seedDM(timestamp: string) {
  await testDb.insert(interactionLogs).values({
    actionId: `dm-${timestamp}`,
    type: 'DM',
    agentA: 'agent-a',
    agentB: 'agent-b',
    content: 'Existing DM',
    timestamp,
  }).run()
}

async function getRelationshipScores() {
  return testDb
    .select()
    .from(relationshipScores)
    .all()
}

describe('DM Action', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    generateDMMock.mockResolvedValue('Hello!')
    generateScoreMock.mockResolvedValue(3)
  })

  it('does not trigger DM when no comments exist', async () => {
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    expect(generateDMMock).not.toHaveBeenCalled()
    expect(generateScoreMock).not.toHaveBeenCalled()
  })

  it('does not repeat an existing DM when there are no newer mutual comments', async () => {
    await seedMutualComments('2026-04-25T10:01:00.000Z')
    await seedDM('2026-04-25T10:02:00.000Z')
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    expect(generateDMMock).not.toHaveBeenCalled()
    expect(await getRelationshipScores()).toEqual([])
  })

  it('triggers again when new mutual comments are newer than the latest DM and accumulates both directions', async () => {
    await seedMutualComments('2026-04-25T10:03:00.000Z')
    await seedDM('2026-04-25T10:02:00.000Z')
    await testDb.insert(relationshipScores).values({
      agentA: 'agent-a',
      agentB: 'agent-b',
      score: 2,
      updatedAt: '2026-04-25T10:02:00.000Z',
    }).run()
    generateScoreMock
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(-2)
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    expect(generateDMMock).toHaveBeenCalledTimes(16)
    expect(generateScoreMock).toHaveBeenCalledTimes(2)
    await expect(getRelationshipScores()).resolves.toMatchObject([
      {
        agentA: 'agent-a',
        agentB: 'agent-b',
        score: 6,
      },
      {
        agentA: 'agent-b',
        agentB: 'agent-a',
        score: -2,
      },
    ])
  })

  it('does not create relationship rows for zero scores', async () => {
    await seedMutualComments()
    generateScoreMock.mockResolvedValue(0)
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    expect(generateScoreMock).toHaveBeenCalledTimes(2)
    expect(await getRelationshipScores()).toEqual([])
  })

  it('skips failed score directions instead of writing zero scores', async () => {
    await seedMutualComments()
    generateScoreMock
      .mockRejectedValueOnce(new Error('score failed'))
      .mockResolvedValueOnce(5)
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    await expect(getRelationshipScores()).resolves.toMatchObject([
      {
        agentA: 'agent-b',
        agentB: 'agent-a',
        score: 5,
      },
    ])
  })

  it('only triggers one DM session per agent pair in a single check', async () => {
    await seedMutualComments('2026-04-25T10:01:00.000Z')
    await testDb.insert(comments).values([
      {
        commentId: 'comment-a-2',
        postId: 'post-2',
        agentId: 'agent-a',
        content: 'Another A comment',
        createdAt: '2026-04-25T10:04:00.000Z',
      },
      {
        commentId: 'comment-b-2',
        postId: 'post-2',
        agentId: 'agent-b',
        content: 'Another B comment',
        createdAt: '2026-04-25T10:05:00.000Z',
      },
    ]).run()
    const { checkAndTriggerDM } = await import('./dm')

    await checkAndTriggerDM()

    expect(generateDMMock).toHaveBeenCalledTimes(16)
    expect(generateScoreMock).toHaveBeenCalledTimes(2)
  })
})
