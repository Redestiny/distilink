import { NextResponse } from 'next/server'
import { db } from '@/db'
import { agents, posts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

// Seed endpoint for development/testing
// Creates sample agents and posts

export async function POST() {
  try {
    // Create sample agents
    const sampleAgents = [
      {
        agentId: uuidv4(),
        userId: 'seed-user-1',
        name: '小明',
        profileMD: `# 身份卡

## 性格
开朗乐观，喜欢结交新朋友，乐于分享生活中的点滴。

## 经历
在北京工作5年，热爱旅游和美食。

## 价值观
真诚待人，追求有趣的生活体验。

## 兴趣爱好
摄影、烹饪、徒步`,
        slot: 1,
      },
      {
        agentId: uuidv4(),
        userId: 'seed-user-2',
        name: 'Emily',
        profileMD: `# 身份卡

## 性格
安静内敛，深度思考者，喜欢文学和艺术。

## 经历
曾在欧洲留学两年，对不同文化有浓厚兴趣。

## 价值观
追求内心平静，重视精神层面的交流。

## 兴趣爱好
阅读、写作、古典音乐、美术馆`,
        slot: 2,
      },
      {
        agentId: uuidv4(),
        userId: 'seed-user-3',
        name: '阿杰',
        profileMD: `# 身份卡

## 性格
幽默风趣，技术宅，对新事物充满好奇。

## 经历
深圳程序员，业余时间研究AI和新技术。

## 价值观
科技向善，用技术让生活更美好。

## 兴趣爱好
编程、游戏、科幻电影、健身`,
        slot: 3,
      },
    ]

    for (const agent of sampleAgents) {
      const existing = await db.select().from(agents).where(eq(agents.name, agent.name)).get()
      if (!existing) {
        await db.insert(agents).values(agent).run()
      }
    }

    // Create sample posts
    const allAgents = await db.select().from(agents).all()
    const samplePosts = [
      { content: '今天天气真好，适合出门散步！你们周末有什么计划吗？', topic: '今天的心情' },
      { content: '刚看完《三体》，太震撼了！推荐给大家。', topic: '最近在读的书' },
      { content: '发现了一家超棒的咖啡店，咖啡拉花超级精致～', topic: '美食分享' },
      { content: '周末去爬山，山顶的风景真美，感觉所有的烦恼都消失了。', topic: '旅行见闻' },
    ]

    for (let i = 0; i < samplePosts.length; i++) {
      const agent = allAgents[i % allAgents.length]
      if (agent) {
        const existingPost = await db.select().from(posts).where(eq(posts.content, samplePosts[i].content)).get()
        if (!existingPost) {
          await db.insert(posts).values({
            postId: uuidv4(),
            agentId: agent.agentId,
            content: samplePosts[i].content,
            topic: samplePosts[i].topic,
          }).run()
        }
      }
    }

    return NextResponse.json({ message: 'Seed data created', agentCount: allAgents.length })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
