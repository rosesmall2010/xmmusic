<template>
  <div class="mini-player">
    <!-- 背景模糊 -->
    <div class="background-layer" :style="backgroundStyle"></div>
    <div class="overlay-layer"></div>

    <!-- 顶部栏 -->
    <div class="mini-header">
      <div class="drag-region"></div>
      <div class="window-controls">
        <button class="control-btn close" @click="exitMiniMode" title="退出迷你模式">
          <span>↗</span>
        </button>
      </div>
    </div>

    <!-- 主要内容 -->
    <div class="mini-content">
      <div class="cover-section">
        <div class="cover-wrapper" :class="{ playing: isPlaying }">
          <img v-if="currentMusic?.coverPath" :src="getCoverUrl(currentMusic.coverPath)" alt="cover" />
          <div v-else class="default-cover">🎵</div>
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
        <button class="control-btn" @click="previous">⏮</button>
        <button class="control-btn play-btn" @click="togglePlay">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="control-btn" @click="next">⏭</button>
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

const backgroundStyle = computed(() => {
  if (currentMusic.value?.coverPath) {
    return {
      backgroundImage: `url(${getCoverUrl(currentMusic.value.coverPath)})`
    }
  }
  return { background: '#2c3e50' }
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
  user-select: none;
}

.background-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  filter: blur(20px) brightness(0.6);
  z-index: -2;
}

.overlay-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: -1;
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
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  transition: color 0.2s;
}

.control-btn:hover {
  color: white;
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.cover-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-cover {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
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
  color: white;
  opacity: 0.9;
}

.play-btn {
  font-size: 40px;
  width: 56px;
  height: 56px;
  background: white;
  color: black;
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
