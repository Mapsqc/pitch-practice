export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase'],
  runtimeConfig: {
    openaiApiKey: '',
    deepgramApiKey: '',
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/login', '/signup', '/vad/*'],
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ['@met4citizen/talkinghead'],
    },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
  },
})
