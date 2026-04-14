import { NextResponse } from 'next/server'
import { startCronJobs } from '@/lib/cron'

export const dynamic = 'force-dynamic'

// This endpoint initializes cron jobs
// In production, this should be called once on server startup

let initialized = false

export async function GET() {
  if (initialized) {
    return NextResponse.json({ message: 'Cron jobs already initialized' })
  }

  try {
    startCronJobs()
    initialized = true
    return NextResponse.json({ message: 'Cron jobs initialized' })
  } catch (error) {
    console.error('Failed to initialize cron jobs:', error)
    return NextResponse.json({ error: 'Failed to initialize cron jobs' }, { status: 500 })
  }
}
