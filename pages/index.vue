<script setup lang="ts">
interface Message {
  role: 'user' | 'assistant'
  text: string
}

const user = useSupabaseUser()

const baseRules = `
######## INSTRUCTION CRITIQUE - TON RÔLE ########
Tu es UN RÉSIDENT ORDINAIRE chez toi. Tu as OUVERT TA PORTE parce que quelqu'un a cogné.
La personne devant toi est UN VENDEUR. C'est LUI qui vend, PAS TOI.
Tu ne vends RIEN. Tu ne travailles pour AUCUNE compagnie. Tu ne fais AUCUN pitch.
Tu n'offres AUCUN service. Tu ne te présentes JAMAIS comme représentant de quoi que ce soit.

Si tu te surprends à expliquer un produit, un service, des avantages ou à faire une offre → ARRÊTE. C'est le job du VENDEUR, pas le tien.

Ton seul rôle : RÉAGIR à ce que le vendeur dit. Écouter, répondre, poser des questions si tu veux.
########

RÈGLES DE COMPORTEMENT IMPORTANTES :
- Tu ne sais PAS pourquoi cette personne est à ta porte. Tu ne connais PAS le contrôle antiparasitaire, tu ne connais PAS la compagnie du vendeur. Tu découvres le sujet AU FUR ET À MESURE que le vendeur t'explique. Ne mentionne JAMAIS les parasites, les bibittes ou l'extermination AVANT que le vendeur en parle.
- Tes réponses sont COURTES. En vrai, les gens disent "ok", "ah ouin?", "hmm", "je sais pas". Pas des paragraphes.
- Tu ÉCOUTES plus que tu parles. C'est le vendeur qui doit mener la conversation, pas toi.
- Tu ne poses PAS de questions de toi-même sauf si le vendeur te demande ou si quelque chose t'intrigue vraiment.
- Tu ne facilites PAS la vie du vendeur. Tu ne relances pas la conversation. Si le vendeur arrête de parler, il y a un silence awkward.
- Parle en français québécois naturel. TOUJOURS en français. Varie tes réponses à chaque conversation. Ne révèle jamais que tu es une IA.

IMPORTANT SUR LA CONCLUSION DE LA VENTE :
- La vente PEUT se conclure. Si le vendeur fait bien sa job (bon pitch, répond aux objections, propose un rendez-vous ou un prix), tu peux dire oui.
- La décision de dire oui dépend de ta personnalité de client ET de la qualité du vendeur. Un bon vendeur ferme la vente.
- Quand le vendeur te demande de prendre rendez-vous ou de signer, ne refuse pas automatiquement. Évalue honnêtement si tu serais convaincu dans la vraie vie basé sur ce qu'il t'a dit.
`

