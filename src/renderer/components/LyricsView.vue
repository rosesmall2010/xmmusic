<template>
  <div class="lyrics-view" :class="{ 'show-lyrics': showLyrics }">
    <div class="lyrics-header">
      <h3>歌词</h3>
      <div class="lyrics-controls">
        <button class="btn-toggle" @click="toggleLyrics">
          {{ showLyrics ? '隐藏歌词' : '显示歌词' }}
        </button>
        <button v-if="showLyrics && !lyricsData" class="btn-load" @click="loadLyrics">
          加载歌词
        </button>
        <button v-if="showLyrics && lyricsData" class="btn-reload" @click="reloadLyrics">
          重新加载
        </button>
      </div>
    </div>

    <div v-if="showLyrics" class="lyrics-content">
      <div v-if="loading" class="lyrics-loading">加载中...</div>
      <div v-else-if="error" class="lyrics-error">
        <p>{{ error }}</p>
        <button class="btn-manual-load" @click="loadLyricsManually">手动选择歌词文件</button>
      </div>
      <div v-else-if="!lyricsData || lyricsData.lines.length === 0" class="lyrics-empty">
        <p>暂无歌词</p>
        <button class="btn-manual-load" @click="loadLyricsManually">手动加载歌词</button>
      </div>
      <div v-else class="lyrics-list" ref="lyricsListRef">
        <div
          v-for="(line, index) in lyricsData.lines"
          :key="index"
          class="lyrics-line"
          :class="{ active: currentLyricIndex === index }"
          :ref="(el) => setLineRef(el, index)"
        >
          {{ line.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { LyricsData } from '@shared/types/lyrics'

const playerStore = usePlayerStore()
const showLyrics = ref(false)
const lyricsData = ref<LyricsData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const lyricsListRef = ref<HTMLElement | null>(null)
const lineRefs = ref<Map<number, HTMLElement>>(new Map())

const currentMusic = computed(() => playerStore.currentMusic)
const currentTime = computed(() => playerStore.currentTime)

const currentLyricIndex = computed(() => {
  if (!lyricsData.value || lyricsData.value.lines.length === 0) {
    return -1
  }

  for (let i = lyricsData.value.lines.length - 1; i >= 0; i--) {
    if (lyricsData.value.lines[i].time <= currentTime.value) {
      return i
    }
  }

  return -1
})

// 监听当前音乐变化，自动加载歌词
watch(currentMusic, async (newMusic) => {
  if (newMusic && showLyrics.value) {
    await loadLyrics()
  } else {
    lyricsData.value = null
    error.value = null
  }
})

// 监听当前时间，自动滚动到当前歌词
watch(currentLyricIndex, async (newIndex) => {
  if (newIndex >= 0 && showLyrics.value && lyricsListRef.value) {
    await scrollToCurrentLyric(newIndex)
  }
})

const setLineRef = (el: any, index: number) => {
  if (el) {
    lineRefs.value.set(index, el)
  }
}

const toggleLyrics = () => {
  showLyrics.value = !showLyrics.value
  if (showLyrics.value && currentMusic.value && !lyricsData.value) {
    loadLyrics()
  }
}

const loadLyrics = async () => {
  if (!currentMusic.value) {
    error.value = '当前没有播放的音乐'
    return
  }

  loading.value = true
  error.value = null

  try {
    const lyrics = await window.electronAPI.loadLyrics(currentMusic.value.id)
    if (lyrics) {
      lyricsData.value = lyrics
    } else {
      error.value = '未找到歌词文件'
    }
  } catch (err: any) {
    console.error('加载歌词失败:', err)
    error.value = err.message || '加载歌词失败'
  } finally {
    loading.value = false
  }
}

const reloadLyrics = async () => {
  lyricsData.value = null
  await loadLyrics()
}

const loadLyricsManually = async () => {
  if (!currentMusic.value) return

  try {
    const filePath = await window.electronAPI.selectMusicFile()
    if (!filePath) return

    loading.value = true
    error.value = null

    const lyrics = await window.electronAPI.parseLyricsFile(filePath)
    if (lyrics) {
      lyricsData.value = lyrics
      // 保存歌词路径到数据库
      await window.electronAPI.updateMusicLyricsPath(currentMusic.value.id, filePath)
    }
  } catch (err: any) {
    console.error('手动加载歌词失败:', err)
    error.value = err.message || '加载歌词失败'
  } finally {
    loading.value = false
  }
}

const scrollToCurrentLyric = async (index: number) => {
  await nextTick()
  const lineElement = lineRefs.value.get(index)
  if (lineElement && lyricsListRef.value) {
    const container = lyricsListRef.value
    const lineTop = lineElement.offsetTop
    const lineHeight = lineElement.offsetHeight
    const containerHeight = container.clientHeight
    const scrollTop = container.scrollTop

    // 如果当前歌词不在可视区域内，滚动到中心位置
    if (lineTop < scrollTop || lineTop + lineHeight > scrollTop + containerHeight) {
      container.scrollTo({
        top: lineTop - containerHeight / 2 + lineHeight / 2,
        behavior: 'smooth'
      })
    }
  }
}

onMounted(async () => {
  // 检查设置中是否默认显示歌词
  const settings = await window.electronAPI.getSettings()
  if (settings?.showLyrics) {
    showLyrics.value = true
    if (currentMusic.value) {
      await loadLyrics()
    }
  }
})
</script>

<style scoped>
.lyrics-view {
  border-top: 1px solid #e0e0e0;
  background: var(--bg-color);
  transition: max-height 0.3s ease;
  max-height: 0;
  overflow: hidden;
}

.lyrics-view.show-lyrics {
  max-height: 400px;
}

.lyrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.lyrics-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-color);
}

.lyrics-controls {
  display: flex;
  gap: 8px;
}

.btn-toggle,
.btn-load,
.btn-reload,
.btn-manual-load {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  color: #333;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.btn-toggle:hover,
.btn-load:hover,
.btn-reload:hover,
.btn-manual-load:hover {
  background: #f5f5f5;
  border-color: #ff4757;
}

.lyrics-content {
  height: 300px;
  overflow-y: auto;
  padding: 20px;
}

.lyrics-loading,
.lyrics-error,
.lyrics-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  text-align: center;
}

.lyrics-error p,
.lyrics-empty p {
  margin-bottom: 12px;
}

.lyrics-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lyrics-line {
  padding: 8px 12px;
  text-align: center;
  font-size: 14px;
  color: #666;
  transition: all 0.3s ease;
  opacity: 0.6;
  line-height: 1.6;
}

.lyrics-line.active {
  color: #ff4757;
  font-size: 16px;
  font-weight: 600;
  opacity: 1;
  transform: scale(1.05);
}

.lyrics-content::-webkit-scrollbar {
  width: 6px;
}

.lyrics-content::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.lyrics-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.lyrics-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
