import { ref } from 'vue'

export interface PipelineMessage {
  role: 'user' | 'assistant'
  text: string
}

export function useAudioPipeline() {
  const isConnecting = ref(false)
  const isConnected = ref(false)
  const transcript = ref<PipelineMessage[]>([])
  const currentAssistantText = ref('')
  const isProcessing = ref(false)

  let ws: WebSocket | null = null
  let myvad: any = null
  let audioContext: AudioContext | null = null

  async function start(clientType: string) {
    isConnecting.value = true
    transcript.value = []
    currentAssistantText.value = ''

    try {
      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/_ws`)

      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => {
          ws!.send(JSON.stringify({ type: 'start', clientType }))
          resolve()
        }
        ws!.onerror = reject
        setTimeout(() => reject(new Error('WebSocket timeout')), 5000)
      })

      // Setup message handling
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleMessage(data)
      }

      // Wait for 'ready' from server
      await new Promise<void>((resolve) => {
        const originalHandler = ws!.onmessage
        ws!.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'ready') {
            ws!.onmessage = originalHandler
            resolve()
          }
        }
      })

      // Start VAD with explicit asset paths (WASM + ONNX served from /vad/)
      const { MicVAD } = await import('@ricky0123/vad-web')
      myvad = await MicVAD.new({
        modelURL: '/vad/silero_vad_v5.onnx',
        workletURL: '/vad/vad.worklet.bundle.min.js',
        ortConfig: (ort: any) => {
          ort.env.wasm.wasmPaths = '/vad/'
        },
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.3,
        minSpeechFrames: 3,
        preSpeechPadFrames: 10,
        redemptionFrames: 20,
        onSpeechEnd: (audio: Float32Array) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return

          // Convert Float32 to Int16 PCM
          const pcm16 = float32ToInt16(audio)
          const base64 = bufferToBase64(pcm16.buffer)

          // Send audio to server for STT
          ws.send(JSON.stringify({ type: 'audio', audio: base64 }))

          // Tell the server "speech ended" so it processes
          ws.send(JSON.stringify({ type: 'speech_end', transcript: '' }))
        },
        onFrameProcessed: (probs: { isSpeech: number }) => {
          // Could visualize speech probability
        },
      })

      myvad.start()
      isConnected.value = true
    } catch (err) {
      console.error('Pipeline start failed:', err)
      throw err
    } finally {
      isConnecting.value = false
    }
  }

  function handleMessage(data: any) {
    switch (data.type) {
      case 'transcript':
        if (data.role === 'assistant') {
          currentAssistantText.value = ''
        }
        transcript.value.push({ role: data.role, text: data.text })
        break

      case 'llm_token':
        currentAssistantText.value += data.text
        break

      case 'audio':
        playAudioChunk(data.audio)
        break

      case 'audio_end':
        // TTS finished for this turn
        break

      case 'turn_done':
        currentAssistantText.value = ''
        isProcessing.value = false
        break

      case 'error':
        console.error('Server error:', data.message)
        isProcessing.value = false
        break
    }
  }

  // Audio playback for TTS chunks
  let playbackQueue: ArrayBuffer[] = []
  let isPlaying = false

  function playAudioChunk(base64Audio: string) {
    const bytes = base64ToBuffer(base64Audio)
    playbackQueue.push(bytes)
    if (!isPlaying) processPlaybackQueue()
  }

  async function processPlaybackQueue() {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 })
    }
    isPlaying = true

    while (playbackQueue.length > 0) {
      const chunk = playbackQueue.shift()!
      const int16 = new Int16Array(chunk)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768
      }

      const buffer = audioContext.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)

      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.start()

      // Wait for it to finish
      await new Promise<void>((resolve) => {
        source.onended = () => resolve()
      })
    }

    isPlaying = false
  }

  // Expose a method to get audio data for avatar lip-sync
  function getAudioFeedCallback(): ((data: Float32Array) => void) | null {
    // This will be set by the component using this composable
    return null
  }

  function stop(): Array<{ role: string; text: string }> {
    const result = [...transcript.value]

    if (myvad) {
      myvad.pause()
      myvad.destroy()
      myvad = null
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
      ws.close()
    }
    ws = null

    if (audioContext) {
      audioContext.close()
      audioContext = null
    }

    playbackQueue = []
    isPlaying = false
    isConnected.value = false
    currentAssistantText.value = ''

    return result
  }

  return {
    isConnecting,
    isConnected,
    transcript,
    currentAssistantText,
    isProcessing,
    start,
    stop,
  }
}

// Utility functions
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
