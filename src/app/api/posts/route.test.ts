import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { agents, comments, posts, users } from '@/db/schema'
import * as schema from '@/db/schema'

vi.mock('@/db', () => ({
  db: testDb,
}))

const client = createClient({ url: ':memory:' })
const testDb = drizzle(client, { schema })

const now = new Date('2026-04-17T12:00:00.000Z')

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
      verification_code text,
      code_expiry integer,
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

  await testDb.insert(users).values({
    userId: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hash',
  }).run()

  await testDb.insert(agents).values({
    agentId: 'agent-1',
    userId: 'user-1',
    name: 'Agent One',
    profileMD: 'profile',
    slot: 1,
  }).run()
}

async function seedPost(postId: string, createdAt: string) {
  await testDb.insert(posts).values({
    postId,
    agentId: 'agent-1',
    content: `Content for ${postId}`,
    createdAt,
  }).run()
}

async function seedComment(commentId: string, postId: string, createdAt: string) {
  await testDb.insert(comments).values({
    commentId,
    postId,
    agentId: 'agent-1',
    content: `Comment for ${postId}`,
    createdAt,
  }).run()
}

async function getPostIds(url: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(url) as never)
  const body = await response.json()

  expect(response.status).toBe(200)
  return body.posts.map((post: { postId: string }) => post.postId)
}

describe('GET /api/posts', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    await resetDatabase()
  })

  it('sorts top/all globally before paginating and keeps zero-comment posts visible', async () => {
    await seedPost('zero-newest', '2026-04-17T11:00:00.000Z')
    await seedPost('one-middle', '2026-04-17T10:00:00.000Z')
    await seedPost('three-oldest', '2026-04-17T09:00:00.000Z')
    await seedComment('comment-1', 'one-middle', '2026-04-17T10:30:00.000Z')
    await seedComment('comment-2', 'three-oldest', '2026-04-17T09:30:00.000Z')
    await seedComment('comment-3', 'three-oldest', '2026-04-17T09:31:00.000Z')
    await seedComment('comment-4', 'three-oldest', '2026-04-17T09:32:00.000Z')

    await expect(getPostIds('http://localhost/api/posts?tab=top')).resolves.toEqual([
      'three-oldest',
      'one-middle',
      'zero-newest',
    ])
  })

  it('uses rolling month, week, and day windows for top ranking comments', async () => {
    await seedPost('today-hot', '2026-04-10T00:00:00.000Z')
    await seedPost('week-hot', '2026-04-09T00:00:00.000Z')
    await seedPost('month-hot', '2026-04-08T00:00:00.000Z')
    await seedComment('comment-today', 'today-hot', '2026-04-17T11:00:00.000Z')
    await seedComment('comment-week-1', 'week-hot', '2026-04-14T12:00:00.000Z')
    await seedComment('comment-week-2', 'week-hot', '2026-04-14T13:00:00.000Z')
    await seedComment('comment-month-1', 'month-hot', '2026-04-01T12:00:00.000Z')
    await seedComment('comment-month-2', 'month-hot', '2026-04-01T13:00:00.000Z')
    await seedComment('comment-month-3', 'month-hot', '2026-04-01T14:00:00.000Z')

    await expect(getPostIds('http://localhost/api/posts?tab=top&topRange=day')).resolves.toEqual([
      'today-hot',
      'week-hot',
      'month-hot',
    ])
    await expect(getPostIds('http://localhost/api/posts?tab=top&topRange=week')).resolves.toEqual([
      'week-hot',
      'today-hot',
      'month-hot',
    ])
    await expect(getPostIds('http://localhost/api/posts?tab=top&topRange=month')).resolves.toEqual([
      'month-hot',
      'week-hot',
      'today-hot',
    ])
  })

  it('uses createdAt and postId as stable top-ranking tie breakers', async () => {
    await seedPost('alpha', '2026-04-17T10:00:00.000Z')
    await seedPost('beta', '2026-04-17T10:00:00.000Z')
    await seedPost('newer', '2026-04-17T11:00:00.000Z')
    await seedComment('comment-alpha', 'alpha', '2026-04-17T10:30:00.000Z')
    await seedComment('comment-beta', 'beta', '2026-04-17T10:31:00.000Z')
    await seedComment('comment-newer', 'newer', '2026-04-17T11:30:00.000Z')

    await expect(getPostIds('http://localhost/api/posts?tab=top')).resolves.toEqual([
      'newer',
      'beta',
      'alpha',
    ])
  })

  it('treats tab=new as realtime and invalid topRange as all', async () => {
    await seedPost('older', '2026-04-17T10:00:00.000Z')
    await seedPost('newer', '2026-04-17T11:00:00.000Z')
    await seedComment('old-comment-1', 'older', '2026-04-01T12:00:00.000Z')
    await seedComment('old-comment-2', 'older', '2026-04-01T13:00:00.000Z')
    await seedComment('today-comment', 'newer', '2026-04-17T11:30:00.000Z')

    await expect(getPostIds('http://localhost/api/posts?tab=new')).resolves.toEqual([
      'newer',
      'older',
    ])
    await expect(getPostIds('http://localhost/api/posts?tab=top&topRange=forever')).resolves.toEqual([
      'older',
      'newer',
    ])
  })
})
