<template>
  <div class="desktop-lyrics-window" :class="{ locked }">
    <div v-if="!locked" class="control-bar">
      <button class="control-btn" @click="toggleLock" :title="$t('desktopLyrics.lock')">
        <Lock :size="14" />
      </button>
      <button class="control-btn close-btn" @click="closeWindow" :title="$t('common.close')">
        ×
      </button>
    </div>

    <div class="lyrics-content">
      <div class="current-line">
        {{ currentLine || $t('nowPlaying.noLyrics') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Lock } from 'lucide-vue-next'
import type { LyricLine } from '@shared/types/lyrics'
import type { DesktopLyricsState } from '@/types/electron'

const { t } = useI18n()
const locked = ref(false)
const lyrics = ref<LyricLine[]>([])
const currentLyricIndex = ref(-1)
const currentMusic = ref<DesktopLyricsState['music']>(null)

const currentLine = computed(() => {
  if (currentLyricIndex.value >= 0 && lyrics.value[currentLyricIndex.value]) {
    return lyrics.value[currentLyricIndex.value].text
  }
  return currentMusic.value?.title || t('player.noMusic')
})

const toggleLock = async () => {
  locked.value = !locked.value
  await window.electronAPI.setDesktopLyricsLocked(locked.value)
}

const closeWindow = async () => {
  await window.electronAPI.toggleDesktopLyrics()
}

const loadLyrics = async (musicId: number) => {
  lyrics.value = []
  currentLyricIndex.value = -1

  try {
    const lyricsData = await window.electronAPI.loadLyrics(musicId)
    // 请求返回时可能已切歌，丢弃过期结果，避免旧歌词覆盖新歌
    if (currentMusic.value?.id !== musicId) return
    if (lyricsData && lyricsData.lines) {
      lyrics.value = lyricsData.lines
    }
  } catch (error) {
    console.error('加载歌词失败:', error)
  }
}

const updateLyricIndex = (time: number) => {
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
}

// 播放状态由主窗口通过 IPC 推送（本窗口的 Pinia store 与主窗口相互独立）
const handleState = (state: DesktopLyricsState) => {
  if (state.music?.id !== currentMusic.value?.id) {
    currentMusic.value = state.music
    if (state.music) {
      loadLyrics(state.music.id)
    } else {
      lyrics.value = []
      currentLyricIndex.value = -1
    }
  }
  updateLyricIndex(state.currentTime)
}

onMounted(() => {
  window.electronAPI.onDesktopLyricsState(handleState)
  // 通知主进程本窗口已就绪，让主窗口立即推送一次当前状态
  window.electronAPI.notifyDesktopLyricsReady()
})

onUnmounted(() => {
  window.electronAPI.removeDesktopLyricsListeners()
})
</script>

<style>
/* 本组件只在独立的桌面歌词窗口中挂载：
   body 与 #app 默认涂有不透明的主题背景色，这里强制透明，
   否则透明 BrowserWindow 仍会显示一块实色背景 */
html,
body,
#app {
  background: transparent !important;
  background-color: transparent !important;
}
</style>

<style scoped>
.desktop-lyrics-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.control-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px 8px 0 0;
  -webkit-app-region: drag;
}

.control-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
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
  /* 黑色描边：先画描边再填充文字，描边不会侵蚀字形内部 */
  -webkit-text-stroke: 4px rgba(0, 0, 0, 0.9);
  paint-order: stroke fill;
  /* 8 方向阴影作为描边的兜底，同时增强透明背景下的可读性 */
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.9),
    1px -1px 0 rgba(0, 0, 0, 0.9),
    -1px 1px 0 rgba(0, 0, 0, 0.9),
    1px 1px 0 rgba(0, 0, 0, 0.9),
    0 2px 8px rgba(0, 0, 0, 0.8);
  line-height: 1.5;
  animation: fadeIn 0.3s ease;
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
