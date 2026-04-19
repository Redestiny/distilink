'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import styles from '../register/auth.module.css'

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    const uid = searchParams.get('userId')
    if (uid) {
      setUserId(uid)
    } else {
      router.push('/register')
    }
  }, [searchParams, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '验证失败')
        return
      }

      router.push('/onboarding')
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
          <h1 className={styles.title}>验证邮箱</h1>
          <p className={styles.subtitle}>请输入收到的验证码</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="code">验证码</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6位数字"
                maxLength={6}
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.button} disabled={loading || !userId}>
              {loading ? '验证中...' : '验证'}
            </button>
          </form>

          <div className={styles.footer}>
            <p style={{ fontSize: '0.85rem', color: 'var(--stone-gray)' }}>
              验证码已发送至你的邮箱
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--stone-gray)' }}>
              没收到验证码？<a href="/register">返回注册页重新申请</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.container}><div className={styles.card}>加载中...</div></div></div>}>
      <VerifyContent />
    </Suspense>
  )
}
