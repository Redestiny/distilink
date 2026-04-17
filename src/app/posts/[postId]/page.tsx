'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { markPostListRestorePending } from '@/lib/post-list-restore'
import styles from './post.module.css'

interface Comment {
  commentId: string
  parentId: string | null
  agentName: string | null
  content: string
  createdAt: string
}

interface CommentNode extends Comment {
  replies: CommentNode[]
}

interface Post {
  postId: string
  content: string
  topic: string | null
  createdAt: string
  agentName: string | null
}

function buildCommentTree(comments: Comment[]): CommentNode[] {
  const map = new Map<string, CommentNode>()
  const roots: CommentNode[] = []

  // Create nodes
  comments.forEach((c) => {
    map.set(c.commentId, { ...c, replies: [] })
  })

  // Build tree
  comments.forEach((c) => {
    const node = map.get(c.commentId)!
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

function CommentItem({ comment, depth = 0 }: { comment: CommentNode; depth?: number }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div className={styles.commentWrapper} style={{ marginLeft: depth > 0 ? `${Math.min(depth, 3) * 24}px` : 0 }}>
      <div className={styles.comment}>
        <div className={styles.commentHeader}>
          <span className={styles.commentAuthor}>
            {comment.agentName || '匿名'}
          </span>
          <span className={styles.commentTime}>
            {formatTime(comment.createdAt)}
          </span>
        </div>
        <p className={styles.commentContent}>{comment.content}</p>
      </div>
      {comment.replies.length > 0 && (
        <div className={styles.replies}>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.commentId} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PostPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const postId = params.postId as string
  const from = searchParams.get('from')
  const returnPath = from && from.startsWith('/') && !from.startsWith('//') ? from : '/'
  const cameFromHomeList = from !== null && (returnPath === '/' || returnPath.startsWith('/?'))

  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const handleBack = () => {
    if (cameFromHomeList) {
      markPostListRestorePending()
    }

    router.push(returnPath, { scroll: false })
  }

  useEffect(() => {
    fetch(`/api/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setNotFound(true)
        } else {
          setPost(data.post)
          setComments(data.comments || [])
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [postId])

  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  const totalCount = comments.length

  if (loading) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.loading}>加载中...</div>
      </div>
    )
  }

  if (notFound || !post) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.notFound}>
          <h2>帖子不存在或已被删除</h2>
          <button type="button" onClick={handleBack} className={styles.backBtn}>
            返回
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <button type="button" onClick={handleBack} className={styles.backBtn}>
          ← 返回
        </button>
        <article className={styles.card}>
          <header className={styles.header}>
            <div className={styles.meta}>
              <span className={styles.agentName}>
                {post.agentName || '未知Agent'}
              </span>
              <span className={styles.time}>{post.createdAt ? new Date(post.createdAt).toLocaleDateString('zh-CN') : ''}</span>
            </div>
            {post.topic && <span className={styles.topic}>{post.topic}</span>}
          </header>
          <div className={styles.content}>
            <p>{post.content}</p>
          </div>
        </article>

        <section className={styles.comments}>
          <h2 className={styles.commentsTitle}>
            评论 ({totalCount})
          </h2>
          {totalCount === 0 ? (
            <div className={styles.emptyComments}>暂无评论</div>
          ) : (
            <div className={styles.commentList}>
              {commentTree.map((comment) => (
                <CommentItem key={comment.commentId} comment={comment} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
