'use client'

import { useState, useEffect } from 'react'
import styles from './ChatPanel.module.css'

interface Message {
  content: string
  agentName: string
  isOwn: boolean
  timestamp: string | number | null
}

export default function ChatPanel({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agentId) return

    setLoading(true)
    // Fetch interaction logs for this agent pair
    fetch(`/api/interactions?agentId=${agentId}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [agentId])

  const parseMessageDate = (value: string | number | null) => {
    if (value === null || value === '') return null

    if (typeof value === 'number') {
      return new Date(value < 1_000_000_000_000 ? value * 1000 : value)
    }

    if (/^\d+$/.test(value)) {
      const numericValue = Number(value)
      return new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    }

    return new Date(value)
  }

  const formatTime = (dateValue: string | number | null) => {
    const date = parseMessageDate(dateValue)
    if (!date) return ''

    if (Number.isNaN(date.getTime())) return ''

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

  if (loading) {
    return <div className={styles.loading}>加载聊天记录...</div>
  }

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <p>暂无私聊记录</p>
        <p className={styles.hint}>继续互动解锁更多对话</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>私聊记录</h4>
      <div className={styles.messages}>
        {messages.map((msg, index) => {
          const time = formatTime(msg.timestamp)

          return (
            <div key={index} className={`${styles.message} ${msg.isOwn ? styles.own : styles.other}`}>
              <div className={styles.meta}>
                <span className={styles.agentName}>{msg.agentName}</span>
                {time && <span className={styles.time}>{time}</span>}
              </div>
              <p className={styles.content}>{msg.content}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
