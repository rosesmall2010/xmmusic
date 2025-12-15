<template>
  <div class="mini-player">

    <!-- 顶部栏 -->
    <div class="mini-header">
      <div class="drag-region"></div>
      <div class="window-controls">
        <button class="control-btn close" @click="exitMiniMode" :title="$t('miniPlayer.exitMiniMode')">
          <Maximize2 :size="20" />
        </button>
      </div>
    </div>

    <!-- 主要内容 -->
    <div class="mini-content">
      <div class="cover-section">
        <div class="cover-wrapper" :class="{ playing: isPlaying }">
          <DefaultCover v-if="!currentMusic?.coverPath" mode="fill" />
          <template v-else>
            <DefaultCover class="fallback-cover" mode="fill" />
            <img
              :src="getCoverUrl(currentMusic.coverPath)"
              alt="cover"
              @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
            />
          </template>
        </div>
      </div>

      <div class="info-section">
        <div class="music-title" :title="currentMusic?.title">{{ currentMusic?.title || $t('miniPlayer.noMusic') }}</div>
        <div class="music-artist" :title="currentMusic?.artist">{{ currentMusic?.artist || $t('miniPlayer.unknownArtist') }}</div>
      </div>

      <!-- 进度条 -->
      <div class="progress-section" @click="handleSeek">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
      </div>

      <!-- 控制栏 -->
      <div class="controls-section">
        <button class="control-btn" @click="previous">
          <SkipBack :size="18" />
        </button>
        <button class="control-btn play-btn" @click="togglePlay">
          <Play v-if="!isPlaying" :size="20" :style="{ marginLeft: '2px' }" />
          <Pause v-else :size="20" />
        </button>
        <button class="control-btn" @click="next">
          <SkipForward :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { usePlayer } from '@/composables/usePlayer'
import { getCoverUrl } from '@/utils/media'
import { SkipBack, Play, Pause, SkipForward, Maximize2 } from 'lucide-vue-next'
import DefaultCover from '@/components/common/DefaultCover.vue'

// 定义组件名称以支持keep-alive
defineOptions({
  name: 'MiniPlayer'
})

const router = useRouter()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const { play, pause, resume, seek } = usePlayer()

// 检测当前主题
const isDarkTheme = computed(() => {
  const appElement = document.getElementById('app')
  if (!appElement) {
    return settingsStore.theme === 'dark' || 
      (settingsStore.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  }
  return appElement.classList.contains('dark') || 
    (!appElement.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches)
})

const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)

const progressPercentage = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const exitMiniMode = async () => {
  await window.electronAPI.setMiniMode(false)
  // 恢复之前的路由路径
  const lastRoute = localStorage.getItem('lastRoute')
  if (lastRoute) {
    router.replace(lastRoute)
    localStorage.removeItem('lastRoute') // 清除记录
  } else {
    router.replace('/')
  }
}

const togglePlay = async () => {
  if (isPlaying.value) {
    pause()
    return
  }

  if (currentMusic.value) {
    // 启动后首次播放：可能还没有创建/绑定音频实例，此时 resume() 不会生效
    const audioElement = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
    const hasValidAudioInstance = !!(
      audioElement &&
      audioElement.parentElement && // 确保在 DOM 中
      audioElement.src &&
      audioElement.src.length > 0
    )

    if (hasValidAudioInstance) {
      resume()
      return
    }

    await play(currentMusic.value)
    return
  }

  if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
    await play(playerStore.queue[playerStore.currentQueueIndex])
  }
}

const previous = async () => {
  const prev = playerStore.getPrevious()
  if (prev) {
    const index = playerStore.queue.findIndex(m => m.id === prev.id)
    if (index >= 0) {
      playerStore.setCurrentQueueIndex(index)
      await play(prev)
    }
  }
}

const next = async () => {
  const nextMusic = playerStore.getNext()
  if (nextMusic) {
    const index = playerStore.queue.findIndex(m => m.id === nextMusic.id)
    if (index >= 0) {
      playerStore.setCurrentQueueIndex(index)
      await play(nextMusic)
    }
  }
}

const handleSeek = (e: MouseEvent) => {
  if (!duration.value) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percentage = x / rect.width
  const time = percentage * duration.value
  seek(time)
}
</script>

<style scoped>
.mini-player {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  /* 使用主题背景色，深色主题使用深色渐变，浅色主题使用浅色渐变 */
  background: var(--bg-color);
  user-select: none;
  transition: background-color var(--transition-slow), color var(--transition-slow);
}

.mini-header {
  height: 30px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 10px;
  position: relative;
  z-index: 10;
}

.drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 40px;
  height: 100%;
  -webkit-app-region: drag;
}

.window-controls {
  -webkit-app-region: no-drag;
}

.control-btn {
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  transition: all var(--transition-fast);
  border-radius: var(--radius-base);
}

.control-btn:hover {
  color: var(--text-color);
  background: var(--hover-bg);
}

.mini-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 20px 20px;
  gap: 15px;
}

.cover-section {
  width: 180px;
  height: 180px;
  margin-top: 20px;
}

.cover-wrapper {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  position: relative;
}

.cover-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: relative;
  z-index: 1;
}

.fallback-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.default-cover {
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--text-tertiary);
}

.info-section {
  text-align: center;
  width: 100%;
}

.music-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color);
}

.music-artist {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-section {
  width: 100%;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.progress-section:hover {
  height: 6px;
}

.progress-bar {
  width: 100%;
  height: 100%;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
}

.controls-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: auto;
  margin-bottom: 20px;
}

.control-btn {
  font-size: 24px;
}

.play-btn {
  width: 64px;
  height: 34px;
  background: var(--color-primary);
  color: white;
  border-radius: 17px; /* 胶囊：高度的一半 */
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  box-shadow: 0 6px 16px rgba(var(--color-primary-rgb), 0.35);
  transition: all var(--transition-base) var(--transition-timing);
}

.play-btn:hover {
  background: var(--color-primary-light);
  transform: scale(1.05);
  box-shadow: 0 8px 20px rgba(var(--color-primary-rgb), 0.45);
}

.control-btn:active {
  transform: scale(0.95);
}
</style>
