<script setup lang="ts">
const user = useSupabaseUser()
const sessions = ref<any[]>([])
const loading = ref(true)
const selectedSession = ref<any>(null)

const totalSessions = computed(() => sessions.value.length)
const totalMinutes = computed(() =>
  Math.round(sessions.value.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60)
)

const averageScore = computed(() => {
  const scored = sessions.value.filter(s => s.score_global)
  if (!scored.length) return null
  return (scored.reduce((sum, s) => sum + s.score_global, 0) / scored.length).toFixed(1)
})

const recentAverage = computed(() => {
  const recent = sessions.value.filter(s => s.score_global).slice(0, 5)
  if (!recent.length) return null
  return (recent.reduce((sum, s) => sum + s.score_global, 0) / recent.length).toFixed(1)
})

// Competence averages from last 5 scored sessions
const competenceAverages = computed(() => {
  const scored = sessions.value.filter(s => s.scores?.length).slice(0, 5)
  if (!scored.length) return []

  const totals: Record<string, { sum: number; count: number }> = {}
  for (const session of scored) {
    for (const score of session.scores) {
      if (score.score === null) continue
      if (!totals[score.competence]) totals[score.competence] = { sum: 0, count: 0 }
      totals[score.competence].sum += score.score
      totals[score.competence].count++
    }
  }

  return Object.entries(totals)
    .map(([key, val]) => ({
      key,
      average: +(val.sum / val.count).toFixed(1),
    }))
    .sort((a, b) => a.average - b.average)
})

const clientLabels: Record<string, string> = {
  technique: 'Le Technique',
  facile: 'Le Facile',
  difficile: 'Le Difficile',
  neutre: 'Le Neutre',
}

const clientColors: Record<string, string> = {
  technique: '#3b82f6',
  facile: '#22c55e',
  difficile: '#ef4444',
  neutre: '#8b5cf6',
}

