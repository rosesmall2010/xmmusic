<template>
  <footer class="player-bar">
    <!-- 左侧：当前播放信息 -->
    <div class="player-left">
      <div class="music-info" @click="openNowPlaying">
        <div class="music-cover">
          <DefaultCover v-if="!currentMusic?.coverPath" size="small" mode="fill" />
          <template v-else>
            <DefaultCover class="fallback-cover" size="small" mode="fill" />
            <img
              :src="getCoverUrl(currentMusic.coverPath)"
              alt="封面"
              @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
            />
          </template>
        </div>
        <div class="music-details">
          <div class="music-title">{{ currentMusic?.title || '暂无播放' }}</div>
          <div class="music-artist">{{ currentMusic?.artist || '未知艺术家' }}</div>
        </div>
      </div>
    </div>

    <!-- 中间：播放控制 -->
    <div class="player-center">
      <div class="playback-controls">
        <button
          class="control-btn"
          @click="previous"
          title="上一首"
          :disabled="!hasMusic"
        >
          <SkipBack :size="18" />
        </button>

        <button
          class="control-btn play-btn"
          @click="togglePlay"
          title="播放/暂停"
          :disabled="!hasMusic && queue.length === 0"
        >
          <Play v-if="!isPlaying" :size="20" :style="{ marginLeft: '2px' }" />
          <Pause v-else :size="20" />
        </button>

        <button
          class="control-btn"
          @click="next"
          title="下一首"
          :disabled="!hasMusic"
        >
          <SkipForward :size="18" />
        </button>

        <button
          class="control-btn"
          @click="togglePlayMode"
          :title="playModeText"
        >
          <component :is="PlayModeIcon" v-if="PlayModeIcon" :size="18" />
        </button>

        <button class="control-btn" @click="toggleQueue" title="播放队列">
          <List :size="18" />
        </button>
      </div>

      <div class="progress-section">
        <span class="time">{{ formatTime(currentTime) }}</span>
        <div class="progress-bar" @click="handleSeek">
          <div class="progress-bg"></div>
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }">
            <div class="progress-thumb"></div>
          </div>
        </div>
        <span class="time">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- 右侧：音量控制和其他按钮 -->
    <div class="player-right">
      <button
        class="control-icon-btn"
        @click="toggleFavorite"
        :class="{ active: isFavorite }"
        title="喜欢"
      >
        <Heart :size="18" :fill="isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': isFavorite }" />
      </button>

      <div class="equalizer-wrapper">
        <button class="control-icon-btn" @click="toggleEqualizer" title="音效">
          <Sliders :size="18" />
        </button>
        <EqualizerPanel v-model="showEqualizer" />
      </div>

      <button class="control-icon-btn" @click="toggleLyrics" title="歌词">
        <FileText :size="18" />
      </button>

      <div class="volume-control">
        <button class="control-icon-btn" @click="toggleMute" title="音量">
          <component :is="VolumeIcon" :size="18" />
        </button>
        <div class="volume-slider">
          <input
            type="range"
            min="0"
            max="100"
            v-model="volumeValue"
            @change="handleVolumeSave"
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
import { getCoverUrl } from '@/utils/media'
import { Heart, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, Shuffle, List, ListOrdered, FileText, Volume2, VolumeX, Sliders } from 'lucide-vue-next'
import EqualizerPanel from '@/components/music/EqualizerPanel.vue'
import { useEqualizer } from '@/composables/useEqualizer'

const router = useRouter()
const playerStore = usePlayerStore()
const { play, pause, resume, seek, setVolume } = usePlayer()

// 音量：直接绑定到 playerStore.volume，避免初始化时子组件先挂载导致显示/保存不同步
const volumeValue = computed<number>({
  get: () => playerStore.volume,
  set: (v) => {
    const next = Math.max(0, Math.min(100, Number(v)))
    playerStore.volume = next
    setVolume(next)
  }
})
const isFavorite = ref(false)
const showEqualizer = ref(false)

// 均衡器
const equalizer = useEqualizer()

// 计算属性
const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)
const playMode = computed(() => playerStore.playMode)
const queue = computed(() => playerStore.queue)
const hasMusic = computed(() => !!currentMusic.value || queue.value.length > 0)

