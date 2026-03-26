<script setup lang="ts">
definePageMeta({ layout: false })

onMounted(() => {
  setTimeout(() => navigateTo('/'), 2000)
})
</script>

<template>
  <div class="confirm-page">
    <div class="confirm-card">
      <h2>Compte confirmé!</h2>
      <p>Redirection en cours...</p>
    </div>
  </div>
</template>

<style scoped>
.confirm-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.confirm-card {
  background: white;
  border-radius: 16px;
  padding: 2.5rem;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
</style>
