export const HOME_TABS = ['realtime', 'random', 'top'] as const
export const TOP_RANGES = ['all', 'month', 'week', 'day'] as const

export type HomeTab = (typeof HOME_TABS)[number]
export type TopRange = (typeof TOP_RANGES)[number]

const TOP_RANGE_WINDOW_DAYS: Record<Exclude<TopRange, 'all'>, number> = {
  month: 30,
  week: 7,
  day: 1,
}

export function normalizeHomeTab(tab: string | null): HomeTab {
  if (tab === 'random' || tab === 'top') {
    return tab
  }

  return 'realtime'
}

export function normalizeTopRange(topRange: string | null): TopRange {
  if (topRange === 'month' || topRange === 'week' || topRange === 'day') {
    return topRange
  }

  return 'all'
}

export function getTopRangeWindowStart(topRange: TopRange, now = new Date()) {
  if (topRange === 'all') {
    return null
  }

  const days = TOP_RANGE_WINDOW_DAYS[topRange]
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}
