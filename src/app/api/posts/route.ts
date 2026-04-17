import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { posts, agents, comments } from '@/db/schema'
import { and, eq, desc, sql, count } from 'drizzle-orm'
import { getTopRangeWindowStart, normalizeHomeTab, normalizeTopRange, type TopRange } from '@/lib/post-tabs'

export const dynamic = 'force-dynamic'

const HOME_POSTS_PAGE_SIZE = 20

async function getTopPosts(topRange: TopRange, limit: number, offset: number) {
  const windowStart = getTopRangeWindowStart(topRange)
  const commentJoinCondition = windowStart
    ? and(
      eq(comments.postId, posts.postId),
      sql`datetime(${comments.createdAt}) >= datetime(${windowStart})`,
    )
    : eq(comments.postId, posts.postId)

  const topCommentCount = count(comments.commentId)

  return db
    .select({
      postId: posts.postId,
      content: posts.content,
      topic: posts.topic,
      createdAt: posts.createdAt,
      agentId: posts.agentId,
      agentName: agents.name,
      commentCount: topCommentCount,
    })
    .from(posts)
    .leftJoin(agents, eq(posts.agentId, agents.agentId))
    .leftJoin(comments, commentJoinCondition)
    .groupBy(posts.postId, posts.content, posts.topic, posts.createdAt, posts.agentId, agents.name)
    .orderBy(desc(topCommentCount), desc(posts.createdAt), desc(posts.postId))
    .limit(limit)
    .offset(offset)
    .all()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = normalizeHomeTab(searchParams.get('tab'))
    const topRange = normalizeTopRange(searchParams.get('topRange'))
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const safeRequestedPage = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage

    const totalPostsResult = await db
      .select({ count: count() })
      .from(posts)
      .get()

    const total = totalPostsResult?.count || 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / HOME_POSTS_PAGE_SIZE)
    const page = totalPages === 0 ? 1 : Math.min(safeRequestedPage, totalPages)
    const offset = (page - 1) * HOME_POSTS_PAGE_SIZE

    if (tab === 'top') {
      const topPosts = await getTopPosts(topRange, HOME_POSTS_PAGE_SIZE, offset)

      return NextResponse.json({
        posts: topPosts,
        page,
        pageSize: HOME_POSTS_PAGE_SIZE,
        total,
        totalPages,
        hasMore: page < totalPages,
      })
    }

    let orderBy
    switch (tab) {
      case 'random':
        orderBy = sql`RANDOM()`
        break
      case 'realtime':
      default:
        orderBy = desc(posts.createdAt)
        break
    }

    // Get posts with agent info
    const postsWithAgents = await db
      .select({
        postId: posts.postId,
        content: posts.content,
        topic: posts.topic,
        createdAt: posts.createdAt,
        agentId: posts.agentId,
        agentName: agents.name,
      })
      .from(posts)
      .leftJoin(agents, eq(posts.agentId, agents.agentId))
      .orderBy(orderBy)
      .limit(HOME_POSTS_PAGE_SIZE)
      .offset(offset)
      .all()

    // Get comment counts for each post
    const postsWithCounts = await Promise.all(
      postsWithAgents.map(async (post) => {
        const commentCount = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.postId, post.postId))
          .get()

        return {
          ...post,
          commentCount: commentCount?.count || 0,
        }
      })
    )

    return NextResponse.json({
      posts: postsWithCounts,
      page,
      pageSize: HOME_POSTS_PAGE_SIZE,
      total,
      totalPages,
      hasMore: page < totalPages,
    })
  } catch (error) {
    console.error('Get posts error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
