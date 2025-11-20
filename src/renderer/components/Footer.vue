<template>
  <footer class="footer">
    <div class="footer-left">
      <div class="music-info">
        <div class="music-cover">
          <img
            v-if="coverSrc"
            :src="coverSrc"
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
        <button
          class="control-btn play-mode-btn"
          :class="{ active: true }"
          :title="playModeText"
          @click="togglePlayMode"
        >
          {{ playModeIcon }}
        </button>
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
      <div class="audio-effects">
        <button
          class="control-btn effects-btn"
          :title="currentPresetName"
          @click="showEffectsMenu = !showEffectsMenu"
        >
          🎵
        </button>
        <div v-if="showEffectsMenu" class="effects-menu">
          <div
            v-for="(preset, key) in equalizerPresets"
            :key="key"
            class="effects-menu-item"
            :class="{ active: currentPreset === key }"
            @click="selectPreset(key)"
          >
            {{ preset.name }}
          </div>
        </div>
      </div>
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
import { ref, computed, onMounted, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import { EQUALIZER_PRESETS } from '@/composables/useEqualizer'
import { useEqualizer } from '@/composables/useEqualizer'
import DefaultCover from './DefaultCover.vue'

const playerStore = usePlayerStore()
const { play, pause, resume, seek, setVolume } = usePlayer()
const equalizer = useEqualizer()

const volume = ref(playerStore.volume)
const isMuted = ref(false)
const showEffectsMenu = ref(false)
const currentPreset = ref<string | null>(null)

const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)
const playMode = computed(() => playerStore.playMode)

const coverSrc = computed(() => {
  if (!currentMusic.value?.coverPath) return ''
  // 如果已经是 local-file:// 开头则直接返回
  if (currentMusic.value.coverPath.startsWith('local-file://')) {
    return currentMusic.value.coverPath
  }
  // 否则添加协议前缀
  return `local-file://${currentMusic.value.coverPath}`
})

const equalizerPresets = EQUALIZER_PRESETS

const playModeIcon = computed(() => {
  switch (playMode.value) {
    case 'single':
      return '🔂' // 单曲循环
    case 'repeat':
      return '🔁' // 列表循环
    case 'random':
      return '🔀' // 随机播放
    default:
      return '▶️' // 顺序播放
  }
})

const playModeText = computed(() => {
  switch (playMode.value) {
    case 'single':
      return '单曲循环'
    case 'repeat':
      return '列表循环'
    case 'random':
      return '随机播放'
    default:
      return '顺序播放'
  }
})

const currentPresetName = computed(() => {
  if (currentPreset.value && equalizerPresets[currentPreset.value as keyof typeof equalizerPresets]) {
    return equalizerPresets[currentPreset.value as keyof typeof equalizerPresets].name
  }
  return '音效'
})

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

const togglePlayMode = () => {
  playerStore.togglePlayMode()
}

const selectPreset = (presetKey: string) => {
  const preset = equalizerPresets[presetKey as keyof typeof equalizerPresets]
  if (preset) {
    // 启用均衡器并应用预设
    if (!equalizer.enabled.value) {
      equalizer.toggle(true)
    }
    equalizer.applyPreset(preset)
    currentPreset.value = presetKey
    showEffectsMenu.value = false
  }
}

// 点击外部关闭音效菜单
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.audio-effects')) {
    showEffectsMenu.value = false
  }
}

onMounted(() => {
  // 初始化均衡器
  const initEqualizer = () => {
    const audio = document.querySelector('audio')
    if (audio) {
      equalizer.initAudioContext(audio)
      return true
    }
    return false
  }

  // 立即尝试初始化
  if (!initEqualizer()) {
    // 如果没找到，延迟再试
    setTimeout(() => {
      initEqualizer()
    }, 500)
  }

  // 监听当前音乐变化，重新初始化均衡器
  watch(() => playerStore.currentMusic, () => {
    setTimeout(() => {
      initEqualizer()
    }, 300)
  })

  // 加载保存的预设
  const savedPreset = localStorage.getItem('xmmusic_equalizer_preset')
  if (savedPreset && equalizerPresets[savedPreset as keyof typeof equalizerPresets]) {
    selectPreset(savedPreset)
  }

  // 监听点击外部事件
  document.addEventListener('click', handleClickOutside)
})

watch(() => currentPreset.value, (newPreset) => {
  if (newPreset) {
    localStorage.setItem('xmmusic_equalizer_preset', newPreset)
  }
})
</script>

<style scoped>
.footer {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
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
  color: var(--text-color);
}

.music-artist {
  font-size: 12px;
  color: var(--secondary-text-color);
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
  background-color: var(--hover-bg);
}

.play-btn {
  background-color: var(--active-text);
  color: white;
}

.play-btn:hover {
  background-color: var(--active-text);
  opacity: 0.9;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.progress-time {
  font-size: 12px;
  color: var(--secondary-text-color);
  min-width: 40px;
}

.progress-track {
  width: 400px;
  height: 4px;
  background-color: var(--border-color);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.progress-fill {
  height: 100%;
  background-color: var(--active-text);
  border-radius: 2px;
  transition: width 0.1s;
}

.play-mode-btn {
  margin-left: 10px;
}

.play-mode-btn.active {
  color: var(--active-text);
}

.audio-effects {
  position: relative;
  margin-right: 10px;
}

.effects-btn {
  position: relative;
}

.effects-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  min-width: 150px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.effects-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s;
  font-size: 14px;
}

.effects-menu-item:hover {
  background: var(--hover-bg);
}

.effects-menu-item.active {
  background: var(--active-bg);
  color: var(--active-text);
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
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--active-text);
  border-radius: 50%;
  cursor: pointer;
}
</style>