const progressPercentage = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const PlayModeIcon = computed(() => {
  const mode = playMode.value
  if (mode === 'random') return Shuffle
  if (mode === 'repeat') return Repeat
  if (mode === 'single') return Repeat1
  if (mode === 'sequential') return ListOrdered
  return ListOrdered // 默认返回顺序播放图标
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

const VolumeIcon = computed(() => {
  return volumeValue.value === 0 ? VolumeX : Volume2
})

// 方法
const togglePlay = async () => {
  if (isPlaying.value) {
    pause()
  } else {
    if (currentMusic.value) {
      // 检查是否有实际的音频实例
      // 需要检查：1. 元素是否存在 2. 元素是否在DOM中 3. src是否有效
      const audioElement = document.getElementById('xmmusic-audio-player') as HTMLAudioElement
      const hasValidAudioInstance = !!(
        audioElement &&
        audioElement.parentElement && // 确保在DOM中
        audioElement.src &&
        audioElement.src.length > 0
      )

      console.log('🔍 音频实例检查:', {
        hasElement: !!audioElement,
        inDOM: !!(audioElement?.parentElement),
        hasSrc: !!(audioElement?.src),
        src: audioElement?.src || 'none'
      })

      if (hasValidAudioInstance) {
        // 有有效的音频实例，直接恢复播放
        console.log('▶️ 恢复播放')
        resume()
      } else {
        // 没有音频实例（启动后首次播放），重新加载音乐
        console.log('🔄 首次播放，重新加载音乐')
        await play(currentMusic.value)

        // 如果有保存的恢复位置，跳转到该位置
        if (playerStore.resumePosition > 0) {
          setTimeout(() => {
            seek(playerStore.resumePosition)
            playerStore.resumePosition = 0 // 清除恢复位置，避免重复跳转
          }, 300)
        }
      }
    } else if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
      await play(playerStore.queue[playerStore.currentQueueIndex])
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

const handleVolumeSave = async () => {
  // 强制保存状态（包括音量）
  await playerStore.saveState()
}

const toggleMute = () => {
  if (volumeValue.value > 0) {
    volumeValue.value = 0
  } else {
    volumeValue.value = 80
  }
}

const toggleFavorite = async () => {
  if (currentMusic.value) {
    await window.electronAPI.toggleFavorite(currentMusic.value.id)
    isFavorite.value = !isFavorite.value

    // 通知其他组件更新收藏状态
    window.dispatchEvent(new Event('favorites-updated'))
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

const toggleEqualizer = () => {
  showEqualizer.value = !showEqualizer.value
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
    isFavorite.value = await window.electronAPI.isFileFavorite(music.id)
  }
})

// 监听播放状态，初始化均衡器音频上下文
watch(isPlaying, (playing) => {
  if (playing) {
    // 获取音频元素并初始化均衡器
    const audioElement = document.getElementById('hidden-audio') as HTMLAudioElement
    if (audioElement) {
      equalizer.initAudioContext(audioElement)
    }
  }
}, { immediate: true })

// 初始化音量
watch(
  () => playerStore.volume,
  (v) => {
    // 当初始化恢复/快捷键调整音量时，确保播放器实际音量同步
    setVolume(v)
  },
  { immediate: true }
)
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
  gap: calc(var(--spacing-sm) * 2 / 3);
  max-width: 800px;
  justify-content: center;
  padding-top: calc(var(--spacing-xs) + 3px);
  padding-bottom: calc(var(--spacing-xs) + 3px);
}

.player-right {
  flex: 1;
  justify-content: flex-end;
  min-width: 200px;
}

/* 均衡器容器 */
.equalizer-wrapper {
  position: relative;
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
  width: 48px;
  height: 48px;
  border-radius: var(--radius-base);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-secondary);
  position: relative;
}

.music-cover img {
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
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  cursor: pointer;
  color: var(--text-color);
  transition: all var(--transition-base) var(--transition-timing);
  font-size: 1.5rem;
}

.control-btn:hover:not(:disabled) {
  background: transparent; /* 移除圆形背景 */
  transform: scale(1.15); /* 图标放大 */
  color: var(--color-primary); /* 亮色状态 */
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-btn {
  width: 56px;
  height: 36px;
  background: var(--color-primary);
  color: white;
  font-size: 1.5rem;
  border-radius: 18px; /* 胶囊形状：高度的一半 */
  box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.3);
}

.play-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(var(--color-primary-rgb), 0.4);
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
  color: var(--text-secondary);
  transition: all var(--transition-base) var(--transition-timing);
}

.control-icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.control-icon-btn.active {
  color: var(--color-primary);
}

/* Tooltip样式 */
.control-icon-btn {
  position: relative;
}

.control-icon-btn::before {
  content: attr(title);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  padding: 4px 8px;
  background: var(--bg-elevated);
  color: var(--text-color);
  font-size: var(--font-size-xs);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-base) var(--transition-timing);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-color);
  z-index: 1000;
}

.control-icon-btn:hover::before {
  opacity: 1;
  transform: translateX(-50%) translateY(-8px);
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
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-full);
  cursor: pointer;
  position: relative;
  padding: 6px 0; /* 增加点击区域 */
  display: flex;
  align-items: center;
}

.progress-bg {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--border-color);
  border-radius: var(--radius-full);
}

.progress-fill {
  height: 4px;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  position: relative;
  z-index: 1;
}

.progress-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%) scale(0);
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-bar:hover .progress-thumb {
  transform: translateY(-50%) scale(1);
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
