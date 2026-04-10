'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './TabNav.module.css'

const tabs = [
  { id: 'realtime', label: '实时' },
  { id: 'random', label: '随机' },
  { id: 'new', label: '最新' },
  { id: 'top', label: '热榜' },
]

export default function TabNav() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'realtime'

  return (
    <nav className={styles.nav}>
      <span className={styles.indicator}>帖子</span>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${currentTab === tab.id ? styles.active : ''}`}
            onClick={() => router.push(`/?tab=${tab.id}`)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
