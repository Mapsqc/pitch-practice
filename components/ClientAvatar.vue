<script setup lang="ts">
const container = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadProgress = ref(0)

let head: any = null

const AVATAR_URL = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus+Visemes,mouthOpen,mouthSmile,eyesClosed,eyesLookUp,eyesLookDown&textureSizeLimit=1024&textureFormat=png'

onMounted(async () => {
  if (!container.value) return

  try {
    const { TalkingHead } = await import('@met4citizen/talkinghead/modules/talkinghead.mjs')

    head = new TalkingHead(container.value, {
      ttsEndpoint: 'N/A',
      lipsyncModules: ['fr'],
      cameraView: 'upper',
      cameraDistance: 0.6,
    })

    await head.showAvatar(
      {
        url: AVATAR_URL,
        body: 'M',
        avatarMood: 'neutral',
        lipsyncLang: 'fr',
      },
      (ev: ProgressEvent) => {
        if (ev.lengthComputable) {
          loadProgress.value = Math.round((ev.loaded / ev.total) * 100)
        }
      },
    )

    loading.value = false
  } catch (err) {
    console.error('Failed to load avatar:', err)
  }
})

async function startStreaming() {
  if (!head) return
  await head.streamStart({
    sampleRate: 24000,
    lipsyncLang: 'fr',
    lipsyncType: 'visemes',
  })
}

function feedAudio(audioData: Float32Array) {
  if (!head || !head.isStreaming) return
  head.streamAudio({ audio: audioData })
}

function stopStreaming() {
  if (!head) return
  try {
    head.streamNotifyEnd()
  } catch (e) {
    // ignore
  }
}

function cleanup() {
  if (!head) return
  try {
    head.streamStop()
  } catch (e) {
    // ignore
  }
}

onUnmounted(() => {
  cleanup()
})

defineExpose({
  startStreaming,
  feedAudio,
  stopStreaming,
  cleanup,
})
</script>

<template>
  <div class="avatar-wrapper">
    <div ref="container" class="avatar-container" />
    <div v-if="loading" class="avatar-loading">
      <div class="loading-text">Chargement {{ loadProgress }}%</div>
      <div class="loading-bar">
        <div class="loading-fill" :style="{ width: loadProgress + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-height: 400px;
  border-radius: 16px;
  overflow: hidden;
  background: #1a1a2e;
}

.avatar-container {
  width: 100%;
  height: 100%;
}

.avatar-container :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.avatar-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  gap: 0.75rem;
}

.loading-text {
  color: #9ca3af;
  font-size: 0.9rem;
}

.loading-bar {
  width: 60%;
  height: 4px;
  background: #2d2d4a;
  border-radius: 2px;
  overflow: hidden;
}

.loading-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 2px;
  transition: width 0.2s;
}
</style>
