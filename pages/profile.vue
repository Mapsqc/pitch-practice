<script setup lang="ts">
const user = useSupabaseUser()
const sessions = ref<any[]>([])
const loading = ref(true)

const totalSessions = computed(() => sessions.value.length)
const totalMinutes = computed(() =>
  Math.round(sessions.value.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60)
)
const sessionsByType = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of sessions.value) {
    counts[s.client_type] = (counts[s.client_type] || 0) + 1
  }
  return counts
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
</script>

<template>
  <div>
    <h2 class="page-title">Mon Profil</h2>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ totalSessions }}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ totalMinutes }}</span>
        <span class="stat-label">Minutes</span>
      </div>
      <div class="stat-card" v-for="(count, type) in sessionsByType" :key="type">
        <span class="stat-value" :style="{ color: clientColors[type as string] }">{{ count }}</span>
        <span class="stat-label">{{ clientLabels[type as string] || type }}</span>
      </div>
    </div>

    <!-- Compétences -->
    <div class="section">
      <h3 class="section-title">Compétences</h3>
      <div class="placeholder-card">
        <p>Les compétences de vente seront ajoutées bientôt.</p>
        <p class="placeholder-sub">Après 10 sessions, chaque compétence recevra une note basée sur ta performance.</p>
      </div>
    </div>

    <!-- Historique -->
    <div class="section">
      <h3 class="section-title">Historique des sessions</h3>

      <div v-if="loading" class="loading">Chargement...</div>

      <div v-else-if="sessions.length === 0" class="placeholder-card">
        <p>Aucune session enregistrée.</p>
        <p class="placeholder-sub">Commence un pitch pour voir ton historique ici.</p>
      </div>

      <div v-else class="session-list">
        <div v-for="session in sessions" :key="session.id" class="session-item">
          <div class="session-info">
            <span class="session-type" :style="{ color: clientColors[session.client_type] }">
              {{ clientLabels[session.client_type] || session.client_type }}
            </span>
            <span class="session-date">{{ formatDate(session.created_at) }}</span>
          </div>
          <span class="session-duration">{{ formatDuration(session.duration_seconds) }}</span>
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

.session-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.session-item:last-child {
  border-bottom: none;
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

.session-duration {
  font-size: 0.85rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}
</style>
