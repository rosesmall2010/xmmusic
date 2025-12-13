<template>
  <div class="now-playing-view" :style="backgroundStyle">
    <!-- 返回按钮 -->
    <div class="top-bar">
      <button class="btn-back" @click="goBack">
        <span class="icon">←</span>
        <span>返回</span>
      </button>

      <div class="actions">
        <button class="btn-action" @click="toggleMiniMode">
          <Minimize2 :size="20" />
          <span class="btn-tooltip">切换到迷你模式</span>
        </button>
        <button class="btn-action" @click="toggleDesktopLyrics">
          <Monitor :size="20" />
          <span class="btn-tooltip">桌面歌词（仅生产模式可用）</span>
        </button>
        <button class="btn-action" @click="toggleQueue">
          <List :size="20" />
          <span class="btn-tooltip">显示播放队列</span>
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="content">
      <!-- 上半部分：左右分栏 -->
      <div class="main-area">
        <!-- 左侧：封面和歌曲信息 -->
        <div class="left-panel">
          <!-- 专辑封面 -->
          <div class="album-cover-container">
            <div class="album-cover animate-scale-in">
              <DefaultCover v-if="!currentMusic?.coverPath" mode="fill" />
              <template v-else>
                <DefaultCover class="fallback-cover" mode="fill" />
                <img
                  :src="getCoverUrl(currentMusic.coverPath)"
                  alt="封面"
                  @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                />
              </template>
            </div>
          </div>

          <!-- 歌曲信息 -->
          <div class="song-info animate-slide-in-up">
            <h1 class="song-title">{{ currentMusic?.title || '暂无播放' }}</h1>
            <p class="song-artist">{{ currentMusic?.artist || '未知艺术家' }}</p>
            <p class="song-album" v-if="currentMusic?.album">{{ currentMusic.album }}</p>
          </div>
        </div>

        <!-- 右侧：歌词/队列 -->
        <div class="right-panel">
          <!-- 切换标签 -->
          <div class="panel-tabs">
            <button
              class="panel-tab"
              :class="{ active: rightPanelMode === 'lyrics' }"
              @click="rightPanelMode = 'lyrics'"
            >
              歌词
            </button>
            <button
              class="panel-tab"
              :class="{ active: rightPanelMode === 'queue' }"
              @click="rightPanelMode = 'queue'"
            >
              播放队列 ({{ queue.length }})
            </button>
          </div>

          <!-- 歌词面板 -->
          <div v-show="rightPanelMode === 'lyrics'" class="lyrics-panel">
            <div class="lyrics-container" ref="lyricsContainerRef">
              <p
                v-for="(line, index) in lyrics"
                :key="index"
                class="lyrics-line"
                :class="{ active: index === currentLyricIndex }"
                @click="seek(line.time)"
              >
                {{ line.text }}
              </p>
              <p v-if="lyrics.length === 0" class="lyrics-line empty">暂无歌词</p>
            </div>
          </div>

          <!-- 队列面板 -->
          <div v-show="rightPanelMode === 'queue'" class="queue-panel">
            <div class="queue-list" ref="queueListRef">
              <div
                v-for="(music, index) in queue"
                :key="music.id"
                class="queue-item"
                :class="{ active: currentQueueIndex === index }"
                @dblclick="playQueueItem(index)"
              >
                <div class="item-index">
                  <Volume2 v-if="currentQueueIndex === index" :size="14" class="playing-icon" />
                  <span v-else>{{ index + 1 }}</span>
                </div>
                <div class="item-info">
                  <div class="item-title">{{ music.title }}</div>
                  <div class="item-meta">
                    <span class="item-artist">{{ music.artist }}</span>
                    <span class="item-sep">·</span>
                    <span class="item-filename">{{ music.fileName }}</span>
                  </div>
                </div>
                <div class="item-duration">{{ formatTime(music.duration) }}</div>
                <button class="item-remove" @click.stop="removeQueueItem(index)">×</button>
              </div>
              <div v-if="queue.length === 0" class="queue-empty">队列为空</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 下半部分：播放控制区 -->
      <div class="player-footer">
        <!-- 进度条 -->
        <div class="progress-section">
          <div class="progress-bar" @click="handleSeek">
            <div class="progress-fill" :style="{ width: progressPercentage + '%' }">
              <div class="progress-thumb"></div>
            </div>
          </div>
          <div class="progress-time">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- 播放控制 -->
        <div class="controls">
          <button class="btn-control btn-secondary" @click="toggleFavorite" title="喜欢">
            <Heart :size="20" :fill="isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': isFavorite }" />
          </button>

          <button class="btn-control btn-secondary" @click="previous" title="上一首">
            <SkipBack :size="20" />
          </button>

          <button class="btn-control btn-primary" @click="togglePlay" title="播放/暂停">
            <Play v-if="!isPlaying" :size="28" />
            <Pause v-else :size="28" />
          </button>

          <button class="btn-control btn-secondary" @click="next" title="下一首">
            <SkipForward :size="20" />
          </button>

          <button class="btn-control btn-secondary" @click="togglePlayMode" :title="playModeText">
            <component :is="PlayModeIcon" :size="20" />
          </button>

          <button class="btn-control btn-secondary" @click="toggleEqualizer" title="音效">
            <Sliders :size="20" />
          </button>

          <div class="volume-control">
            <button class="btn-control btn-secondary" @click="toggleMute" :title="volumeValue === 0 ? '取消静音' : '静音'">
              <component :is="VolumeIcon" :size="20" />
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
      </div>
    </div>

    <!-- 音效面板 - 全屏居中显示 -->
    <EqualizerPanel v-model="showEqualizer" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from '@/components/common/DefaultCover.vue'