const clientTypes = {
  technique: {
    name: 'Le Technique',
    description: 'Pose beaucoup de questions techniques',
    color: '#3b82f6',
    prompt: `Tu es un client résidentiel chez toi. Quelqu'un cogne à ta porte — c'est un vendeur qui fait du porte-à-porte au Québec.

Tu es un client TECHNIQUE. Au début, tu sais même pas de quoi il parle. Mais une fois que tu comprends le sujet, ta nature curieuse embarque et là tu commences à poser des questions pointues :
- Quels produits sont utilisés, leur toxicité
- Les certifications
- Les méthodes
- L'impact environnemental

MAIS tu poses UNE question à la fois, pas une liste. Et seulement quand le vendeur t'a donné assez d'info pour que ça t'intéresse. Au début, tu écoutes juste.

Tu es éduqué. Tu ne signes rien sans comprendre. Commence par ouvrir la porte : "Oui?" ou "C'est pourquoi?"

${baseRules}`,
  },
  facile: {
    name: 'Le Facile',
    description: 'Ouvert mais pas gratuit',
    color: '#22c55e',
    prompt: `Tu es un client résidentiel chez toi. Quelqu'un cogne à ta porte — c'est un vendeur qui fait du porte-à-porte au Québec.

Tu es un client FACILE, mais ça veut pas dire que c'est gratuit. Quand tu ouvres la porte, tu sais pas c'est qui. Tu es neutre.

Une fois que le vendeur mentionne les parasites, ça t'interpelle parce que tu as justement vu des bibittes chez vous. Mais tu restes passif — tu dis des trucs comme "ah ouin?", "ok", "combien ça coûte?". Tu poses pas 10 questions. Si le vendeur fait bien sa job, tu finis par dire oui assez vite.

Commence par ouvrir la porte : "Oui?" ou "Allo?"

${baseRules}`,
  },
  difficile: {
    name: 'Le Difficile',
    description: 'Résistant, sceptique, dur à convaincre',
    color: '#ef4444',
    prompt: `Tu es un client résidentiel chez toi. Quelqu'un cogne à ta porte — c'est un vendeur qui fait du porte-à-porte au Québec.

Tu es un client DIFFICILE, mais réaliste. T'es pas content de voir un vendeur, mais t'es quand même un être humain poli au minimum.

Tu es :
- Méfiant et pas intéressé au départ ("je suis correct", "on a pas besoin de ça")
- Tu donnes des objections réalistes : "c'est combien?", "mon beau-frère fait ça", "j'ai pas vu de bibittes", "ça m'intéresse pas vraiment"
- Tu résistes, mais si le vendeur fait un bon point, tu peux dire "ouin... mais quand même..."
- Tu laisses des ouvertures malgré toi — tu fermes pas la porte au nez du vendeur tant qu'il est respectueux
- Tes objections sont des VRAIES objections qu'un vendeur peut adresser, pas des murs impossibles

Le vendeur doit travailler fort, mais c'est PAS impossible. Si le vendeur répond bien à tes objections, tu ramollis graduellement. C'est un défi, pas un rejet automatique.

Commence par ouvrir la porte : "Oui?" ou "C'est quoi?"

${baseRules}`,
  },
  neutre: {
    name: 'Le Neutre',
    description: 'Client standard, écoute mais engage pas',
    color: '#8b5cf6',
    prompt: `Tu es un client résidentiel chez toi. Quelqu'un cogne à ta porte — c'est un vendeur qui fait du porte-à-porte au Québec.

Tu es un client NEUTRE. Tu es poli, tu ouvres la porte, tu écoutes. Mais tu parles pas beaucoup. Tu dis :
- "ok"
- "ah ouin"
- "hmm"
- "je sais pas"
- "faudrait que j'en parle à ma femme/mon mari"

Tu relances JAMAIS la conversation. Si le vendeur fait une pause, tu attends. Tu poses pas de questions sauf si on te demande "avez-vous des questions?". Tu es pas pressé de signer, pas pressé de le renvoyer non plus. Tu es juste... là.

Commence par ouvrir la porte : "Oui, bonjour?"

${baseRules}`,
  },
} as const

type ClientType = keyof typeof clientTypes

const selectedClient = ref<ClientType | null>(null)
const isConnecting = ref(false)
const isConnected = ref(false)
const transcript = ref<Message[]>([])
const transcriptEl = ref<HTMLElement | null>(null)
const currentAssistantText = ref('')
const avatarRef = ref<any>(null)
let sessionStartTime = 0

let peerConnection: RTCPeerConnection | null = null
let dataChannel: RTCDataChannel | null = null
let localStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let scriptProcessor: ScriptProcessorNode | null = null

function scrollTranscript() {
  nextTick(() => {
    if (transcriptEl.value) {
      transcriptEl.value.scrollTop = transcriptEl.value.scrollHeight
    }
  })
}

