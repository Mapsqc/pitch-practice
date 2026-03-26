import OpenAI from 'openai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMStreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

export async function streamChatResponse(
  apiKey: string,
  messages: ChatMessage[],
  callbacks: LLMStreamCallbacks,
): Promise<void> {
  const openai = new OpenAI({ apiKey })

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      max_tokens: 150,
      temperature: 0.9,
    })

    let fullText = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) {
        fullText += token
        callbacks.onToken(token)
      }
    }
    callbacks.onDone(fullText)
  } catch (error) {
    callbacks.onError(error as Error)
  }
}

export async function generateFeedback(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const openai = new OpenAI({ apiKey })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  return response.choices[0]?.message?.content || '{}'
}