import { type LyricLine } from '@/utils/lrcParser'
import { getCoverUrl } from '@/utils/media'
import { Monitor, List, Heart, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, Shuffle, ArrowRight, Minimize2, Volume2, VolumeX, Sliders } from 'lucide-vue-next'
import { useEqualizer } from '@/composables/useEqualizer'
import EqualizerPanel from '@/components/music/EqualizerPanel.vue'

const router = useRouter()
const playerStore = usePlayerStore()
const { play, pause, resume, seek, setVolume } = usePlayer()
const equalizer = useEqualizer()

const backgroundColor = ref('#1a1a1a')
const lyrics = ref<LyricLine[]>([])
const currentLyricIndex = ref(-1)
const lyricsContainerRef = ref<HTMLElement | null>(null)
const queueListRef = ref<HTMLElement | null>(null)
const rightPanelMode = ref<'lyrics' | 'queue'>('lyrics') // 右侧面板模式
const showEqualizer = ref(false)
const volumeValue = computed<number>({
  get: () => playerStore.volume,
  set: (v) => {
    const next = Math.max(0, Math.min(100, Number(v)))
    playerStore.volume = next
    setVolume(next)
  }
})

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

const PlayModeIcon = computed(() => {
  const mode = playMode.value
  if (mode === 'random') return Shuffle
  if (mode === 'repeat') return Repeat
  if (mode === 'single') return Repeat1
  if (mode === 'sequential') return ArrowRight
  return ArrowRight
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

const backgroundStyle = computed(() => {
  return {
    background: `linear-gradient(135deg, ${backgroundColor.value} 0%, #0a0a0a 100%)`,
  }
})

const queue = computed(() => playerStore.queue)
const currentQueueIndex = computed(() => playerStore.currentQueueIndex)

const isFavorite = ref(false)

// 方法
const goBack = () => {
  router.back()
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

const togglePlayMode = () => {
  playerStore.togglePlayMode()
}

const toggleFavorite = async () => {
  if (currentMusic.value) {
    // 先本地立即切换，提升响应速度
    isFavorite.value = !isFavorite.value
    // 再以数据库结果为准回填（toggleFavorite 直接返回最新状态，避免二次查询）
    isFavorite.value = await window.electronAPI.toggleFavorite(currentMusic.value.id)
    // 通知其他组件更新收藏状态
    window.dispatchEvent(new Event('favorites-updated'))
  }
}

const toggleQueue = () => {
  // 在NowPlayingView中，切换右侧面板显示队列
  rightPanelMode.value = rightPanelMode.value === 'queue' ? 'lyrics' : 'queue'
}

const playQueueItem = async (index: number) => {
  playerStore.setCurrentQueueIndex(index)
  await play(queue.value[index])
}

const removeQueueItem = (index: number) => {
  playerStore.removeFromQueue(index)
}

const toggleMiniMode = async () => {
  // 保存当前路由路径，以便退出Mini模式时恢复
  localStorage.setItem('lastRoute', router.currentRoute.value.fullPath)
  await window.electronAPI.setMiniMode(true)
  router.replace('/mini')
}

const toggleDesktopLyrics = async () => {
  await window.electronAPI.toggleDesktopLyrics()
}

const toggleEqualizer = () => {
  showEqualizer.value = !showEqualizer.value
}

const toggleMute = () => {
  if (volumeValue.value > 0) {
    volumeValue.value = 0
  } else {
    volumeValue.value = 80
  }
}

const handleVolumeSave = async () => {
  await playerStore.saveState()
}

const scrollToCurrentQueueItem = () => {
  if (!queueListRef.value || currentQueueIndex.value < 0) return

  const activeItem = queueListRef.value.children[currentQueueIndex.value] as HTMLElement
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}



// 歌词逻辑
const loadLyrics = async () => {
  lyrics.value = []
  currentLyricIndex.value = -1

  if (!currentMusic.value) return

  try {
    // 尝试获取歌词
    // 优先查找同名 lrc 文件
    const lyricsData = await window.electronAPI.loadLyrics(currentMusic.value.id)
    if (lyricsData && lyricsData.lines) {
      lyrics.value = lyricsData.lines
    } else {
      // TODO: 如果本地没有，可以尝试在线搜索（未来功能）
      lyrics.value = [{ time: 0, text: '暂无歌词' }]
    }
  } catch (error) {
    console.error('Failed to load lyrics:', error)
    lyrics.value = [{ time: 0, text: '歌词加载失败' }]
  }
}

const scrollToCurrentLyric = () => {
  if (!lyricsContainerRef.value || currentLyricIndex.value === -1) return

  const activeLine = lyricsContainerRef.value.children[currentLyricIndex.value] as HTMLElement
  if (activeLine) {
    activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 监听当前音乐变化
watch(currentMusic, async (music) => {
  if (music) {
    isFavorite.value = await window.electronAPI.isFileFavorite(music.id)
    await loadLyrics()
  } else {
    isFavorite.value = false
  }
}, { immediate: true })

// 监听播放进度更新歌词
watch(currentTime, (time) => {
  if (lyrics.value.length === 0) return

  // 找到当前时间对应的歌词行
  let index = lyrics.value.findIndex(line => line.time > time)

  if (index === -1) {
    // 如果没找到比当前时间大的，说明是最后一行
    index = lyrics.value.length - 1
  } else {
    // 否则是前一行
    index = Math.max(0, index - 1)
  }

  if (index !== currentLyricIndex.value) {
    currentLyricIndex.value = index
    scrollToCurrentLyric()
  }
})

// 监听当前队列索引变化，自动滚动到当前播放的歌曲
watch(currentQueueIndex, () => {
  if (rightPanelMode.value === 'queue') {
    // 延迟一下确保 DOM 已更新
    setTimeout(() => {
      scrollToCurrentQueueItem()
    }, 100)
  }
})

// 监听右侧面板切换，切换到队列时滚动到当前歌曲
watch(rightPanelMode, (mode) => {
  if (mode === 'queue') {
    setTimeout(() => {
      scrollToCurrentQueueItem()
    }, 100)
  }
})

// 监听播放器音量变化，同步到实际播放器
watch(
  () => playerStore.volume,
  (v) => {
    setVolume(v)
  },
  { immediate: true }
)
</script>

<style scoped>
.now-playing-view {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xl) 0;
  color: white;
  overflow-y: auto;
  width: 100%;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xl);
  padding: 0 var(--spacing-xl);
  -webkit-app-region: drag;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: none;
  border: none;
  color: white;
  font-size: var(--font-size-lg);
  cursor: pointer;
  padding: var(--spacing-sm);
  border-radius: var(--radius-base);
  transition: background var(--transition-base);
  -webkit-app-region: no-drag;
}

.btn-back:hover {
  background: rgba(255, 255, 255, 0.1);
}

.actions {
  display: flex;
  gap: var(--spacing-md);
  -webkit-app-region: no-drag;
}

.btn-action {
  background: none;
  border: none;
  color: white;
  font-size: var(--font-size-xl);
  cursor: pointer;
  padding: var(--spacing-sm);
  border-radius: var(--radius-base);
  transition: background var(--transition-base);
  -webkit-app-region: no-drag;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-action:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* 自定义tooltip */
.btn-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease 2s; /* 2秒延迟后才显示 */
  z-index: 1000;
}

.btn-action:hover .btn-tooltip {
  opacity: 1;
}

/* tooltip箭头 */
.btn-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: rgba(0, 0, 0, 0.9);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  min-height: 0;
  gap: var(--spacing-2xl);
}

/* 上半部分 - 左右分栏 */
.main-area {
  flex: 1;
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: var(--spacing-3xl);
  min-height: 0;
  overflow: hidden;
}

/* 左侧面板 - 封面和歌曲信息 */
.left-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xl);
}

