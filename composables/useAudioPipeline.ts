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

      // Wait for open + ready
      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => {
          ws!.send(JSON.stringify({ type: 'start', clientType }))
        }
        ws!.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'ready') {
            // Switch to normal message handler
            ws!.onmessage = (e) => handleMessage(JSON.parse(e.data))
            resolve()
          }
        }
        ws!.onerror = () => reject(new Error('WebSocket connection failed'))
        setTimeout(() => reject(new Error('WebSocket timeout')), 10000)
      })

      // Start VAD
      const { MicVAD } = await import('@ricky0123/vad-web')
      myvad = await MicVAD.new({
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.3,
        minSpeechFrames: 3,
        preSpeechPadFrames: 10,
        redemptionFrames: 20,
        onSpeechEnd: (audio: Float32Array) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return
          isProcessing.value = true

          // Convert Float32 to Int16 PCM and send with speech_end
          const pcm16 = float32ToInt16(audio)
          const base64 = bufferToBase64(pcm16.buffer)

          // Send audio directly — server does STT + LLM + TTS
          ws.send(JSON.stringify({ type: 'speech_end', audio: base64 }))
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
        playFullAudio(data.audio)
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

  // Play complete audio buffer at once (no chunk gaps)
  async function playFullAudio(base64Audio: string) {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 })
    }

    const raw = base64ToBuffer(base64Audio)
    const validLength = raw.byteLength - (raw.byteLength % 2)
    if (validLength === 0) return

    const int16 = new Int16Array(raw, 0, validLength / 2)
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
