import { transcribeAudio } from '../utils/stt'
import { streamChatResponse, type ChatMessage } from '../utils/llm'
import { streamTTS } from '../utils/tts'
import { buildClientPrompt } from '../utils/prompts'

interface SessionState {
  clientType: string
  messages: ChatMessage[]
  isProcessing: boolean
  closed: boolean
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>
}

const sessions = new Map<string, SessionState>()

function safeSend(peer: any, state: SessionState | undefined, payload: object): void {
  if (state?.closed) return
  try {
    peer.send(JSON.stringify(payload))
  } catch {}
}

function cleanupSession(peerId: string): void {
  const state = sessions.get(peerId)
  if (state) {
    state.closed = true
    sessions.delete(peerId)
  }
}

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
    } catch {
      return
    }

    switch (data.type) {
      case 'start': {
        cleanupSession(peer.id)

        const clientType = data.clientType as string
        if (!clientType) return

        const systemPrompt = buildClientPrompt(clientType as any)

        sessions.set(peer.id, {
          clientType,
          messages: [{ role: 'system', content: systemPrompt }],
          isProcessing: false,
          closed: false,
          transcript: [],
        })

        safeSend(peer, sessions.get(peer.id), { type: 'ready' })
        break
      }

      case 'speech_end': {
        const state = sessions.get(peer.id)
        if (!state || state.isProcessing) break
        if (!data.audio) break

        state.isProcessing = true

        try {
          // 1. STT with Whisper (batch — simple and accurate)
          const pcmBuffer = Buffer.from(data.audio, 'base64')
          const userText = await transcribeAudio(config.openaiApiKey, pcmBuffer)

          if (!userText) {
            state.isProcessing = false
            break
          }

          state.transcript.push({ role: 'user', text: userText })
          state.messages.push({ role: 'user', content: userText })
          safeSend(peer, state, { type: 'transcript', role: 'user', text: userText })

          // 2. LLM response (streaming for live text display)
          let fullResponse = ''

          await streamChatResponse(config.openaiApiKey, state.messages, {
            onToken(token) {
              fullResponse += token
              safeSend(peer, state, { type: 'llm_token', text: token })
            },
            onDone() {},
            onError(error) {
              console.error('[llm] Error:', error)
              safeSend(peer, state, { type: 'error', message: error.message })
            },
          })

          if (state.closed || !fullResponse.trim()) {
            state.isProcessing = false
            break
          }

          // 3. TTS — collect ALL audio chunks, then send at once
          const audioChunks: Buffer[] = []

          await new Promise<void>((resolve) => {
            streamTTS(config.openaiApiKey, fullResponse.trim(), {
              onAudioChunk(chunk) {
                audioChunks.push(chunk)
              },
              onDone() {
                resolve()
              },
              onError(error) {
                console.error('[tts] Error:', error)
                resolve()
              },
            })
          })

          // Send complete audio as single chunk to avoid playback gaps
          if (audioChunks.length > 0) {
            const fullAudio = Buffer.concat(audioChunks)
            safeSend(peer, state, {
              type: 'audio',
              audio: fullAudio.toString('base64'),
            })
          }

          state.messages.push({ role: 'assistant', content: fullResponse })
          state.transcript.push({ role: 'assistant', text: fullResponse })

          safeSend(peer, state, {
            type: 'transcript',
            role: 'assistant',
            text: fullResponse,
          })
          safeSend(peer, state, { type: 'turn_done' })
        } catch (error: any) {
          console.error('[ws] Pipeline error:', error)
          safeSend(peer, state, { type: 'error', message: error.message || 'Pipeline error' })
        } finally {
          state.isProcessing = false
        }
        break
      }

      case 'stop': {
        const state = sessions.get(peer.id)
        if (state) {
          safeSend(peer, state, {
            type: 'session_ended',
            transcript: state.transcript,
          })
          cleanupSession(peer.id)
        }
        break
      }
    }
  },

  close(peer) {
    cleanupSession(peer.id)
  },

  error(peer) {
    cleanupSession(peer.id)
  },
})
