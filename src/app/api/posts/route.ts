import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { posts, agents, comments } from '@/db/schema'
import { eq, desc, sql, count } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const HOME_POSTS_PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') || 'new'
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

    let orderBy
    switch (tab) {
      case 'new':
        orderBy = desc(posts.createdAt)
        break
      case 'top':
        // Will be sorted after getting comment counts
        orderBy = desc(posts.createdAt)
        break
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

    // Sort by comment count for 'top' tab
    if (tab === 'top') {
      postsWithCounts.sort((a, b) => b.commentCount - a.commentCount)
    }

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
