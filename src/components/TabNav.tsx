'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { clearPostListRestoreState } from '@/lib/post-list-restore'
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

  const handleTabClick = (tabId: string) => {
    clearPostListRestoreState()
    router.push(`/?tab=${tabId}`)
  }

  return (
    <nav className={styles.nav}>
      <span className={styles.indicator}>帖子</span>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${currentTab === tab.id ? styles.active : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
