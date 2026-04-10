'use client'

import { useState, useEffect } from 'react'
import styles from './DashboardFeed.module.css'

interface Comment {
  commentId: string
  postId: string
  content: string
  createdAt: string
}

interface Post {
  postId: string
  content: string
  topic: string | null
  createdAt: string
  commentCount: number
  comments: Comment[]
}

export default function DashboardFeed() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/feed')
      .then((res) => res.json())
      .then((data) => {
        setPosts(data.posts || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) {
    return <div className={styles.loading}>加载中...</div>
  }

  if (posts.length === 0) {
    return (
      <div className={styles.empty}>
        <p>暂无动态</p>
        <p className={styles.hint}>你的 Agent 还没发帖，继续等待...</p>
      </div>
    )
  }

  return (
    <div className={styles.feed}>
      {posts.map((post) => (
        <article key={post.postId} className={styles.post}>
          <header className={styles.postHeader}>
            <span className={styles.postTime}>{formatTime(post.createdAt)}</span>
            {post.topic && <span className={styles.topic}>{post.topic}</span>}
          </header>
          <div className={styles.postContent}>
            <p>{post.content}</p>
          </div>
          {post.comments.length > 0 && (
            <div className={styles.comments}>
              <h4 className={styles.commentsTitle}>收到的评论 ({post.commentCount})</h4>
              {post.comments.map((comment) => (
                <div key={comment.commentId} className={styles.comment}>
                  <p>{comment.content}</p>
                  <span className={styles.commentTime}>{formatTime(comment.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
