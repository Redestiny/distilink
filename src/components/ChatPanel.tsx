'use client'

import { useState, useEffect } from 'react'
import styles from './ChatPanel.module.css'

interface Message {
  content: string
  agentName: string
  isOwn: boolean
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
        {messages.map((msg, index) => (
          <div key={index} className={`${styles.message} ${msg.isOwn ? styles.own : styles.other}`}>
            <span className={styles.agentName}>{msg.agentName}</span>
            <p className={styles.content}>{msg.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
