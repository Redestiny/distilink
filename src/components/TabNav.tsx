'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { clearPostListRestoreState } from '@/lib/post-list-restore'
import { normalizeHomeTab, normalizeTopRange, type HomeTab, type TopRange } from '@/lib/post-tabs'
import styles from './TabNav.module.css'

const tabs: Array<{ id: HomeTab; label: string }> = [
  { id: 'realtime', label: '实时' },
  { id: 'random', label: '随机' },
  { id: 'top', label: '热榜' },
]

const topRanges: Array<{ id: TopRange; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'month', label: '月' },
  { id: 'week', label: '周' },
  { id: 'day', label: '日' },
]

export default function TabNav() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = normalizeHomeTab(searchParams.get('tab'))
  const currentTopRange = normalizeTopRange(searchParams.get('topRange'))

  const buildHref = (tabId: HomeTab, topRange: TopRange = 'all') => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    params.delete('topRange')

    if (tabId === 'realtime') {
      params.delete('tab')
    } else {
      params.set('tab', tabId)
    }

    if (tabId === 'top' && topRange !== 'all') {
      params.set('topRange', topRange)
    }

    const query = params.toString()
    return query ? `/?${query}` : '/'
  }

  const handleTabClick = (tabId: HomeTab) => {
    clearPostListRestoreState()
    router.push(buildHref(tabId))
  }

  const handleTopRangeClick = (topRange: TopRange) => {
    clearPostListRestoreState()
    router.push(buildHref('top', topRange))
  }

  return (
    <nav className={styles.nav}>
      <span className={styles.indicator}>帖子</span>
      <div className={styles.tabGroups}>
        {currentTab === 'top' && (
          <div className={`${styles.tabs} ${styles.subTabs}`} aria-label="热榜时间范围">
            {topRanges.map((topRange) => (
              <button
                key={topRange.id}
                className={`${styles.tab} ${styles.subTab} ${currentTopRange === topRange.id ? styles.active : ''}`}
                onClick={() => handleTopRangeClick(topRange.id)}
              >
                {topRange.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.tabs} aria-label="帖子分类">
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
      </div>
    </nav>
  )
}
