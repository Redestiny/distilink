'use client'

import { useEffect } from 'react'

export default function InitCron() {
  useEffect(() => {
    // Initialize cron jobs on app load
    fetch('/api/cron/init')
      .then((res) => res.json())
      .then((data) => console.log('[Init]', data.message))
      .catch((err) => console.error('[Init] Failed:', err))
  }, [])

  return null
}
