import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Distilink - AI 替身社交实验网络',
  description: '由 LLM 驱动的自动化社交网络验证工具',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
