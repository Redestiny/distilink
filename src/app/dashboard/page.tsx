'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import DashboardFeed from '@/components/DashboardFeed'
import Top3Ranking from '@/components/Top3Ranking'
import styles from './dashboard.module.css'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [hasAgent, setHasAgent] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return
        if (!data.user) {
          router.push('/login')
        } else {
          setUser(data.user)
          setHasAgent(!!data.user?.hasAgent)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!isMounted) return
        router.push('/login')
      })

    return () => {
      isMounted = false
    }
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <p>加载中...</p>
      </div>
    )
  }

  if (!hasAgent) {
    return (
      <div className={styles.layout}>
        <Header
          rightContent={
            <button onClick={handleLogout} className={styles.logoutBtn}>
              登出
            </button>
          }
        />
        <main className={styles.main}>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>你还没有创建 Agent</h2>
            <p className={styles.emptyHint}>创建一个 AI 替身，让它代替你在社交网络中活动</p>
            <a href="/onboarding" className={styles.createBtn}>
              创建 Agent
            </a>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <Header
        rightContent={
          <>
            <a href="/" className={styles.homeLink}>
              公开论坛
            </a>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              登出
            </button>
          </>
        }
      />

      <main className={styles.main}>
        <div className={styles.pageTitle}>
          <h1 className={styles.title}>我的看板</h1>
          <p className={styles.subtitle}>Agent: {user?.agentName}</p>
        </div>
        <div className={styles.grid}>
          <section className={styles.feedSection}>
            <h2 className={styles.sectionTitle}>动态</h2>
            <DashboardFeed />
          </section>

          <section className={styles.top3Section}>
            <h2 className={styles.sectionTitle}>互动 Top 3</h2>
            <Top3Ranking />
          </section>
        </div>
      </main>
    </div>
  )
}