async function saveSession() {
  if (!user.value || !selectedClient.value) return
  const duration = Math.round((Date.now() - sessionStartTime) / 1000)

  try {
    await $fetch('/api/sessions', {
      method: 'POST',
      body: {
        user_id: user.value.id,
        client_type: selectedClient.value,
        transcript: transcript.value,
        duration_seconds: duration,
      },
    })
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

async function startSession() {
  if (!selectedClient.value) return

  isConnecting.value = true
  transcript.value = []
  sessionStartTime = Date.now()

  // Wait for avatar component to mount
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 500))

  try {
    const session = await $fetch('/api/session', { method: 'POST' })
    const ephemeralKey = (session as any).client_secret?.value
    if (!ephemeralKey) {
      throw new Error('No ephemeral key returned')
    }

    peerConnection = new RTCPeerConnection()

    // Route remote audio through TalkingHead avatar for lip sync
    peerConnection.ontrack = async (e) => {
      const remoteStream = e.streams[0]

      if (avatarRef.value) {
        try {
          await avatarRef.value.startStreaming()

          audioContext = new AudioContext({ sampleRate: 24000 })
          const source = audioContext.createMediaStreamSource(remoteStream)
          scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1)

          source.connect(scriptProcessor)
          // Don't connect to destination — TalkingHead handles playback
          scriptProcessor.connect(audioContext.createGain()) // needed to keep processor alive

          scriptProcessor.onaudioprocess = (event) => {
            const float32Data = event.inputBuffer.getChannelData(0)
            avatarRef.value?.feedAudio(new Float32Array(float32Data))
          }
        } catch (err) {
          console.warn('Avatar streaming failed, falling back to audio element:', err)
          const audioEl = document.createElement('audio')
          audioEl.autoplay = true
          audioEl.srcObject = remoteStream
        }
      } else {
        // Fallback: no avatar, use audio element
        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioEl.srcObject = remoteStream
      }
    }

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    peerConnection.addTrack(localStream.getTracks()[0])

    dataChannel = peerConnection.createDataChannel('oai-events')
    setupDataChannel(dataChannel)

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    const sdpResponse = await fetch(
      'https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
      {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      },
    )

    if (!sdpResponse.ok) {
      throw new Error(`OpenAI WebRTC failed: ${sdpResponse.status}`)
    }

    const answerSdp = await sdpResponse.text()
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    })

    isConnected.value = true
  } catch (err: any) {
    console.error('Failed to start session:', err)
    alert(`Erreur: ${err.message}`)
    cleanup()
  } finally {
    isConnecting.value = false
  }
}

function setupDataChannel(dc: RTCDataChannel) {
  dc.addEventListener('open', () => {
    const clientType = selectedClient.value!
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: clientTypes[clientType].prompt,
        voice: 'ash',
        input_audio_transcription: { model: 'whisper-1', language: 'fr' },
        turn_detection: {
          type: 'server_vad',
          silence_duration_ms: 1400,
          threshold: 0.6,
        },
      },
    }))

    // Le vendeur cogne en premier — pas de réponse automatique
  })

  dc.addEventListener('message', (e) => {
    const event = JSON.parse(e.data)

    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript?.trim()) {
          transcript.value.push({ role: 'user', text: event.transcript.trim() })
          scrollTranscript()
        }
        break

      case 'response.audio_transcript.delta':
        currentAssistantText.value += event.delta
        break

      case 'response.audio_transcript.done':
        if (currentAssistantText.value.trim()) {
          transcript.value.push({ role: 'assistant', text: currentAssistantText.value.trim() })
          scrollTranscript()
        }
        currentAssistantText.value = ''
        break

      case 'error':
        console.error('Realtime error:', event.error)
        break
    }
  })
}

function requestFeedback() {
  if (!dataChannel || dataChannel.readyState !== 'open') return

  dataChannel.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{
        type: 'input_text',
        text: `OK, la simulation est terminée. Sors de ton personnage. Tu es maintenant un coach de vente expert. Donne-moi un feedback honnête et constructif sur ma performance de vente :
- Points forts
- Points à améliorer
- Conseils spécifiques
- Note sur 10`,
      }],
    },
  }))
  dataChannel.send(JSON.stringify({ type: 'response.create' }))

  transcript.value.push({ role: 'user', text: '[Feedback demandé]' })
  scrollTranscript()
}

function cleanup() {
  avatarRef.value?.stopStreaming()
  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  if (dataChannel) {
    dataChannel.close()
    dataChannel = null
  }
  if (peerConnection) {
    peerConnection.close()
    peerConnection = null
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop())
    localStream = null
  }
}

