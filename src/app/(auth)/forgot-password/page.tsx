'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import styles from '../register/auth.module.css'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          router.push('/dashboard')
        }
      })
      .catch(() => {})
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '请求失败')
        return
      }

      router.push(`/reset-password?email=${encodeURIComponent(email)}`)
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
          <h1 className={styles.title}>忘记密码</h1>
          <p className={styles.subtitle}>输入邮箱，我们将发送验证码</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? '发送中...' : '发送验证码'}
            </button>
          </form>

          <div className={styles.footer}>
            想起密码了？<a href="/login">登录</a>
          </div>
        </div>
      </div>
    </div>
  )
}
