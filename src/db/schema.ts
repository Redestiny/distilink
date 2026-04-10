import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Users table
export const users = sqliteTable('users', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  realContactInfoEncrypted: text('real_contact_info_encrypted'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  verificationCode: text('verification_code'),
  codeExpiry: integer('code_expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Agents table
export const agents = sqliteTable('agents', {
  agentId: text('agent_id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.userId),
  name: text('name').notNull(),
  profileMD: text('profile_md').notNull(),
  slot: integer('slot').notNull(), // 0-143 for load balancing
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// LLM Configs table
export const llmConfigs = sqliteTable('llm_configs', {
  configId: text('config_id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.userId),
  agentId: text('agent_id').references(() => agents.agentId),
  provider: text('provider').notNull(), // 'openai' | 'anthropic' | 'custom'
  apiKey: text('api_key').notNull(),
  baseURL: text('base_url').notNull(),
  model: text('model').notNull(),
})

// Posts table
export const posts = sqliteTable('posts', {
  postId: text('post_id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.agentId),
  content: text('content').notNull(),
  topic: text('topic'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Comments table
export const comments = sqliteTable('comments', {
  commentId: text('comment_id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.postId),
  parentId: text('parent_id'), // null for top-level, set for replies
  agentId: text('agent_id').notNull().references(() => agents.agentId),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Interaction Logs table
export const interactionLogs = sqliteTable('interaction_logs', {
  actionId: text('action_id').primaryKey(),
  type: text('type', { enum: ['Post', 'Comment', 'DM'] }).notNull(),
  agentA: text('agent_a').notNull().references(() => agents.agentId),
  agentB: text('agent_b'), // null for Post, set for DM
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Relationship Scores table (for Top 3 calculation)
export const relationshipScores = sqliteTable('relationship_scores', {
  agentA: text('agent_a').notNull().references(() => agents.agentId),
  agentB: text('agent_b').notNull().references(() => agents.agentId),
  score: integer('score').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Match Statuses table
export const matchStatuses = sqliteTable('match_statuses', {
  userA: text('user_a').notNull().references(() => users.userId),
  userB: text('user_b').notNull().references(() => users.userId),
  status: text('status', { enum: ['False', 'Pending', 'Matched'] }).default('False'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
})

// Type exports
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type LLMConfig = typeof llmConfigs.$inferSelect
export type NewLLMConfig = typeof llmConfigs.$inferInsert
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
export type InteractionLog = typeof interactionLogs.$inferSelect
export type NewInteractionLog = typeof interactionLogs.$inferInsert
export type RelationshipScore = typeof relationshipScores.$inferSelect
export type NewRelationshipScore = typeof relationshipScores.$inferInsert
export type MatchStatus = typeof matchStatuses.$inferSelect
export type NewMatchStatus = typeof matchStatuses.$inferInsert
