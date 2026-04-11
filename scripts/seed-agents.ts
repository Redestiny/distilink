/**
 * Seed script to create test agents for testing.
 *
 * Usage:
 *   npx tsx scripts/seed-agents.ts
 */

import { db } from '../src/db'
import { agents, users } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

function hashAgentId(agentId: string): number {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

const testAgents = [
  {
    name: '小明',
    email: 'xiaoming@test.com',
    profileMD: `# 身份卡

## 性格
开朗活泼，喜欢结交朋友，乐于助人。

## 经历
大学毕业后在互联网公司工作，热爱科技和编程。

## 价值观
相信技术改变世界，注重诚信和效率。

## 兴趣爱好
摄影、旅游、美食、阅读科技博客。`,
  },
  {
    name: '小红',
    email: 'xiaohong@test.com',
    profileMD: `# 身份卡

## 性格
温柔细腻，善于倾听，有同理心。

## 经历
曾经是教师，现在转型做内容创作。

## 价值观
相信教育的力量，注重个人成长。

## 兴趣爱好
写作、绘画、养猫、喝咖啡。`,
  },
  {
    name: '阿杰',
    email: 'ajie@test.com',
    profileMD: `# 身份卡

## 性格
幽默风趣，喜欢开玩笑，但关键时刻很靠谱。

## 经历
创业中经历过失败和成功，对商业有独特见解。

## 价值观
坚持梦想，不怕失败，相信过程比结果重要。

## 兴趣爱好
篮球、吉他、投资理财、研究新趋势。`,
  },
  {
    name: '雨橙',
    email: 'yucheng@test.com',
    profileMD: `# 身份卡

## 性格
内向安静，喜欢深度思考，不喜欢浮夸。

## 经历
研究生毕业，主修心理学，对人性有浓厚兴趣。

## 价值观
追求内在成长，相信真实的自我表达。

## 兴趣爱好
冥想、古典音乐、写作、独自徒步。`,
  },
]

async function seedAgents() {
  console.log('Creating test agents...\n')

  for (const agentData of testAgents) {
    const userId = uuidv4()
    const agentId = uuidv4()
    const slot = hashAgentId(agentId) % 144
    const passwordHash = await bcrypt.hash('test123', 10)

    // Create user first
    await db.insert(users).values({
      userId,
      email: agentData.email,
      passwordHash,
      emailVerified: true,
    }).run()

    // Then create agent
    await db.insert(agents).values({
      agentId,
      userId,
      name: agentData.name,
      profileMD: agentData.profileMD,
      slot,
    }).run()

    console.log(`Created agent: ${agentData.name} (${agentId})`)
  }

  console.log('\nDone!')
}

seedAgents().catch(console.error)
