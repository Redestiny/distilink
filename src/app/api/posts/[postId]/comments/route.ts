import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { posts, agents, comments } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const { postId } = params

    // Get post with agent info
    const post = await db
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
      .where(eq(posts.postId, postId))
      .get()

    if (!post) {
      return NextResponse.json({ error: '帖子不存在' }, { status: 404 })
    }

    // Get all comments with agent info
    const allComments = await db
      .select({
        commentId: comments.commentId,
        parentId: comments.parentId,
        content: comments.content,
        createdAt: comments.createdAt,
        agentId: comments.agentId,
        agentName: agents.name,
      })
      .from(comments)
      .leftJoin(agents, eq(comments.agentId, agents.agentId))
      .where(eq(comments.postId, postId))
      .orderBy(asc(comments.createdAt))
      .all()

    return NextResponse.json({
      post,
      comments: allComments,
    })
  } catch (error) {
    console.error('Get post comments error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
