'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface DashboardFeedResponse {
  posts: Post[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface DashboardFeedProps {
  scrollTargetId?: string
}

const DASHBOARD_FEED_SCROLL_OFFSET = 96

function parsePageParam(pageParam: string | null) {
  const parsedPage = Number.parseInt(pageParam || '1', 10)
  if (Number.isNaN(parsedPage) || parsedPage < 1) {
    return 1
  }

  return parsedPage
}

function buildDashboardPageHref(page: number, currentSearch: string) {
  const params = new URLSearchParams(currentSearch)

  if (page <= 1) {
    params.delete('page')
  } else {
    params.set('page', String(page))
  }

  const query = params.toString()
  return query ? `/dashboard?${query}` : '/dashboard'
}

function DashboardFeedContent({ scrollTargetId }: DashboardFeedProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSearch = searchParams.toString()
  const currentPage = parsePageParam(searchParams.get('page'))
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 5,
    total: 0,
    totalPages: 0,
  })
  const pendingScrollPageRef = useRef<number | null>(null)

  useEffect(() => {
    let isMounted = true

    setLoading(true)

    fetch(`/api/dashboard/feed?page=${currentPage}`)
      .then((res) => res.json())
      .then((data: DashboardFeedResponse) => {
        if (!isMounted) return
        setPosts(data.posts || [])
        setPagination({
          page: data.page || 1,
          pageSize: data.pageSize || 5,
          total: data.total || 0,
          totalPages: data.totalPages || 0,
        })

        const serverPage = data.page || 1
        if (serverPage !== currentPage) {
          router.replace(buildDashboardPageHref(serverPage, currentSearch), { scroll: false })
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentPage, currentSearch, router])

  useEffect(() => {
    if (loading || pendingScrollPageRef.current === null || pendingScrollPageRef.current !== pagination.page) {
      return
    }

    const targetElement = scrollTargetId ? document.getElementById(scrollTargetId) : null
    const top = targetElement
      ? Math.max(targetElement.getBoundingClientRect().top + window.scrollY - DASHBOARD_FEED_SCROLL_OFFSET, 0)
      : 0

    window.scrollTo({ top })
    pendingScrollPageRef.current = null
  }, [loading, pagination.page, scrollTargetId])

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

  const handlePageChange = (nextPage: number) => {
    if (loading || nextPage === pagination.page || nextPage < 1 || nextPage > pagination.totalPages) {
      return
    }

    pendingScrollPageRef.current = nextPage
    router.push(buildDashboardPageHref(nextPage, currentSearch), { scroll: false })
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

      {pagination.totalPages > 1 && (
        <nav className={styles.pagination} aria-label="动态分页">
          <button
            type="button"
            className={styles.paginationBtn}
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            上一页
          </button>
          <span className={styles.paginationInfo}>
            第 {pagination.page} / {pagination.totalPages} 页
          </span>
          <button
            type="button"
            className={styles.paginationBtn}
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={loading || pagination.page >= pagination.totalPages}
          >
            下一页
          </button>
        </nav>
      )}
    </div>
  )
}

export default function DashboardFeed(props: DashboardFeedProps) {
  return (
    <Suspense fallback={<div className={styles.loading}>加载中...</div>}>
      <DashboardFeedContent {...props} />
    </Suspense>
  )
}
