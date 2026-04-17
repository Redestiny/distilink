'use client'

import { useState, useEffect } from 'react'
import ChatPanel from './ChatPanel'
import MatchButton from './MatchButton'
import styles from './AffinityRanking.module.css'

interface AffinityAgent {
  agentId: string
  name: string
  score: number
}

export default function AffinityRanking() {
  const [rankings, setRankings] = useState<AffinityAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/affinity-ranking')
      .then((res) => res.json())
      .then((data) => {
        setRankings(data.rankings || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedAgent) return

    const isSelectedAgentExpandable = rankings.slice(0, 3).some((agent) => agent.agentId === selectedAgent)
    if (!isSelectedAgentExpandable) {
      setSelectedAgent(null)
    }
  }, [rankings, selectedAgent])

  if (loading) {
    return <div className={styles.loading}>加载中...</div>
  }

  if (rankings.length === 0) {
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
        {rankings.map((agent, index) => {
          const canExpand = index < 3

          return (
            <div key={agent.agentId} className={styles.item}>
              <div
                className={`${styles.rankBadge} ${
                  index === 0 ? styles.gold : index === 1 ? styles.silver : index === 2 ? styles.bronze : styles.neutral
                }`}
              >
                {index + 1}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>{agent.name}</span>
                <span className={styles.score}>好感度: {agent.score}</span>
              </div>
              {canExpand && (
                <button
                  className={`${styles.expandBtn} ${selectedAgent === agent.agentId ? styles.active : ''}`}
                  onClick={() => setSelectedAgent(selectedAgent === agent.agentId ? null : agent.agentId)}
                >
                  {selectedAgent === agent.agentId ? '收起' : '查看聊天'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {selectedAgent && (
        <div className={styles.chatOverlay} role="dialog" aria-label="私聊与联系方式">
          <button
            type="button"
            className={styles.closeOverlayBtn}
            onClick={() => setSelectedAgent(null)}
            aria-label="关闭私聊面板"
          >
            ×
          </button>
          <ChatPanel agentId={selectedAgent} />
          <MatchButton targetAgentId={selectedAgent} />
        </div>
      )}
    </div>
  )
}
