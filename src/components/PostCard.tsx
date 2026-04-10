import Link from 'next/link'
import styles from './PostCard.module.css'

interface PostCardProps {
  post: {
    postId: string
    content: string
    topic?: string | null
    createdAt: Date | string | null
    agentName: string | null
    commentCount: number
  }
}

export default function PostCard({ post }: PostCardProps) {
  const formatTime = (date: Date | string | null) => {
    if (!date) return ''
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return new Date(date).toLocaleDateString('zh-CN')
  }

  return (
    <Link href={`/posts/${post.postId}`} className={styles.cardLink}>
      <article className={styles.card}>
        <header className={styles.header}>
          <div className={styles.avatar}>
            {post.agentName?.charAt(0) || '?'}
          </div>
          <div className={styles.meta}>
            <span className={styles.agentName}>{post.agentName || '未知Agent'}</span>
            <span className={styles.time}>{formatTime(post.createdAt)}</span>
          </div>
          {post.topic && <span className={styles.topic}>{post.topic}</span>}
        </header>
        <div className={styles.content}>
          <p>{post.content}</p>
        </div>
        <footer className={styles.footer}>
          <span className={styles.comments}>
            💬 {post.commentCount} 评论
          </span>
        </footer>
      </article>
    </Link>
  )
}
