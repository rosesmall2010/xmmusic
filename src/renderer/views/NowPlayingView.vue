<template>
  <div class="now-playing-view" :style="backgroundStyle">
    <!-- 返回按钮 -->
    <div class="top-bar">
      <button class="btn-back" @click="goBack">
        <span class="icon">←</span>
        <span>返回</span>
      </button>

      <div class="actions">
        <button class="btn-action" @click="toggleMiniMode" title="迷你模式">
          <Minimize2 :size="20" />
        </button>
        <button class="btn-action" @click="toggleDesktopLyrics" title="桌面歌词">
          <Monitor :size="20" />
        </button>
        <button class="btn-action" @click="toggleQueue" title="播放队列">
          <List :size="20" />
        </button>
        <button class="btn-action" @click="toggleLyrics" title="歌词">
          <FileText :size="20" />
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="content">
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
          <Heart :size="24" :fill="isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': isFavorite }" />
        </button>

        <button class="btn-control btn-secondary" @click="previous" title="上一首">
          <SkipBack :size="24" />
        </button>

        <button class="btn-control btn-primary" @click="togglePlay" title="播放/暂停">
          <Play v-if="!isPlaying" :size="32" />
          <Pause v-else :size="32" />
        </button>

        <button class="btn-control btn-secondary" @click="next" title="下一首">
          <SkipForward :size="24" />
        </button>

        <button class="btn-control btn-secondary" @click="togglePlayMode" :title="playModeText">
          <component :is="PlayModeIcon" :size="24" />
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'cover' }"
          @click="activeTab = 'cover'"
        >
          封面
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'lyrics' }"
          @click="activeTab = 'lyrics'"
        >
          歌词
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'similar' }"
          @click="activeTab = 'similar'"
        >
          相似歌曲
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'info' }"
          @click="activeTab = 'info'"
        >
          歌曲信息
        </button>
      </div>

      <!-- Tab 内容 -->
      <div class="tab-content">
        <!-- 歌词 -->
        <div v-if="activeTab === 'lyrics'" class="lyrics-panel">
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

        <!-- 相似歌曲 -->
        <div v-if="activeTab === 'similar'" class="similar-panel">
          <div v-if="loadingSimilar" class="loading-state">
            <span class="loading-icon">⏳</span>
            <p>加载中...</p>
          </div>
          <div v-else-if="similarSongs.length > 0" class="similar-list">
            <div
              v-for="song in similarSongs"
              :key="song.id"
              class="similar-item"
              @click="playSimilarSong(song)"
            >
              <div class="similar-cover">
                <DefaultCover v-if="!song.coverPath" size="small" />
                <img v-else :src="getCoverUrl(song.coverPath)" alt="封面" />
              </div>
              <div class="similar-info">
                <div class="similar-title">{{ song.title }}</div>
                <div class="similar-artist">{{ song.artist }}</div>
              </div>
              <div class="similar-action">
                <Play :size="16" />
              </div>
            </div>
          </div>
          <p v-else class="empty-hint">暂无相似歌曲推荐</p>
        </div>

        <!-- 歌曲信息 -->
        <div v-if="activeTab === 'info'" class="info-panel">
          <div class="info-item" v-if="currentMusic">
            <span class="label">文件路径：</span>
            <span class="value">{{ currentMusic.filePath }}</span>
          </div>
          <div class="info-item" v-if="currentMusic">
            <span class="label">文件大小：</span>
            <span class="value">{{ formatSize(currentMusic.fileSize) }}</span>
          </div>
          <div class="info-item" v-if="currentMusic">
            <span class="label">播放次数：</span>
            <span class="value">{{ currentMusic.playCount }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from '@/components/common/DefaultCover.vue'
import { parseLrc, type LyricLine } from '@/utils/lrcParser'
import { getCoverUrl } from '@/utils/media'
import { Monitor, List, FileText, Heart, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, Shuffle, ArrowRight, Minimize2 } from 'lucide-vue-next'

const router = useRouter()
const playerStore = usePlayerStore()
const { play, pause, resume, seek } = usePlayer()

const activeTab = ref('cover')
const backgroundColor = ref('#1a1a1a')
const lyrics = ref<LyricLine[]>([])
const currentLyricIndex = ref(-1)
const lyricsContainerRef = ref<HTMLElement | null>(null)
const similarSongs = ref<any[]>([])
const loadingSimilar = ref(false)

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

const backgroundStyle = computed(() => {
  return {
    background: `linear-gradient(135deg, ${backgroundColor.value} 0%, #0a0a0a 100%)`,
  }
})

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
    await window.electronAPI.toggleFavorite(currentMusic.value.filePath)
    isFavorite.value = !isFavorite.value
  }
}

const toggleQueue = () => {
  // TODO: 实现队列显示
  console.log('Toggle queue')
}

const toggleMiniMode = async () => {
  await window.electronAPI.setMiniMode(true)
  router.push('/mini')
}

const toggleDesktopLyrics = async () => {
  await window.electronAPI.toggleDesktopLyrics()
}

