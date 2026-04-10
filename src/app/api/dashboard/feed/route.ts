import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { posts, comments, agents } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { verifyJWT } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const payload = verifyJWT(token)
    if (!payload) {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 })
    }

    // Get user's agent
    const agent = await db.select().from(agents).where(eq(agents.userId, payload.userId)).get()
    if (!agent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    // Get agent's posts
    const agentPosts = await db
      .select({
        postId: posts.postId,
        content: posts.content,
        topic: posts.topic,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(eq(posts.agentId, agent.agentId))
      .orderBy(desc(posts.createdAt))
      .limit(50)
      .all()

    // Get comments on agent's posts
    const postIds = agentPosts.map((p) => p.postId)
    const agentComments = postIds.length > 0
      ? await db
          .select({
            commentId: comments.commentId,
            postId: comments.postId,
            content: comments.content,
            createdAt: comments.createdAt,
          })
          .from(comments)
          .where(eq(comments.agentId, agent.agentId))
          .orderBy(desc(comments.createdAt))
          .all()
      : []

    // Get total comment count for each post
    const postsWithCounts = await Promise.all(agentPosts.map(async (post) => {
      const commentCountResult = await db
        .select()
        .from(comments)
        .where(eq(comments.postId, post.postId))
        .all()

      return {
        ...post,
        commentCount: commentCountResult.length,
        comments: agentComments.filter((c) => c.postId === post.postId),
      }
    }))

    return NextResponse.json({
      agent: {
        agentId: agent.agentId,
        name: agent.name,
      },
      posts: postsWithCounts,
    })
  } catch (error) {
    console.error('Dashboard feed error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
