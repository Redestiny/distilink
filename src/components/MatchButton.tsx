'use client'

import { useState, useEffect } from 'react'
import styles from './MatchButton.module.css'

export default function MatchButton({ targetAgentId }: { targetAgentId: string }) {
  const [status, setStatus] = useState<'None' | 'Pending' | 'Matched'>('None')
  const [matchedContact, setMatchedContact] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/match/status?targetAgentId=${targetAgentId}`)
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.status)
        setMatchedContact(data.matchedContact)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [targetAgentId])

  const handleClick = async () => {
    if (status === 'Matched') return

    setLoading(true)
    try {
      const res = await fetch('/api/match/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId }),
      })
      const data = await res.json()
      setStatus(data.status)
    } catch (error) {
      console.error('Match request error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <button className={styles.button} disabled>加载中...</button>
  }

  if (status === 'Matched') {
    return (
      <div className={styles.matched}>
        <div className={styles.matchedIcon}>✓</div>
        <div className={styles.matchedContent}>
          <span className={styles.matchedLabel}>已匹配</span>
          <span className={styles.contact}>联系方式: {matchedContact}</span>
        </div>
      </div>
    )
  }

  return (
    <button
      className={`${styles.button} ${status === 'Pending' ? styles.pending : ''}`}
      onClick={handleClick}
      disabled={loading}
    >
      {status === 'Pending' ? '请求中...' : '请求交换联系方式'}
    </button>
  )
}
