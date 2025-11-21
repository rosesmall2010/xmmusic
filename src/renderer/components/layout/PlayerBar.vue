<template>
  <footer class="player-bar">
    <!-- 左侧：当前播放信息 -->
    <div class="player-left">
      <div class="music-info" @click="openNowPlaying">
        <div class="music-cover">
          <DefaultCover v-if="!currentMusic?.coverPath" size="small" />
          <img v-else :src="currentMusic.coverPath" alt="封面" />
        </div>
        <div class="music-details">
          <div class="music-title">{{ currentMusic?.title || '暂无播放' }}</div>
          <div class="music-artist">{{ currentMusic?.artist || '未知艺术家' }}</div>
        </div>
      </div>

      <button
        class="control-icon-btn"
        @click="toggleFavorite"
        :class="{ active: isFavorite }"
        title="喜欢"
      >
        <span>{{ isFavorite ? '❤️' : '🤍' }}</span>
      </button>
    </div>

    <!-- 中间：播放控制 -->
    <div class="player-center">
      <div class="playback-controls">
        <button class="control-btn" @click="previous" title="上一首">
          <span class="icon">⏮</span>
        </button>

        <button class="control-btn play-btn" @click="togglePlay" title="播放/暂停">
          <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
        </button>

        <button class="control-btn" @click="next" title="下一首">
          <span class="icon">⏭</span>
        </button>

        <button
          class="control-btn"
          @click="togglePlayMode"
          :title="playModeText"
        >
          <span class="icon">{{ playModeIcon }}</span>
        </button>

        <button class="control-btn" @click="toggleQueue" title="播放队列">
          <span class="icon">📋</span>
        </button>
      </div>

      <div class="progress-section">
        <span class="time">{{ formatTime(currentTime) }}</span>
        <div class="progress-bar" @click="handleSeek">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }">
            <div class="progress-thumb"></div>
          </div>
        </div>
        <span class="time">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- 右侧：音量控制和其他按钮 -->
    <div class="player-right">
      <button class="control-icon-btn" @click="toggleLyrics" title="歌词">
        <span>📝</span>
      </button>

      <div class="volume-control">
        <button class="control-icon-btn" @click="toggleMute" title="音量">
          <span>{{ volumeIcon }}</span>
        </button>
        <div class="volume-slider">
          <input
            type="range"
            min="0"
            max="100"
            v-model="volumeValue"
            @input="handleVolumeChange"
          />
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from '@/components/common/DefaultCover.vue'

const router = useRouter()
const playerStore = usePlayerStore()
const { play, pause, resume, seek, setVolume } = usePlayer()

const volumeValue = ref(80)
const isFavorite = ref(false)

// 计算属性
const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)
const playMode = computed(() => playerStore.playMode)

const progressPercentage = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const playModeIcon = computed(() => {
  const icons = {
    sequential: '➡️',
    random: '🔀',
    repeat: '🔁',
    single: '🔂',
  }
  return icons[playMode.value]
})

const playModeText = computed(() => {
  const texts = {
    sequential: '列表顺序',
    random: '随机播放',
    repeat: '列表循环',
    single: '单曲循环',
  }
  return texts[playMode.value]
})

const volumeIcon = computed(() => {
  if (volumeValue.value === 0) return '🔇'
  if (volumeValue.value < 50) return '🔉'
  return '🔊'
})

// 方法
const togglePlay = () => {
  if (isPlaying.value) {
    pause()
  } else {
    if (currentMusic.value) {
      resume()
    } else if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
      play(playerStore.queue[playerStore.currentQueueIndex])
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

const togglePlayMode = () => {
  playerStore.togglePlayMode()
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

const handleVolumeChange = () => {
  setVolume(volumeValue.value)
  playerStore.volume = volumeValue.value
}

const toggleMute = () => {
  if (volumeValue.value > 0) {
    volumeValue.value = 0
  } else {
    volumeValue.value = 80
  }
  handleVolumeChange()
}

const toggleFavorite = async () => {
  if (currentMusic.value) {
    await window.electronAPI.toggleFavorite(currentMusic.value.filePath)
    isFavorite.value = !isFavorite.value
  }
}

const emit = defineEmits<{
  (e: 'toggle-queue'): void
}>()

const toggleQueue = () => {
  emit('toggle-queue')
}

const toggleLyrics = () => {
  // TODO: 打开歌词面板
  console.log('Toggle lyrics')
}

const openNowPlaying = () => {
  if (currentMusic.value) {
    router.push('/playing')
  }
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 监听当前音乐变化
watch(currentMusic, async (music) => {
  if (music) {
    isFavorite.value = await window.electronAPI.isFileFavorite(music.filePath)
  }
})

// 初始化音量
volumeValue.value = playerStore.volume
</script>

<style scoped>
.player-bar {
  height: var(--footer-height);
  background: var(--bg-color);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-xl);
}

.player-left,
.player-center,
.player-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.player-left {
  flex: 1;
  min-width: 250px;
}

.player-center {
  flex: 2;
  flex-direction: column;
  gap: var(--spacing-sm);
  max-width: 800px;
}

.player-right {
  flex: 1;
  justify-content: flex-end;
  min-width: 200px;
}

/* 音乐信息 */
.music-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  cursor: pointer;
  flex: 1;
  transition: opacity var(--transition-base) var(--transition-timing);
}

.music-info:hover {
  opacity: 0.8;
}

.music-cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-base);
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.music-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.music-details {
  flex: 1;
  min-width: 0;
}

.music-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
}

.music-artist {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 播放控制 */
.playback-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  justify-content: center;
}

.control-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color);
  transition: all var(--transition-base) var(--transition-timing);
}

.control-btn:hover {
  background: var(--hover-bg);
}

.play-btn {
  width: 40px;
  height: 40px;
  background: var(--color-primary);
  color: white;
}

.play-btn:hover {
  background: var(--color-primary-light);
  transform: scale(1.05);
}

.control-icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-base);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-size-lg);
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.control-icon-btn:hover {
  background: var(--hover-bg);
}

.control-icon-btn.active {
  color: var(--color-primary);
}

/* 进度条 */
.progress-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
}

.time {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border-color);
  border-radius: var(--radius-full);
  cursor: pointer;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  position: relative;
  transition: width 100ms linear;
}

.progress-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  opacity: 0;
  transition: opacity var(--transition-base) var(--transition-timing);
}

.progress-bar:hover .progress-thumb {
  opacity: 1;
}

/* 音量控制 */
.volume-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.volume-slider {
  width: 100px;
  opacity: 0;
  transition: opacity var(--transition-base) var(--transition-timing);
}

.volume-control:hover .volume-slider {
  opacity: 1;
}

.volume-slider input[type="range"] {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: var(--radius-full);
  outline: none;
}

.volume-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.icon {
  font-size: inherit;
  display: inline-block;
}
</style>
