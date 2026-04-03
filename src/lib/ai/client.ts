import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const IS_DEV_LOCAL = process.env.USE_LOCAL_LLM === 'true'

// Unified interface so agents don't care which model they're using
export async function generateText(
  prompt: string,
  maxTokens: number = 2048
): Promise<string> {
  if (IS_DEV_LOCAL) {
    const openai = new OpenAI({
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by client but ignored by Ollama
    })

    const response = await openai.chat.completions.create({
      model: 'llama3.2',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    return response.choices[0].message.content ?? ''
  } 
  else {
    const client = new Anthropic()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    return response.content[0].type === 'text'
      ? response.content[0].text
      : ''
  }
}