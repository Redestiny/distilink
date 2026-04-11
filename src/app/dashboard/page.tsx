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
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetContact, setResetContact] = useState('')
  const [resetName, setResetName] = useState('')
  const [resetProfileMD, setResetProfileMD] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [decryptedContact, setDecryptedContact] = useState('')

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

  const openResetModal = async () => {
    try {
      const [profileRes, meRes] = await Promise.all([
        fetch('/api/agent/profile'),
        fetch('/api/auth/me'),
      ])
      const profile = await profileRes.json()
      const me = await meRes.json()
      setResetName(profile.name || '')
      setResetProfileMD(profile.profileMD || '')
      setDecryptedContact(me.user?.decryptedContact || '')
      setResetContact(me.user?.decryptedContact || '')
      setShowResetModal(true)
      setResetError('')
    } catch {
      setResetError('加载数据失败')
    }
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)

    try {
      const [contactRes, profileRes] = await Promise.all([
        fetch('/api/agent/contact', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact: resetContact }),
        }),
        fetch('/api/agent/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: resetName, profileMD: resetProfileMD }),
        }),
      ])

      const [contactData, profileData] = await Promise.all([
        contactRes.json(),
        profileRes.json(),
      ])

      if (!contactRes.ok) {
        setResetError(contactData.error || '联系方式保存失败')
        return
      }

      if (!profileRes.ok) {
        setResetError(profileData.error || 'Agent 保存失败')
        return
      }

      setUser((prev: any) => ({ ...prev, agentName: resetName }))
      setShowResetModal(false)
    } catch {
      setResetError('网络错误')
    } finally {
      setResetLoading(false)
    }
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
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>我的看板</h1>
              <p className={styles.subtitle}>Agent: {user?.agentName}</p>
            </div>
            <button onClick={openResetModal} className={styles.updateBtn}>
              更新 Agent
            </button>
          </div>
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

      {showResetModal && (
        <div className={styles.modalOverlay} onClick={() => setShowResetModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>更新 Agent</h2>
              <button onClick={() => setShowResetModal(false)} className={styles.modalClose}>
                ×
              </button>
            </div>
            <form onSubmit={handleResetSubmit} className={styles.modalForm}>
              <div className={styles.field}>
                <label htmlFor="resetContact">备用联系方式</label>
                <input
                  id="resetContact"
                  type="text"
                  value={resetContact}
                  onChange={(e) => setResetContact(e.target.value)}
                  placeholder="微信/Telegram/手机号等"
                  required
                />
                <span className={styles.hint}>匹配成功后双方将可见此联系方式</span>
              </div>

              <div className={styles.field}>
                <label htmlFor="resetName">Agent 名称</label>
                <input
                  id="resetName"
                  type="text"
                  value={resetName}
                  onChange={(e) => setResetName(e.target.value)}
                  placeholder="给你的 AI 替身起个名字"
                  maxLength={50}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="resetProfileMD">角色设定（Markdown）</label>
                <textarea
                  id="resetProfileMD"
                  value={resetProfileMD}
                  onChange={(e) => setResetProfileMD(e.target.value)}
                  rows={12}
                  maxLength={5000}
                  required
                />
                <span className={styles.hint}>
                  {resetProfileMD.length}/5000 字符
                  {resetProfileMD.length < 100 && '（至少需要100字符）'}
                </span>
              </div>

              {resetError && <div className={styles.error}>{resetError}</div>}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className={styles.cancelBtn}
                  disabled={resetLoading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={resetLoading || resetProfileMD.length < 100}
                >
                  {resetLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
