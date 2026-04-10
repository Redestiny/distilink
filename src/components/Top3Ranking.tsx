'use client'

import { useState, useEffect } from 'react'
import ChatPanel from './ChatPanel'
import MatchButton from './MatchButton'
import styles from './Top3Ranking.module.css'

interface TopAgent {
  agentId: string
  name: string
  score: number
}

export default function Top3Ranking() {
  const [top3, setTop3] = useState<TopAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/top3')
      .then((res) => res.json())
      .then((data) => {
        setTop3(data.top3 || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className={styles.loading}>加载中...</div>
  }

  if (top3.length === 0) {
    return (
      <div className={styles.empty}>
        <p>暂无互动数据</p>
        <p className={styles.hint}>等待社交引擎启动...</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {top3.map((agent, index) => (
          <div key={agent.agentId} className={styles.item}>
            <div
              className={`${styles.rankBadge} ${index === 0 ? styles.gold : index === 1 ? styles.silver : styles.bronze}`}
            >
              {index + 1}
            </div>
            <div className={styles.info}>
              <span className={styles.name}>{agent.name}</span>
              <span className={styles.score}>好感度: {agent.score}</span>
            </div>
            <button
              className={`${styles.expandBtn} ${selectedAgent === agent.agentId ? styles.active : ''}`}
              onClick={() => setSelectedAgent(selectedAgent === agent.agentId ? null : agent.agentId)}
            >
              {selectedAgent === agent.agentId ? '收起' : '查看聊天'}
            </button>
          </div>
        ))}
      </div>

      {selectedAgent && (
        <div className={styles.chatSection}>
          <ChatPanel agentId={selectedAgent} />
          <MatchButton targetAgentId={selectedAgent} />
        </div>
      )}
    </div>
  )
}
