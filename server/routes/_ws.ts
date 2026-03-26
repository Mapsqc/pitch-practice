import { createDeepgramStream } from '../utils/deepgram'
import { streamChatResponse, type ChatMessage } from '../utils/llm'
import { streamTTS } from '../utils/tts'
import { buildClientPrompt } from '../utils/prompts'

interface SessionState {
  clientType: string
  messages: ChatMessage[]
  deepgramStream: ReturnType<typeof createDeepgramStream> | null
  isProcessing: boolean
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>
}

const sessions = new Map<string, SessionState>()

export default defineWebSocketHandler({
  open(peer) {
    console.log('[ws] Client connected:', peer.id)
  },

  async message(peer, msg) {
    const config = useRuntimeConfig()

    let data: any
    try {
      const raw = typeof msg === 'string' ? msg : msg.text()
      data = JSON.parse(raw)
    } catch (e) {
      console.error('[ws] Failed to parse message:', e)
      peer.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }))
      return
    }

    switch (data.type) {
      case 'start': {
        const clientType = data.clientType as string
        if (!clientType) {
          peer.send(JSON.stringify({ type: 'error', message: 'Missing clientType' }))
          return
        }

        const systemPrompt = buildClientPrompt(clientType as any)

        const state: SessionState = {
          clientType,
          messages: [{ role: 'system', content: systemPrompt }],
          deepgramStream: null,
          isProcessing: false,
          transcript: [],
        }

        // Setup Deepgram STT
        state.deepgramStream = createDeepgramStream(config.deepgramApiKey)

        state.deepgramStream.onTranscript((text, isFinal) => {
          if (isFinal && text.trim()) {
            // Final transcript segment — send for display
            peer.send(JSON.stringify({
              type: 'transcript_interim',
              role: 'user',
              text: text.trim(),
              isFinal: true,
            }))
          } else if (!isFinal && text.trim()) {
            // Send interim for display
            peer.send(JSON.stringify({
              type: 'transcript_interim',
              role: 'user',
              text: text.trim(),
            }))
          }
        })

        state.deepgramStream.onError((error) => {
          console.error('[deepgram] Error:', error)
          peer.send(JSON.stringify({ type: 'error', message: 'STT error: ' + error.message }))
        })

        sessions.set(peer.id, state)
        peer.send(JSON.stringify({ type: 'ready' }))
        break
      }

      case 'audio': {
        const state = sessions.get(peer.id)
        if (!state?.deepgramStream) break
        const audioBuffer = Buffer.from(data.audio, 'base64')
        state.deepgramStream.send(audioBuffer)
        break
      }

      case 'speech_end': {
        // VAD detected end of speech — process the utterance
        const state = sessions.get(peer.id)
        if (!state || state.isProcessing) break

        const userText = data.transcript?.trim()
        if (!userText) break

        state.isProcessing = true
        state.transcript.push({ role: 'user', text: userText })
        state.messages.push({ role: 'user', content: userText })

        peer.send(JSON.stringify({
          type: 'transcript',
          role: 'user',
          text: userText,
        }))

        // LLM streaming -> sentence buffer -> TTS
        let sentenceBuffer = ''

        try {
          await streamChatResponse(config.openaiApiKey, state.messages, {
            onToken(token) {
              sentenceBuffer += token

              // Send token for text display
              peer.send(JSON.stringify({ type: 'llm_token', text: token }))
            },
            async onDone(fullText) {
              // Send any remaining text to TTS
              if (sentenceBuffer.trim()) {
                await sendTTS(config.openaiApiKey, sentenceBuffer.trim(), peer)
              }

              state.messages.push({ role: 'assistant', content: fullText })
              state.transcript.push({ role: 'assistant', text: fullText })

              peer.send(JSON.stringify({
                type: 'transcript',
                role: 'assistant',
                text: fullText,
              }))
              peer.send(JSON.stringify({ type: 'turn_done' }))
              state.isProcessing = false
            },
            onError(error) {
              console.error('[llm] Error:', error)
              state.isProcessing = false
              peer.send(JSON.stringify({ type: 'error', message: error.message }))
            },
          })
        } catch (error: any) {
          console.error('[ws] Pipeline error:', error)
          state.isProcessing = false
          peer.send(JSON.stringify({ type: 'error', message: error.message || 'Pipeline error' }))
        }
        break
      }

      case 'stop': {
        const state = sessions.get(peer.id)
        if (state) {
          state.deepgramStream?.close()
          peer.send(JSON.stringify({
            type: 'session_ended',
            transcript: state.transcript,
          }))
          sessions.delete(peer.id)
        }
        break
      }

      default: {
        console.warn('[ws] Unknown message type:', data.type)
        break
      }
    }
  },

  close(peer) {
    const state = sessions.get(peer.id)
    if (state) {
      state.deepgramStream?.close()
      sessions.delete(peer.id)
    }
    console.log('[ws] Client disconnected:', peer.id)
  },

  error(peer, error) {
    console.error('[ws] WebSocket error for peer', peer.id, ':', error)
    const state = sessions.get(peer.id)
    if (state) {
      state.deepgramStream?.close()
      sessions.delete(peer.id)
    }
  },
})

async function sendTTS(apiKey: string, text: string, peer: any): Promise<void> {
  return new Promise((resolve) => {
    streamTTS(apiKey, text, {
      onAudioChunk(chunk) {
        peer.send(JSON.stringify({
          type: 'audio',
          audio: chunk.toString('base64'),
        }))
      },
      onDone() {
        peer.send(JSON.stringify({ type: 'audio_end' }))
        resolve()
      },
      onError(error) {
        console.error('[tts] Error:', error)
        resolve() // Resolve even on error to avoid hanging
      },
    })
  })
}