async function stopSession() {
  await saveSession()
  cleanup()
  isConnected.value = false
}

async function newSession() {
  await saveSession()
  cleanup()
  isConnected.value = false
  selectedClient.value = null
  transcript.value = []
}

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div>
    <!-- Client Selection -->
    <div v-if="!isConnecting && !isConnected">
      <h2 class="section-title">Choisir un type de client</h2>
      <div class="client-grid">
        <button
          v-for="(client, key) in clientTypes"
          :key="key"
          :class="['client-card', { selected: selectedClient === key }]"
          :style="selectedClient === key ? { borderColor: client.color, background: client.color + '10' } : {}"
          @click="selectedClient = key as ClientType"
        >
          <div class="card-indicator" :style="{ background: client.color }" />
          <h3>{{ client.name }}</h3>
          <p>{{ client.description }}</p>
        </button>
      </div>

      <button
        v-if="selectedClient"
        class="btn-start"
        @click="startSession"
      >
        Commencer le pitch
      </button>
    </div>

    <!-- Active Session (shown during connecting AND connected) -->
    <div v-if="isConnecting || isConnected">
      <div class="session-header">
        <div class="status">
          <span class="status-dot" :class="{ connecting: isConnecting }" />
          <span v-if="isConnecting">Connexion en cours...</span>
          <span v-else>En conversation avec <strong>{{ clientTypes[selectedClient!].name }}</strong></span>
        </div>
      </div>

      <!-- Avatar -->
      <ClientOnly>
        <ClientAvatar ref="avatarRef" />
      </ClientOnly>

      <!-- Transcript (compact) -->
      <div ref="transcriptEl" class="transcript compact">
        <div v-if="transcript.length === 0" class="transcript-empty">
          {{ isConnecting ? 'Préparation...' : 'Cogner à la porte pour commencer...' }}
        </div>
        <div
          v-for="(msg, i) in transcript"
          :key="i"
          :class="['msg', msg.role]"
        >
          <span class="msg-label">{{ msg.role === 'user' ? 'Vous' : 'Client' }}</span>
          <span class="msg-text">{{ msg.text }}</span>
        </div>
        <div v-if="currentAssistantText" class="msg assistant streaming">
          <span class="msg-label">Client</span>
          <span class="msg-text">{{ currentAssistantText }}</span>
        </div>
      </div>

      <div class="controls">
        <button class="btn-stop" @click="stopSession">Arrêter</button>
        <button class="btn-feedback" @click="requestFeedback" :disabled="!isConnected">Feedback</button>
        <button class="btn-new" @click="newSession">Nouveau pitch</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.client-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.client-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.client-card:hover {
  border-color: #d1d5db;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.client-card.selected {
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.card-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-bottom: 0.75rem;
}

.client-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.client-card p {
  font-size: 0.85rem;
  color: #6b7280;
  line-height: 1.4;
}

.btn-start {
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}

.btn-start:hover:not(:disabled) {
  background: #2d2d4a;
}

.btn-start:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.session-header {
  margin-bottom: 1rem;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-dot.connecting {
  background: #f59e0b;
}

.transcript {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  height: 400px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.transcript.compact {
  height: 150px;
  margin-top: 1rem;
}

.transcript-empty {
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
  font-style: italic;
}

.msg {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.msg:last-child {
  border-bottom: none;
}

.msg-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.2rem;
}

.msg.user .msg-label { color: #3b82f6; }
.msg.assistant .msg-label { color: #ef4444; }

.msg-text {
  font-size: 0.95rem;
  line-height: 1.5;
}

.msg.streaming {
  opacity: 0.7;
}

.controls {
  display: flex;
  gap: 0.5rem;
}

.controls button {
  flex: 1;
  padding: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
}

.controls button:hover { opacity: 0.85; }

.btn-stop { background: #ef4444; color: white; }
.btn-feedback { background: #f59e0b; color: white; }
.btn-new { background: #6b7280; color: white; }
</style>
