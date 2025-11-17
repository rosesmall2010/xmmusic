<template>
  <footer class="footer">
    <div class="footer-left">
      <div class="music-info">
        <div class="music-cover">
          <img
            v-if="currentMusic?.coverPath"
            :src="currentMusic.coverPath"
            alt="封面"
            @error="handleImageError"
          />
          <DefaultCover v-else />
        </div>
        <div class="music-details">
          <div class="music-title">{{ currentMusic?.title || '暂无播放' }}</div>
          <div class="music-artist">{{ currentMusic?.artist || '未知歌手' }}</div>
        </div>
      </div>
    </div>

    <div class="footer-center">
      <div class="playback-controls">
        <button class="control-btn" @click="previous">⏮</button>
        <button class="control-btn play-btn" @click="togglePlay">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="control-btn" @click="next">⏭</button>
      </div>
      <div class="progress-bar">
        <div class="progress-time">{{ formatTime(currentTime) }}</div>
        <div class="progress-track" @click="handleSeek">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
        <div class="progress-time">{{ formatTime(duration) }}</div>
      </div>
    </div>

    <div class="footer-right">
      <div class="volume-control">
        <button class="control-btn" @click="toggleMute">
          {{ volumeIcon }}
        </button>
        <input
          type="range"
          v-model="volume"
          min="0"
          max="100"
          class="volume-slider"
          @input="handleVolumeChange"
        />
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from './DefaultCover.vue'

const playerStore = usePlayerStore()
const { play, pause, resume, seek, setVolume } = usePlayer()

const volume = ref(playerStore.volume)
const isMuted = ref(false)

const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)

const progressPercentage = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const volumeIcon = computed(() => {
  if (isMuted.value || volume.value === 0) return '🔇'
  if (volume.value < 33) return '🔈'
  if (volume.value < 66) return '🔉'
  return '🔊'
})

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const togglePlay = () => {
  if (isPlaying.value) {
    pause()
  } else {
    resume()
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

const toggleMute = () => {
  isMuted.value = !isMuted.value
  setVolume(isMuted.value ? 0 : volume.value)
}

const handleVolumeChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  setVolume(Number(target.value))
}

const handleSeek = (e: MouseEvent) => {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  const time = percent * duration.value
  seek(time)
}

const handleImageError = (e: Event) => {
  // 如果图片加载失败，隐藏 img 标签，显示默认封面
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.footer {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-top: 1px solid #e0e0e0;
  background: #fff;
}

.footer-left,
.footer-center,
.footer-right {
  display: flex;
  align-items: center;
}

.music-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.music-cover {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.music-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.music-details {
  display: flex;
  flex-direction: column;
}

.music-title {
  font-weight: bold;
  font-size: 14px;
}

.music-artist {
  font-size: 12px;
  color: #666;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.control-btn:hover {
  background-color: #f0f0f0;
}

.play-btn {
  background-color: #ff4757;
  color: white;
}

.play-btn:hover {
  background-color: #ff6b7a;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.progress-time {
  font-size: 12px;
  color: #666;
  min-width: 40px;
}

.progress-track {
  width: 400px;
  height: 4px;
  background-color: #e0e0e0;
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.progress-fill {
  height: 100%;
  background-color: #ff4757;
  border-radius: 2px;
  transition: width 0.1s;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 5px;
}

.volume-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  background: #e0e0e0;
  border-radius: 2px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #ff4757;
  border-radius: 50%;
  cursor: pointer;
}
</style>
