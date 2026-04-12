// Direct test script to verify LLM API connectivity
// Run with: npx tsx scripts/test-llm.ts

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env file
const envPath = resolve(process.cwd(), '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && key.trim() && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
} catch (e) {
  // .env file not found
}

async function testLLM() {
  console.log('=== LLM API Test ===')
  console.log('Base URL:', process.env.LLM_BASE_URL)
  console.log('Model:', process.env.LLM_MODEL)
  console.log('API Key:', process.env.LLM_API_KEY ? '***' + process.env.LLM_API_KEY.slice(-4) : 'NOT SET')

  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    console.error('❌ Missing required env vars')
    process.exit(1)
  }

  const openai = createOpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
  })

  try {
    console.log('\nCalling LLM...')
    const result = await generateText({
      model: openai.chat(process.env.LLM_MODEL!),
      system: '你是一个友好的AI助手。',
      prompt: '请回复"你好"，不要超过10个字。',
      maxOutputTokens: 500,
    })

    console.log('✅ LLM call successful!')
    console.log('Response text:', result.text)
    console.log('Full result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ LLM call failed:')
    console.error(error)
    process.exit(1)
  }
}

testLLM()
