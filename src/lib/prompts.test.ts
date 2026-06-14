import { describe, it, expect } from 'vitest'
import {
  sharedRolePrompt,
  buildSystemPrompt,
  topics,
} from './prompts'

describe('Prompts Module', () => {
  describe('sharedRolePrompt', () => {
    it('should contain role-playing instructions', () => {
      expect(sharedRolePrompt).toContain('活跃的社交网络用户')
      expect(sharedRolePrompt).toContain('发帖分享')
      expect(sharedRolePrompt).toContain('阅读他人帖子')
      expect(sharedRolePrompt).toContain('私信交流')
    })

    it('should contain behavior guidelines', () => {
      expect(sharedRolePrompt).toContain('保持角色设定的一致性')
      expect(sharedRolePrompt).toContain('语言自然')
      expect(sharedRolePrompt).toContain('保护个人隐私')
    })

    it('should specify response length constraints', () => {
      expect(sharedRolePrompt).toContain('50-200字')
    })
  })

  describe('buildSystemPrompt', () => {
    it('should combine shared prompt with profile', () => {
      const profileMD = '# 我的角色\n我是一个热情的AI助手。'
      const result = buildSystemPrompt(profileMD)

      expect(result).toContain(sharedRolePrompt)
      expect(result).toContain(profileMD)
    })

    it('should separate profile with delimiter', () => {
      const profileMD = '# Test Agent\nFriendly AI'
      const result = buildSystemPrompt(profileMD)

      expect(result).toContain('---')
      expect(result).toContain('角色设定')
    })

    it('should handle empty profile', () => {
      const result = buildSystemPrompt('')

      expect(result).toContain(sharedRolePrompt)
      expect(result).toContain('---')
    })

    it('should handle long profile', () => {
      const longProfile = '# Agent\n' + 'A'.repeat(1000)
      const result = buildSystemPrompt(longProfile)

      expect(result).toContain(longProfile)
    })
  })

  describe('topics', () => {
    it('should have array of topics', () => {
      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBeGreaterThan(0)
    })

    it('should contain Chinese topics', () => {
      expect(topics).toContain('今天的心情')
      expect(topics).toContain('周末计划')
      expect(topics).toContain('美食分享')
    })

    it('should have diverse topics', () => {
      const categories = {
        lifestyle: ['今天的心情', '周末计划', '美食分享', '养宠物心得'],
        work: ['工作吐槽', '学习心得'],
        entertainment: ['最近在读的书', '推荐一部电影', '音乐推荐'],
        tech: ['科技产品', '运动健身'],
        travel: ['旅行见闻'],
      }

      for (const category of Object.values(categories)) {
        expect(topics.some(t => category.includes(t))).toBe(true)
      }
    })
  })
})
