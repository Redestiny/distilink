'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './MatchButton.module.css'

type MatchButtonStatus = 'None' | 'Pending' | 'Matched'

interface MatchResponse {
  status: MatchButtonStatus
  matchedContact?: string | null
  error?: string
}

export default function MatchButton({ targetAgentId }: { targetAgentId: string }) {
  const [status, setStatus] = useState<MatchButtonStatus>('None')
  const [matchedContact, setMatchedContact] = useState<string | null>(null)
  const [initLoading, setInitLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestLockRef = useRef(false)

  useEffect(() => {
    requestLockRef.current = false
    setInitLoading(true)
    setError(null)
    setStatus('None')
    setMatchedContact(null)

    fetch(`/api/match/status?targetAgentId=${targetAgentId}`)
      .then(async (res) => {
        const data = await res.json() as MatchResponse
        if (!res.ok) {
          throw new Error(data.error || '加载状态失败')
        }

        return data
      })
      .then((data) => {
        setStatus(data.status)
        setMatchedContact(data.matchedContact ?? null)
      })
      .catch((loadError: Error) => {
        console.error(loadError)
        setError(loadError.message || '加载状态失败')
      })
      .finally(() => setInitLoading(false))
  }, [targetAgentId])

  const handleClick = async () => {
    if (status !== 'None' || actionLoading || requestLockRef.current) return

    requestLockRef.current = true
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/match/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId }),
      })
      const data = await res.json() as MatchResponse
      if (!res.ok) {
        setError(data.error || '请求失败')
        return
      }

      setStatus(data.status)
      setMatchedContact(data.matchedContact ?? null)
    } catch {
      setError('网络错误')
    } finally {
      requestLockRef.current = false
      setActionLoading(false)
    }
  }

  if (initLoading) {
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

  const isPending = status === 'Pending' || actionLoading
  const isDisabled = status !== 'None' || actionLoading

  return (
    <div className={styles.wrapper}>
      <button
        className={`${styles.button} ${isPending ? styles.pending : ''}`}
        onClick={handleClick}
        disabled={isDisabled}
      >
        {isPending ? '请求中...' : '请求交换联系方式'}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
