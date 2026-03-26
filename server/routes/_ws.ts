import { createDeepgramStream } from '../utils/deepgram'
import { streamChatResponse, type ChatMessage } from '../utils/llm'
import { streamTTS } from '../utils/tts'
import { buildClientPrompt } from '../utils/prompts'

interface SessionState {
  clientType: string
  messages: ChatMessage[]
  deepgramStream: ReturnType<typeof createDeepgramStream> | null
  isProcessing: boolean
  closed: boolean
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>
}

const sessions = new Map<string, SessionState>()

/** Safely send a message to a peer, ignoring errors if connection is closed */
function safeSend(peer: any, state: SessionState | undefined, payload: object): void {
  if (state?.closed) return
  try {
    peer.send(JSON.stringify(payload))
  } catch (e) {
    // Connection may have closed between check and send — ignore
  }
}

/** Clean up a session's resources and remove from the Map */
function cleanupSession(peerId: string): void {
  const state = sessions.get(peerId)
  if (state) {
    state.closed = true
    state.deepgramStream?.close()
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
    } catch (e) {
      console.error('[ws] Failed to parse message:', e)
      safeSend(peer, undefined, { type: 'error', message: 'Invalid JSON message' })
      return
    }

    switch (data.type) {
      case 'start': {
        // Clean up any existing session for this peer (prevents orphaned Deepgram streams)
        cleanupSession(peer.id)

        const clientType = data.clientType as string
        if (!clientType) {
          safeSend(peer, undefined, { type: 'error', message: 'Missing clientType' })
          return
        }

        const systemPrompt = buildClientPrompt(clientType as any)

        const state: SessionState = {
          clientType,
          messages: [{ role: 'system', content: systemPrompt }],
          deepgramStream: null,
          isProcessing: false,
          closed: false,
          transcript: [],
        }

        // Setup Deepgram STT
        state.deepgramStream = createDeepgramStream(config.deepgramApiKey)

        state.deepgramStream.onTranscript((text, isFinal) => {
          if (isFinal && text.trim()) {
            // Final transcript segment — send for display
            safeSend(peer, state, {
              type: 'transcript_interim',
              role: 'user',
              text: text.trim(),
              isFinal: true,
            })
          } else if (!isFinal && text.trim()) {
            // Send interim for display
            safeSend(peer, state, {
              type: 'transcript_interim',
              role: 'user',
              text: text.trim(),
            })
          }
        })

        state.deepgramStream.onError((error) => {
          console.error('[deepgram] Error:', error)
          safeSend(peer, state, { type: 'error', message: 'STT error: ' + error.message })
        })

        sessions.set(peer.id, state)
        safeSend(peer, state, { type: 'ready' })
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

        safeSend(peer, state, {
          type: 'transcript',
          role: 'user',
          text: userText,
        })

        // LLM streaming -> collect full response -> TTS
        // We collect the full response first, then send TTS after streamChatResponse resolves.
        // This avoids the issue of onDone being async but not awaited by the LLM wrapper.
        let fullResponse = ''

        try {
          await streamChatResponse(config.openaiApiKey, state.messages, {
            onToken(token) {
              fullResponse += token
              // Send token for live text display
              safeSend(peer, state, { type: 'llm_token', text: token })
            },
            onDone(_fullText) {
              // No-op: we handle post-processing after await resolves
            },
            onError(error) {
              console.error('[llm] Error:', error)
              safeSend(peer, state, { type: 'error', message: error.message })
            },
          })

          // After LLM stream completes, send TTS for the full response
          if (state.closed) break

          if (fullResponse.trim()) {
            await sendTTS(config.openaiApiKey, fullResponse.trim(), peer, state)
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

      default: {
        console.warn('[ws] Unknown message type:', data.type)
        break
      }
    }
  },

  close(peer) {
    cleanupSession(peer.id)
    console.log('[ws] Client disconnected:', peer.id)
  },

  error(peer, error) {
    console.error('[ws] WebSocket error for peer', peer.id, ':', error)
    cleanupSession(peer.id)
  },
})

async function sendTTS(apiKey: string, text: string, peer: any, state: SessionState): Promise<void> {
  if (state.closed) return
  return new Promise((resolve) => {
    streamTTS(apiKey, text, {
      onAudioChunk(chunk) {
        safeSend(peer, state, {
          type: 'audio',
          audio: chunk.toString('base64'),
        })
      },
      onDone() {
        safeSend(peer, state, { type: 'audio_end' })
        resolve()
      },
      onError(error) {
        console.error('[tts] Error:', error)
        resolve() // Resolve even on error to avoid hanging
      },
    })
  })
}
