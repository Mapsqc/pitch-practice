<script setup lang="ts">
definePageMeta({ layout: false })

const client = useSupabaseClient()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const isSignUp = ref(false)

async function submit() {
  error.value = ''
  loading.value = true

  try {
    if (isSignUp.value) {
      const { error: err } = await client.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (err) throw err
      error.value = 'Vérifie ton courriel pour confirmer ton compte!'
    } else {
      const { error: err } = await client.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (err) throw err
      navigateTo('/')
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Pitch Practice</h1>
      <p class="auth-subtitle">Pratique tes pitchs de vente</p>

      <form @submit.prevent="submit" class="auth-form">
        <input
          v-model="email"
          type="email"
          placeholder="Courriel"
          required
          class="auth-input"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Mot de passe"
          required
          minlength="6"
          class="auth-input"
        />

        <p v-if="error" :class="['auth-msg', { success: isSignUp && !error.includes('Error') }]">
          {{ error }}
        </p>

        <button type="submit" class="auth-btn" :disabled="loading">
          {{ loading ? '...' : (isSignUp ? 'Créer un compte' : 'Se connecter') }}
        </button>
      </form>

      <button class="auth-toggle" @click="isSignUp = !isSignUp">
        {{ isSignUp ? 'Déjà un compte? Se connecter' : 'Pas de compte? En créer un' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.auth-card {
  background: white;
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.auth-card h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
}

.auth-subtitle {
  color: #9ca3af;
  font-size: 0.9rem;
  margin-top: 0.25rem;
  margin-bottom: 1.5rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.auth-input {
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.auth-input:focus {
  border-color: #1a1a2e;
}

.auth-msg {
  font-size: 0.85rem;
  color: #ef4444;
}

.auth-msg.success {
  color: #22c55e;
}

.auth-btn {
  padding: 0.75rem;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.auth-btn:hover:not(:disabled) {
  background: #2d2d4a;
}

.auth-btn:disabled {
  opacity: 0.6;
}

.auth-toggle {
  margin-top: 1rem;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
  font-family: inherit;
}

.auth-toggle:hover {
  color: #1a1a2e;
}
</style>
