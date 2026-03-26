import { DeepgramClient } from '@deepgram/sdk'

export interface DeepgramStream {
  connect: () => Promise<void>
  send: (audioChunk: Buffer) => void
  close: () => void
  onTranscript: (callback: (text: string, isFinal: boolean) => void) => void
  onError: (callback: (error: Error) => void) => void
}

export function createDeepgramStream(apiKey: string): DeepgramStream {
  const client = new DeepgramClient({ apiKey })
  let transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null
  let errorCallback: ((error: Error) => void) | null = null
  let connection: any = null

  return {
    async connect() {
      connection = await client.listen.v1.connect({
        model: 'nova-2',
        language: 'fr',
        smart_format: 'true',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        interim_results: 'true',
        utterance_end_ms: '1500',
      })

      connection.on('message', (data: any) => {
        if (data.type === 'Results') {
          const transcript = data.channel?.alternatives?.[0]?.transcript
          if (transcript && transcriptCallback) {
            transcriptCallback(transcript, data.is_final ?? false)
          }
        }
      })

      connection.on('error', (error: any) => {
        if (errorCallback) errorCallback(error)
      })

      connection.connect()
      await connection.waitForOpen()
    },
    send(audioChunk: Buffer) {
      if (connection) {
        connection.sendMedia(audioChunk)
      }
    },
    close() {
      if (connection) {
        try { connection.close() } catch {}
        connection = null
      }
    },
    onTranscript(callback) {
      transcriptCallback = callback
    },
    onError(callback) {
      errorCallback = callback
    },
  }
}
