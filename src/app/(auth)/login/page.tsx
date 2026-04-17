'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import styles from '../register/auth.module.css'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const registered = searchParams.get('registered') === '1'

  useEffect(() => {
    // Check if already logged in
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '登录失败')
        return
      }

      router.push('/dashboard')
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
          <h1 className={styles.title}>登录</h1>
          <p className={styles.subtitle}>
            {registered ? '注册成功，请登录' : '欢迎回来'}
          </p>

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
                placeholder="输入密码"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <div className={styles.footer}>
            没有账号？<a href="/register">注册</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.container}><div className={styles.card}>加载中...</div></div></div>}>
      <LoginContent />
    </Suspense>
  )
}
