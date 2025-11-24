<template>
  <div class="desktop-lyrics-window" :class="{ locked }">
    <div v-if="!locked" class="control-bar">
      <button class="control-btn" @click="toggleLock" title="锁定">
        <Lock :size="14" />
      </button>
      <button class="control-btn close-btn" @click="closeWindow" title="关闭">
        ×
      </button>
    </div>

    <div class="lyrics-content">
      <div class="current-line">
        {{ currentLine || '暂无歌词' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { parseLrc, type LyricLine } from '@/utils/lrcParser'
import { Lock } from 'lucide-vue-next'

const playerStore = usePlayerStore()
const locked = ref(false)
const lyrics = ref<LyricLine[]>([])
const currentLyricIndex = ref(-1)

const currentLine = computed(() => {
  if (currentLyricIndex.value >= 0 && lyrics.value[currentLyricIndex.value]) {
    return lyrics.value[currentLyricIndex.value].text
  }
  return playerStore.currentMusic?.title || '暂无播放'
})

const currentMusic = computed(() => playerStore.currentMusic)
const currentTime = computed(() => playerStore.currentTime)

const toggleLock = async () => {
  locked.value = !locked.value
  await window.electronAPI.setDesktopLyricsLocked(locked.value)
}

const closeWindow = async () => {
  await window.electronAPI.toggleDesktopLyrics()
}

const loadLyrics = async () => {
  lyrics.value = []
  currentLyricIndex.value = -1

  if (!currentMusic.value) return

  try {
    const lrcContent = await window.electronAPI.loadLyrics(currentMusic.value.id)
    if (lrcContent) {
      lyrics.value = parseLrc(lrcContent)
    }
  } catch (error) {
    console.error('Failed to load lyrics:', error)
  }
}

// 监听当前音乐变化
watch(currentMusic, async (music) => {
  if (music) {
    await loadLyrics()
  }
}, { immediate: true })

// 监听播放进度更新歌词
watch(currentTime, (time) => {
  if (lyrics.value.length === 0) return

  let index = lyrics.value.findIndex(line => line.time > time)

  if (index === -1) {
    index = lyrics.value.length - 1
  } else {
    index = Math.max(0, index - 1)
  }

  if (index !== currentLyricIndex.value) {
    currentLyricIndex.value = index
  }
})
</script>

<style scoped>
.desktop-lyrics-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.desktop-lyrics-window.locked {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.control-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  -webkit-app-region: drag;
}

.control-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.close-btn {
  font-size: 20px;
  font-weight: bold;
}

.close-btn:hover {
  background: rgba(255, 59, 48, 0.8);
}

.lyrics-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 32px;
}

.current-line {
  font-size: 32px;
  font-weight: 700;
  color: white;
  text-align: center;
  text-shadow:
    0 0 20px rgba(0, 0, 0, 0.8),
    0 2px 10px rgba(0, 0, 0, 0.6),
    0 0 40px rgba(255, 255, 255, 0.3);
  line-height: 1.5;
  animation: fadeIn 0.3s ease;
}

.desktop-lyrics-window.locked .current-line {
  text-shadow:
    0 0 30px rgba(0, 0, 0, 0.9),
    0 3px 15px rgba(0, 0, 0, 0.8),
    0 0 60px rgba(255, 255, 255, 0.4),
    2px 2px 4px rgba(0, 0, 0, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
