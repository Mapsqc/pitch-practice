import OpenAI from 'openai'

export interface TTSStreamCallbacks {
  onAudioChunk: (chunk: Buffer) => void
  onDone: () => void
  onError: (error: Error) => void
}

export async function streamTTS(
  apiKey: string,
  text: string,
  callbacks: TTSStreamCallbacks,
): Promise<void> {
  const openai = new OpenAI({ apiKey })

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      input: text,
      voice: 'ash',
      response_format: 'pcm',
      speed: 1.0,
    })

    const reader = response.body as unknown as AsyncIterable<Uint8Array>
    for await (const chunk of reader) {
      callbacks.onAudioChunk(Buffer.from(chunk))
    }
    callbacks.onDone()
  } catch (error) {
    callbacks.onError(error as Error)
  }
}
