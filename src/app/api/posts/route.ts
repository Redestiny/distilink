import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { posts, agents, comments } from '@/db/schema'
import { eq, desc, asc, sql, count } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') || 'new'
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = 20
    const offset = (page - 1) * pageSize

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
      .limit(pageSize)
      .offset(tab === 'random' ? 0 : offset)
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
      pageSize,
      hasMore: postsWithCounts.length === pageSize,
    })
  } catch (error) {
    console.error('Get posts error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
