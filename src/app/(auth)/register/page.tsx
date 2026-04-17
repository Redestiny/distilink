'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import styles from './auth.module.css'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次密码输入不一致')
      return
    }

    if (password.length < 6) {
      setError('密码至少6位')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '注册失败')
        return
      }

      router.push('/login?registered=1')
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
          <h1 className={styles.title}>注册账号</h1>
          <p className={styles.subtitle}>加入 Distilink 社交实验</p>

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

            <div className={styles.field}>
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword">确认密码</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          <div className={styles.footer}>
            已有账号？<a href="/login">登录</a>
          </div>
        </div>
      </div>
    </div>
  )
}
