<script setup lang="ts">
const user = useSupabaseUser()
const { isConnecting, isConnected, transcript, currentAssistantText, start, stop } = useAudioPipeline()

const clientTypes = {
  technique: {
    name: 'Le Technique',
    description: 'Pose beaucoup de questions techniques',
    color: '#3b82f6',
  },
  facile: {
    name: 'Le Facile',
    description: 'Ouvert mais pas gratuit',
    color: '#22c55e',
  },
  difficile: {
    name: 'Le Difficile',
    description: 'Resistant, sceptique, dur a convaincre',
    color: '#ef4444',
  },
  neutre: {
    name: 'Le Neutre',
    description: 'Client standard, ecoute mais engage pas',
    color: '#8b5cf6',
  },
} as const

type ClientType = keyof typeof clientTypes

const selectedClient = ref<ClientType | null>(null)
const transcriptEl = ref<HTMLElement | null>(null)
const showFeedback = ref(false)
const feedbackData = ref<any>(null)
const feedbackLoading = ref(false)
let sessionStartTime = 0

function scrollTranscript() {
  nextTick(() => {
    if (transcriptEl.value) {
      transcriptEl.value.scrollTop = transcriptEl.value.scrollHeight
    }
  })
}

watch(transcript, () => scrollTranscript(), { deep: true })
watch(currentAssistantText, () => scrollTranscript())

async function startSession() {
  if (!selectedClient.value) return
  sessionStartTime = Date.now()
  showFeedback.value = false
  feedbackData.value = null

  try {
    await start(selectedClient.value)
  } catch (err: any) {
    alert(`Erreur: ${err.message}`)
  }
}

async function stopSession() {
  const sessionTranscript = stop()
  const duration = Math.round((Date.now() - sessionStartTime) / 1000)

  if (!user.value || !selectedClient.value) return

  // Save session
  try {
    const result = await $fetch('/api/sessions', {
      method: 'POST',
      body: {
        user_id: user.value.id,
        client_type: selectedClient.value,
        transcript: sessionTranscript,
        duration_seconds: duration,
      },
    }) as { id: number }

    // Request feedback
    await requestFeedback(result.id, sessionTranscript, duration)
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

async function requestFeedback(sessionId: number, sessionTranscript: any[], duration: number) {
  if (!selectedClient.value) return
  feedbackLoading.value = true
  showFeedback.value = true

  try {
    const result = await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        session_id: sessionId,
        client_type: selectedClient.value,
        transcript: sessionTranscript,
      },
    })
    feedbackData.value = result
  } catch (err) {
    console.error('Feedback failed:', err)
    feedbackData.value = { error: 'Impossible de generer le feedback' }
  } finally {
    feedbackLoading.value = false
  }
}

function newSession() {
  stop()
  selectedClient.value = null
  showFeedback.value = false
  feedbackData.value = null
}
</script>

<template>
  <div>
    <!-- Client Selection -->
    <div v-if="!isConnecting && !isConnected && !showFeedback">
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

    <!-- Active Session -->
    <div v-if="isConnecting || isConnected">
      <div class="session-header">
        <div class="status">
          <span class="status-dot" :class="{ connecting: isConnecting }" />
          <span v-if="isConnecting">Connexion en cours...</span>
          <span v-else>En conversation avec <strong>{{ clientTypes[selectedClient!].name }}</strong></span>
        </div>
      </div>

      <!-- Transcript -->
      <div ref="transcriptEl" class="transcript">
        <div v-if="transcript.length === 0" class="transcript-empty">
          {{ isConnecting ? 'Preparation...' : 'Parle pour commencer...' }}
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
        <button class="btn-stop" @click="stopSession">Arreter + Feedback</button>
        <button class="btn-new" @click="newSession">Annuler</button>
      </div>
    </div>

    <!-- Feedback Panel -->
    <FeedbackPanel
      v-if="showFeedback"
      :feedback="feedbackData"
      :loading="feedbackLoading"
      :client-type="selectedClient"
      @new-session="newSession"
    />
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
.btn-new { background: #6b7280; color: white; }
</style>
