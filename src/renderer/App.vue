<template>
  <div id="app" :class="theme">
    <Header />
    <div class="main-container">
      <Sidebar />
      <MainContent />
    </div>
    <Footer />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Header from '@/components/Header.vue'
import Sidebar from '@/components/Sidebar.vue'
import MainContent from '@/components/MainContent.vue'
import Footer from '@/components/Footer.vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'

const theme = ref('light')
const playerStore = usePlayerStore()
const player = usePlayer()

onMounted(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'

  await playerStore.initialize(settings)

  if (playerStore.shouldAutoResume && playerStore.currentMusic) {
    await player.play(playerStore.currentMusic)
    if (playerStore.resumePosition > 0) {
      player.seek(playerStore.resumePosition)
    }
  }
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  transition: background-color 0.3s, color 0.3s;
}

#app.light {
  background-color: #f5f5f5;
  color: #333;
}

#app.dark {
  background-color: #1a1a1a;
  color: #fff;
}

.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
