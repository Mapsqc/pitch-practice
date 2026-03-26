export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase'],
  runtimeConfig: {
    openaiApiKey: '',
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/login', '/signup'],
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ['@met4citizen/talkinghead'],
    },
  },
})