.album-cover-container {
  width: 100%;
}

.album-cover {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  margin: 0 auto;
}

.album-cover img {
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

.song-info {
  text-align: center;
  width: 100%;
}

.song-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
}

.song-artist {
  font-size: var(--font-size-base);
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: var(--spacing-xs);
}

.song-album {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.6);
}

/* 右侧面板 - 歌词/队列 */
.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  gap: var(--spacing-md);
}

/* 面板切换标签 */
.panel-tabs {
  display: flex;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-tab {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-base);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  border-radius: var(--radius-base);
  transition: all var(--transition-base);
}

.panel-tab:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.panel-tab.active {
  color: white;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 600;
}

/* 歌词面板 */
.lyrics-panel {
  height: 100%;
  overflow: hidden;
  position: relative;
  flex: 1;
}

.lyrics-container {
  height: 100%;
  overflow-y: auto;
  padding: 50% 0;
  text-align: center;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.lyrics-container::-webkit-scrollbar {
  display: none;
}

.lyrics-line {
  font-size: var(--font-size-xl);
  color: rgba(255, 255, 255, 0.5);
  margin: var(--spacing-xl) 0;
  transition: all var(--transition-base);
  cursor: pointer;
  min-height: 1.5em;
  padding: 0 var(--spacing-lg);
}

.lyrics-line:hover {
  color: rgba(255, 255, 255, 0.7);
}

.lyrics-line.active {
  font-size: var(--font-size-3xl);
  color: white;
  font-weight: 700;
  transform: scale(1.05);
}

.lyrics-line.empty {
  color: rgba(255, 255, 255, 0.4);
}

/* 队列面板 */
.queue-panel {
  flex: 1;
  overflow: hidden;
}

.queue-list {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.queue-list::-webkit-scrollbar {
  width: 6px;
}

.queue-list::-webkit-scrollbar-track {
  background: transparent;
}

.queue-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.queue-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.queue-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-base);
  cursor: pointer;
  transition: background var(--transition-base);
}