const toggleLyrics = () => {
  activeTab.value = activeTab.value === 'lyrics' ? 'info' : 'lyrics'
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

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// 歌词逻辑
const loadLyrics = async () => {
  lyrics.value = []
  currentLyricIndex.value = -1

  if (!currentMusic.value) return

  try {
    // 尝试获取歌词
    // 优先查找同名 lrc 文件
    const lrcContent = await window.electronAPI.loadLyrics(currentMusic.value.id)
    if (lrcContent) {
      lyrics.value = parseLrc(lrcContent)
      // 如果有歌词，自动切换到歌词标签
      if (lyrics.value.length > 0) {
        activeTab.value = 'lyrics'
      } else {
        activeTab.value = 'cover'
      }
    } else {
      // TODO: 如果本地没有，可以尝试在线搜索（未来功能）
      lyrics.value = [{ time: 0, text: '暂无歌词' }]
      // 没有歌词时，显示封面模式
      activeTab.value = 'cover'
    }
  } catch (error) {
    console.error('Failed to load lyrics:', error)
    lyrics.value = [{ time: 0, text: '歌词加载失败' }]
    activeTab.value = 'cover'
  }
}

const scrollToCurrentLyric = () => {
  if (!lyricsContainerRef.value || currentLyricIndex.value === -1) return

  const activeLine = lyricsContainerRef.value.children[currentLyricIndex.value] as HTMLElement
  if (activeLine) {
    activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 相似歌曲逻辑
const loadSimilarSongs = async () => {
  similarSongs.value = []

  if (!currentMusic.value) return

  loadingSimilar.value = true
  try {
    const songs = await window.electronAPI.getSimilarMusic(currentMusic.value.id, 20, 0.3)
    similarSongs.value = songs
  } catch (error) {
    console.error('Failed to load similar songs:', error)
  } finally {
    loadingSimilar.value = false
  }
}

const playSimilarSong = async (song: any) => {
  await play(song)
}

// 监听当前音乐变化
watch(currentMusic, async (music) => {
  if (music) {
    isFavorite.value = await window.electronAPI.isFileFavorite(music.filePath)
    await loadLyrics()
    await loadSimilarSongs()
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
}

.btn-action:hover {
  background: rgba(255, 255, 255, 0.1);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.album-cover-container {
  margin-bottom: var(--spacing-2xl);
}

.album-cover {
  width: 100%;
  max-width: 400px;
  aspect-ratio: 1;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
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
  margin-bottom: var(--spacing-2xl);
}

.song-title {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
}

.song-artist {
  font-size: var(--font-size-lg);
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: var(--spacing-xs);
}

.song-album {
  font-size: var(--font-size-base);
  color: rgba(255, 255, 255, 0.6);
}

.progress-section {
  width: 100%;
  margin-bottom: var(--spacing-xl);
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
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
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
  font-size: 1.5rem;
  width: 48px;
  height: 48px;
}

.btn-primary {
  font-size: 2.5rem;
  width: 64px;
  height: 64px;
  background: white;
  color: black;
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
}

.btn-primary:hover {
  background: #f0f0f0;
}

.tabs {
  display: flex;
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-xl);
}

.tab {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-base);
  cursor: pointer;
  padding-bottom: var(--spacing-xs);
  border-bottom: 2px solid transparent;
  transition: all var(--transition-base);
}

.tab:hover {
  color: white;
}

.tab.active {
  color: white;
  border-bottom-color: white;
}

.tab-content {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.lyrics-panel {
  height: 100%;
  overflow: hidden;
  position: relative;
}

.lyrics-container {
  height: 100%;
  overflow-y: auto;
  padding: 50% 0; /* Center the content initially */
  text-align: center;
  /* Hide scrollbar */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.lyrics-container::-webkit-scrollbar {
  display: none;
}

.lyrics-line {
  font-size: var(--font-size-lg);
  color: rgba(255, 255, 255, 0.6);
  margin: var(--spacing-lg) 0;
  transition: all var(--transition-base);
  cursor: pointer;
  min-height: 1.5em;
}

.lyrics-line:hover {
  color: rgba(255, 255, 255, 0.8);
}

.lyrics-line.active {
  font-size: var(--font-size-2xl);
  color: white;
  font-weight: 700;
  transform: scale(1.1);
}

.lyrics-line.empty {
  color: rgba(255, 255, 255, 0.4);
}

.similar-panel,
.info-panel {
  height: 100%;
  overflow-y: auto;
}

.empty-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  margin-top: var(--spacing-2xl);
}

.info-item {
  display: flex;
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
}

.info-item .label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  min-width: 100px;
}

.info-item .value {
  color: rgba(255, 255, 255, 0.6);
  word-break: break-all;
}

/* 相似歌曲样式 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: var(--spacing-md);
}

.loading-icon {
  font-size: var(--font-size-3xl);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.similar-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) 0;
}

.similar-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-base);
  cursor: pointer;
  transition: all var(--transition-base);
}

.similar-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.similar-cover {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}

.similar-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.similar-info {
  flex: 1;
  min-width: 0;
}

.similar-title {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-artist {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-action {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-lg);
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
