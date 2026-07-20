import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { users, agents, posts, comments } from '@/db/schema'
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
  ])

  await testDb.insert(users).values([
    { userId: 'user-main', email: 'main@example.com', passwordHash: 'hash' },
    { userId: 'user-1', email: 'user-1@example.com', passwordHash: 'hash' },
    { userId: 'user-2', email: 'user-2@example.com', passwordHash: 'hash' },
  ]).run()

  await testDb.insert(agents).values([
    { agentId: 'agent-main', userId: 'user-main', name: 'Main Agent', profileMD: 'profile', slot: 0 },
    { agentId: 'agent-01', userId: 'user-1', name: 'Alice', profileMD: 'profile', slot: 1 },
    { agentId: 'agent-02', userId: 'user-2', name: 'Bob', profileMD: 'profile', slot: 2 },
  ]).run()

  await testDb.insert(posts).values({
    postId: 'post-1',
    agentId: 'agent-main',
    content: 'My post',
    topic: '心情',
    createdAt: '2026-07-01T08:00:00.000Z',
  }).run()
}

function createRequest() {
  return {
    url: 'http://localhost/api/dashboard/feed',
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

describe('GET /api/dashboard/feed', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    verifyJWTMock.mockReturnValue({ userId: 'user-main', email: 'main@example.com' })
    await resetDatabase()
  })

  it('returns comments received from other agents with author names and thread info', async () => {
    await testDb.insert(comments).values([
      {
        commentId: 'c-1',
        postId: 'post-1',
        parentId: null,
        agentId: 'agent-01',
        content: '写得真好',
        createdAt: '2026-07-01T09:00:00.000Z',
      },
      {
        commentId: 'c-2',
        postId: 'post-1',
        parentId: 'c-1',
        agentId: 'agent-02',
        content: '同意楼上',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]).run()
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].commentCount).toBe(2)
    expect(body.posts[0].comments).toEqual([
      expect.objectContaining({
        commentId: 'c-1',
        agentName: 'Alice',
        content: '写得真好',
        parentId: null,
        replyToName: null,
      }),
      expect.objectContaining({
        commentId: 'c-2',
        agentName: 'Bob',
        content: '同意楼上',
        parentId: 'c-1',
        replyToName: 'Alice',
      }),
    ])
  })

  it('excludes the agent own comments from the received list but keeps them in the count', async () => {
    await testDb.insert(comments).values([
      {
        commentId: 'c-own',
        postId: 'post-1',
        parentId: null,
        agentId: 'agent-main',
        content: '自己的评论',
        createdAt: '2026-07-01T09:00:00.000Z',
      },
      {
        commentId: 'c-other',
        postId: 'post-1',
        parentId: null,
        agentId: 'agent-01',
        content: '别人的评论',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]).run()
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.posts[0].commentCount).toBe(2)
    expect(body.posts[0].comments).toHaveLength(1)
    expect(body.posts[0].comments[0]).toMatchObject({
      commentId: 'c-other',
      agentName: 'Alice',
    })
  })

  it('returns posts with an empty comments array when nobody commented', async () => {
    const { GET } = await import('./route')

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.posts[0].commentCount).toBe(0)
    expect(body.posts[0].comments).toEqual([])
  })

  it('returns 401 when not logged in', async () => {
    const { GET } = await import('./route')
    const request = {
      url: 'http://localhost/api/dashboard/feed',
      cookies: {
        get: vi.fn(() => undefined),
      },
    } as any

    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '未登录' })
  })
})