.queue-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.queue-item.active {
  background: rgba(255, 255, 255, 0.1);
}

.queue-item .item-index {
  width: 24px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.queue-item.active .item-index {
  color: white;
}

.queue-item .playing-icon {
  color: white;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.queue-item .item-info {
  flex: 1;
  min-width: 0;
}

.queue-item .item-title {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.queue-item.active .item-title {
  color: white;
  font-weight: 600;
}

.queue-item .item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

.queue-item .item-artist,
.queue-item .item-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item .item-artist {
  flex-shrink: 1;
}

.queue-item .item-filename {
  flex-shrink: 2;
}

.queue-item .item-sep {
  flex-shrink: 0;
}

.queue-item .item-duration {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.queue-item .item-remove {
  opacity: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  transition: all var(--transition-base);
  flex-shrink: 0;
}

.queue-item:hover .item-remove {
  opacity: 1;
}

.queue-item .item-remove:hover {
  color: white;
}

.queue-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: var(--font-size-base);
}

/* 底部播放控制区 */
.player-footer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.progress-section {
  width: 100%;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
  margin-bottom: var(--spacing-xs);
}

.progress-fill {
  height: 100%;
  background: white;
  border-radius: 2px;
  position: relative;
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
  opacity: 0;
  transition: opacity var(--transition-base);
}

.progress-bar:hover .progress-thumb {
  opacity: 1;
}

.progress-time {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.6);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  justify-content: center;
  flex-wrap: wrap;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-left: var(--spacing-md);
  height: 56px; /* 与播放按钮高度一致，确保垂直居中 */
}

.volume-slider {
  width: 100px;
  height: 4px;
  position: relative;
  display: flex;
  align-items: center;
}

.volume-slider input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  -webkit-appearance: none;
}

.volume-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.volume-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.volume-slider input[type="range"]:hover::-webkit-slider-thumb {
  transform: scale(1.2);
}

.volume-slider input[type="range"]::-moz-range-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.volume-slider input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.volume-slider input[type="range"]:hover::-moz-range-thumb {
  transform: scale(1.2);
}

.btn-control {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--transition-base);
}

.btn-control:hover {
  transform: scale(1.1);
}

.btn-control:active {
  transform: scale(0.95);
}

.btn-secondary {
  font-size: 1.2rem;
  width: 40px;
  height: 40px;
}

.btn-primary {
  font-size: 2rem;
  width: 56px;
  height: 56px;
  background: white;
  color: black;
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
}

.btn-primary:hover {
  background: #f0f0f0;
}

/* Animations */
.animate-scale-in {
  animation: scaleIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.animate-slide-in-up {
  animation: slideInUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
