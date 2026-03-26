<script setup lang="ts">
const user = useSupabaseUser()
const client = useSupabaseClient()
const route = useRoute()

async function logout() {
  await client.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div class="layout">
    <nav v-if="user" class="navbar">
      <div class="nav-left">
        <NuxtLink to="/" class="nav-brand">Pitch Practice</NuxtLink>
      </div>
      <div class="nav-links">
        <NuxtLink to="/" :class="['nav-link', { active: route.path === '/' }]">Pratique</NuxtLink>
        <NuxtLink to="/profile" :class="['nav-link', { active: route.path === '/profile' }]">Profil</NuxtLink>
      </div>
      <div class="nav-right">
        <span class="nav-email">{{ user.email }}</span>
        <button class="btn-logout" @click="logout">Quitter</button>
      </div>
    </nav>
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  background: #f8f9fa;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.nav-brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: #1a1a2e;
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.15s;
}

.nav-link:hover {
  background: #f3f4f6;
  color: #1a1a2e;
}

.nav-link.active {
  background: #1a1a2e;
  color: white;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-email {
  font-size: 0.8rem;
  color: #9ca3af;
}

.btn-logout {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  font-family: inherit;
}

.btn-logout:hover {
  background: #f3f4f6;
}

.main-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}
</style>