onMounted(async () => {
  if (!user.value) return
  try {
    sessions.value = await $fetch('/api/sessions', {
      params: { user_id: user.value.id },
    }) as any[]
  } catch (err) {
    console.error('Failed to load sessions:', err)
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number) {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#f59e0b'
  if (score >= 4) return '#f97316'
  return '#ef4444'
}

function parseFeedbackJson(feedbackJson: string) {
  try {
    return JSON.parse(feedbackJson)
  } catch {
    return null
  }
}

function parseTranscript(transcriptStr: string) {
  try {
    return JSON.parse(transcriptStr)
  } catch {
    return []
  }
}
</script>

<template>
  <div>
    <h2 class="page-title">Mon Profil</h2>

    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ totalSessions }}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ totalMinutes }}</span>
        <span class="stat-label">Minutes</span>
      </div>
      <div class="stat-card" v-if="averageScore">
        <span class="stat-value" :style="{ color: scoreColor(+averageScore) }">{{ averageScore }}</span>
        <span class="stat-label">Score moyen</span>
      </div>
      <div class="stat-card" v-if="recentAverage">
        <span class="stat-value" :style="{ color: scoreColor(+recentAverage) }">{{ recentAverage }}</span>
        <span class="stat-label">5 dernieres</span>
      </div>
    </div>

    <!-- Competences -->
    <div class="section" v-if="competenceAverages.length">
      <h3 class="section-title">Competences (5 dernieres sessions)</h3>
      <div class="competence-list">
        <div v-for="comp in competenceAverages" :key="comp.key" class="competence-bar-item">
          <div class="competence-bar-header">
            <span class="competence-bar-name">{{ comp.key }}</span>
            <span class="competence-bar-score" :style="{ color: scoreColor(comp.average) }">
              {{ comp.average }}
            </span>
          </div>
          <div class="competence-bar-track">
            <div
              class="competence-bar-fill"
              :style="{ width: (comp.average * 10) + '%', background: scoreColor(comp.average) }"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="section" v-else-if="!loading">
      <h3 class="section-title">Competences</h3>
      <div class="placeholder-card">
        <p>Pas encore de scores.</p>
        <p class="placeholder-sub">Termine une session avec feedback pour voir tes competences ici.</p>
      </div>
    </div>

    <!-- Score Progression Chart -->
    <div class="section" v-if="sessions.filter(s => s.score_global).length >= 2">
      <h3 class="section-title">Progression</h3>
      <div class="chart-container">
        <div class="chart">
          <div
            v-for="(s, i) in [...sessions].reverse().filter(s => s.score_global)"
            :key="i"
            class="chart-bar-wrapper"
          >
            <div
              class="chart-bar"
              :style="{
                height: (s.score_global * 10) + '%',
                background: scoreColor(s.score_global),
              }"
            >
              <span class="chart-bar-label">{{ s.score_global }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Session History -->
    <div class="section">
      <h3 class="section-title">Historique des sessions</h3>

      <div v-if="loading" class="loading">Chargement...</div>

      <div v-else-if="sessions.length === 0" class="placeholder-card">
        <p>Aucune session enregistree.</p>
        <p class="placeholder-sub">Commence un pitch pour voir ton historique ici.</p>
      </div>

      <div v-else class="session-list">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :class="{ expanded: selectedSession?.id === session.id }"
          @click="selectedSession = selectedSession?.id === session.id ? null : session"
        >
          <div class="session-row">
            <div class="session-info">
              <span class="session-type" :style="{ color: clientColors[session.client_type] }">
                {{ clientLabels[session.client_type] || session.client_type }}
              </span>
              <span class="session-date">{{ formatDate(session.created_at) }}</span>
            </div>
            <div class="session-meta">
              <span
                v-if="session.score_global"
                class="session-score"
                :style="{ color: scoreColor(session.score_global) }"
              >
                {{ session.score_global }}/10
              </span>
              <span class="session-duration">{{ formatDuration(session.duration_seconds) }}</span>
            </div>
          </div>

          <!-- Expanded: transcript + feedback -->
          <div v-if="selectedSession?.id === session.id" class="session-detail">
            <div v-if="session.feedback_json" class="detail-feedback">
              <h4>Feedback</h4>
              <template v-if="parseFeedbackJson(session.feedback_json)">
                <div v-for="point in (parseFeedbackJson(session.feedback_json).points_forts || [])" :key="point" class="detail-point positive">
                  {{ point }}
                </div>
                <div v-for="point in (parseFeedbackJson(session.feedback_json).a_ameliorer || [])" :key="point" class="detail-point negative">
                  {{ point }}
                </div>
                <p v-if="parseFeedbackJson(session.feedback_json).conseil_cle" class="detail-conseil">
                  {{ parseFeedbackJson(session.feedback_json).conseil_cle }}
                </p>
              </template>
            </div>
            <div v-if="session.transcript" class="detail-transcript">
              <h4>Transcript</h4>
              <div v-for="(msg, i) in parseTranscript(session.transcript)" :key="i" class="detail-msg">
                <strong>{{ msg.role === 'user' ? 'Vous' : 'Client' }}:</strong> {{ msg.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 0.8rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.75rem;
}

.placeholder-card {
  background: white;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.placeholder-sub {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.loading {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

/* Competence bars */
.competence-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.competence-bar-item {
  margin-bottom: 0.75rem;
}

.competence-bar-item:last-child {
  margin-bottom: 0;
}

.competence-bar-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.competence-bar-name {
  font-size: 0.8rem;
  color: #4b5563;
}

.competence-bar-score {
  font-size: 0.8rem;
  font-weight: 700;
}

.competence-bar-track {
  height: 6px;
  background: #f3f4f6;
  border-radius: 3px;
  overflow: hidden;
}

.competence-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

/* Chart */
.chart-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
}

.chart-bar-wrapper {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.chart-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  position: relative;
  min-height: 10%;
  transition: height 0.3s;
}

.chart-bar-label {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b7280;
}

/* Session list */
.session-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.session-item {
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.1s;
}

.session-item:hover {
  background: #fafafa;
}

.session-item:last-child {
  border-bottom: none;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.session-type {
  font-weight: 600;
  font-size: 0.9rem;
}

.session-date {
  font-size: 0.8rem;
  color: #9ca3af;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.session-score {
  font-weight: 700;
  font-size: 0.85rem;
}

.session-duration {
  font-size: 0.85rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

/* Session detail (expanded) */
.session-detail {
  padding: 0 1rem 1rem;
  border-top: 1px solid #f3f4f6;
}

.session-detail h4 {
  font-size: 0.8rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  margin: 0.75rem 0 0.5rem;
}

.detail-point {
  font-size: 0.85rem;
  padding: 0.25rem 0;
}

.detail-point.positive { color: #16a34a; }
.detail-point.negative { color: #dc2626; }

.detail-conseil {
  font-size: 0.85rem;
  color: #92400e;
  background: #fffbeb;
  padding: 0.5rem;
  border-radius: 8px;
  margin-top: 0.5rem;
}

.detail-transcript {
  max-height: 200px;
  overflow-y: auto;
}

.detail-msg {
  font-size: 0.8rem;
  padding: 0.2rem 0;
  color: #4b5563;
}
</style>
