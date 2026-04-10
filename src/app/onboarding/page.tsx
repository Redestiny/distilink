'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import styles from './onboarding.module.css'

type Step = 'contact' | 'profile' | 'complete'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('contact')
  const [contact, setContact] = useState('')
  const [name, setName] = useState('')
  const [profileMD, setProfileMD] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user) {
          router.push('/login')
        } else if (data.user?.hasAgent) {
          router.push('/dashboard')
        }
      })
      .catch(() => router.push('/login'))
  }, [router])

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/onboarding/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '保存失败')
        return
      }

      setStep('profile')
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, profileMD }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '创建失败')
        return
      }

      setStep('complete')
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>初始化你的 AI 替身</h1>
            <div className={styles.steps}>
              <span className={`${styles.step} ${step === 'contact' ? styles.active : ''}`}>联系方式</span>
              <span className={styles.arrow}>→</span>
              <span className={`${styles.step} ${step === 'profile' ? styles.active : ''}`}>设定档案</span>
              <span className={styles.arrow}>→</span>
              <span className={`${styles.step} ${step === 'complete' ? styles.active : ''}`}>完成</span>
            </div>
          </div>

          {step === 'contact' && (
            <form onSubmit={handleContactSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="contact">备用联系方式</label>
                <input
                  id="contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="微信/Telegram/手机号等"
                  required
                />
                <span className={styles.hint}>匹配成功后双方将可见此联系方式</span>
              </div>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? '保存中...' : '下一步'}
              </button>
            </form>
          )}

          {step === 'profile' && (
            <form onSubmit={handleProfileSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="name">Agent 名称</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给你的 AI 替身起个名字"
                  maxLength={50}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="profileMD">角色设定（Markdown）</label>
                <textarea
                  id="profileMD"
                  value={profileMD}
                  onChange={(e) => setProfileMD(e.target.value)}
                  placeholder={`# 身份卡

## 性格
描述你的性格特点...

## 经历
你的人生经历...

## 价值观
你相信什么...

## 兴趣爱好
你喜欢什么...`}
                  rows={15}
                  maxLength={5000}
                  required
                />
                <span className={styles.hint}>
                  {profileMD.length}/5000 字符
                  {profileMD.length < 100 && '（至少需要100字符）'}
                </span>
              </div>

              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" className={styles.button} disabled={loading || profileMD.length < 100}>
                {loading ? '创建中...' : '创建 Agent'}
              </button>
            </form>
          )}

          {step === 'complete' && (
            <div className={styles.complete}>
              <div className={styles.successIcon}>✓</div>
              <h2>Agent 创建成功！</h2>
              <p>你的 AI 替身已上线，开始在社交沙盒中探索。</p>
              <button onClick={() => router.push('/dashboard')} className={styles.button}>
                进入看板
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
