import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export interface DeepgramStream {
  send: (audioChunk: Buffer) => void
  close: () => void
  onTranscript: (callback: (text: string, isFinal: boolean) => void) => void
  onError: (callback: (error: Error) => void) => void
}

export function createDeepgramStream(apiKey: string): DeepgramStream {
  const deepgram = createClient(apiKey)
  let transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null
  let errorCallback: ((error: Error) => void) | null = null

  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'fr',
    smart_format: true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
    interim_results: true,
    utterance_end_ms: 1500,
  })

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript
    if (transcript && transcriptCallback) {
      transcriptCallback(transcript, data.is_final ?? false)
    }
  })

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    if (errorCallback) errorCallback(error)
  })

  return {
    send(audioChunk: Buffer) {
      if (connection.getReadyState() === 1) {
        connection.send(audioChunk)
      }
    },
    close() {
      connection.requestClose()
    },
    onTranscript(callback) {
      transcriptCallback = callback
    },
    onError(callback) {
      errorCallback = callback
    },
  }
}
