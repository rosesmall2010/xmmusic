<template>
  <div class="mini-player">

    <!-- 顶部栏 -->
    <div class="mini-header">
      <div class="drag-region"></div>
      <div class="window-controls">
        <button class="control-btn close" @click="exitMiniMode" title="退出迷你模式">
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
        <div class="music-title" :title="currentMusic?.title">{{ currentMusic?.title || '暂无播放' }}</div>
        <div class="music-artist" :title="currentMusic?.artist">{{ currentMusic?.artist || '未知艺术家' }}</div>
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
          <SkipBack :size="20" />
        </button>
        <button class="control-btn play-btn" @click="togglePlay">
          <Play v-if="!isPlaying" :size="24" />
          <Pause v-else :size="24" />
        </button>
        <button class="control-btn" @click="next">
          <SkipForward :size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
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
const { play, pause, resume, seek } = usePlayer()

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
  router.push('/')
}

const togglePlay = () => {
  if (isPlaying.value) {
    pause()
  } else {
    if (currentMusic.value) {
      resume()
    }
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
  color: white;
  /* 使用简洁的渐变背景替代模糊效果,性能更好 */
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  user-select: none;
  transition: background 0.3s ease;
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
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  transition: all var(--transition-fast);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  border-radius: 4px; /* 添加圆角 */
}

.control-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1); /* 添加hover背景 */
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
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: white;
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
}

.music-artist {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-section {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
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
  gap: 20px;
  margin-top: auto;
  margin-bottom: 20px;
}

.control-btn {
  font-size: 24px;
}

.play-btn {
  font-size: 40px;
  width: 56px;
  height: 56px;
  background: white;
  color: #667eea;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.play-btn:hover {
  transform: scale(1.05);
}

.control-btn:active {
  transform: scale(0.95);
}
</style>
