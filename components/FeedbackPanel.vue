<script setup lang="ts">
const props = defineProps<{
  feedback: any
  loading: boolean
  clientType: string | null
}>()

const emit = defineEmits<{
  newSession: []
}>()

const clientLabels: Record<string, string> = {
  technique: 'Le Technique',
  facile: 'Le Facile',
  difficile: 'Le Difficile',
  neutre: 'Le Neutre',
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#f59e0b'
  if (score >= 4) return '#f97316'
  return '#ef4444'
}
</script>

<template>
  <div class="feedback-panel">
    <h2 class="feedback-title">Feedback de session</h2>
    <p class="feedback-subtitle" v-if="clientType">
      Client : {{ clientLabels[clientType] || clientType }}
    </p>

    <!-- Loading -->
    <div v-if="loading" class="feedback-loading">
      <div class="spinner" />
      <p>Analyse de ta performance en cours...</p>
    </div>

    <!-- Error -->
    <div v-else-if="feedback?.error" class="feedback-error">
      <p>{{ feedback.error }}</p>
    </div>

    <!-- Feedback content -->
    <div v-else-if="feedback" class="feedback-content">
      <!-- Score global -->
      <div class="score-global">
        <span class="score-number" :style="{ color: scoreColor(feedback.score_global) }">
          {{ feedback.score_global }}
        </span>
        <span class="score-label">/10</span>
      </div>

      <!-- Points forts -->
      <div v-if="feedback.points_forts?.length" class="feedback-section">
        <h3 class="section-label positive">Points forts</h3>
        <ul>
          <li v-for="point in feedback.points_forts" :key="point">{{ point }}</li>
        </ul>
      </div>

      <!-- A ameliorer -->
      <div v-if="feedback.a_ameliorer?.length" class="feedback-section">
        <h3 class="section-label negative">A ameliorer</h3>
        <ul>
          <li v-for="point in feedback.a_ameliorer" :key="point">{{ point }}</li>
        </ul>
      </div>

      <!-- Conseil cle -->
      <div v-if="feedback.conseil_cle" class="feedback-section conseil">
        <h3 class="section-label">Conseil cle</h3>
        <p>{{ feedback.conseil_cle }}</p>
      </div>

      <!-- Competences detaillees -->
      <div v-if="feedback.competences" class="feedback-section">
        <h3 class="section-label">Competences</h3>
        <div class="competences-grid">
          <div
            v-for="(value, key) in feedback.competences"
            :key="key"
            class="competence-item"
          >
            <div class="competence-header">
              <span class="competence-name">{{ key }}</span>
              <span
                v-if="value.score !== null"
                class="competence-score"
                :style="{ color: scoreColor(value.score) }"
              >
                {{ value.score }}/10
              </span>
              <span v-else class="competence-na">N/A</span>
            </div>
            <p v-if="value.commentaire" class="competence-comment">{{ value.commentaire }}</p>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-new-session" @click="emit('newSession')">
      Nouveau pitch
    </button>
  </div>
</template>

<style scoped>
.feedback-panel {
  padding: 1rem 0;
}

.feedback-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.feedback-subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-bottom: 1.5rem;
}

.feedback-loading {
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #1a1a2e;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.feedback-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 1rem;
  color: #dc2626;
}

.score-global {
  text-align: center;
  margin-bottom: 1.5rem;
}

.score-number {
  font-size: 3rem;
  font-weight: 800;
}

.score-label {
  font-size: 1.5rem;
  color: #9ca3af;
}

.feedback-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  color: #6b7280;
}

.section-label.positive { color: #22c55e; }
.section-label.negative { color: #ef4444; }

.feedback-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feedback-section li {
  padding: 0.35rem 0;
  font-size: 0.9rem;
  border-bottom: 1px solid #f3f4f6;
}

.feedback-section li:last-child {
  border-bottom: none;
}

.conseil {
  background: #fffbeb;
  border-color: #fde68a;
}

.conseil p {
  font-size: 0.9rem;
  line-height: 1.5;
}

.competences-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.competence-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.competence-item:last-child {
  border-bottom: none;
}

.competence-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.competence-name {
  font-size: 0.85rem;
  font-weight: 500;
}

.competence-score {
  font-weight: 700;
  font-size: 0.85rem;
}

.competence-na {
  font-size: 0.8rem;
  color: #d1d5db;
}

.competence-comment {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 0.2rem;
}

.btn-new-session {
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
  font-family: inherit;
}

.btn-new-session:hover {
  background: #2d2d4a;
}
</style>
