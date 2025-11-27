<template>
  <div class="local-music-list">
    <div class="list-header">
      <div>
        <h1 class="page-title">本地音乐</h1>
        <div class="stats">{{ totalCount }} 首歌曲</div>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="handleClearAll" :disabled="totalCount === 0">
          清除所有
        </button>
        <button class="btn-primary" @click="handlePlayAll" :disabled="totalCount === 0">
          播放全部
        </button>
        <button class="btn-primary" @click="handleScan" :disabled="isScanning">
          {{ isScanning ? '扫描中...' : '扫描音乐' }}
        </button>
      </div>
    </div>

    <!-- 扫描进度条 -->
    <div v-if="isScanning && scanProgress" class="scan-progress-bar">
      <div class="progress-info">
        <span class="current-file" :title="scanProgress.currentFile">正在扫描: {{ scanProgress.currentFile }}</span>
        <span class="progress-stats">{{ scanProgress.current }} / {{ scanProgress.total }} ({{ scanProgress.percentage.toFixed(1) }}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${scanProgress.percentage}%` }"></div>
      </div>
    </div>

    <div class="music-list-container">
      <SongList :songs="musicList" @play="playMusic" @load-more="loadMore" @songs-updated="handleSongsUpdated">
        <template #empty>
          <p>暂无音乐</p>
          <button class="btn-link" @click="handleScan">扫描音乐文件夹</button>
        </template>
      </SongList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import type { MusicItem, ScanProgress } from '@shared/types/music'

const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const musicList = computed(() => musicStore.musicList)
const totalCount = computed(() => musicStore.totalCount)

// 扫描状态
const isScanning = ref(false)
const scanProgress = ref<ScanProgress | null>(null)

onMounted(async () => {
  // Initial load of 20 items
  await musicStore.loadMusic(0, 20)

  // Start background loading
  startBackgroundLoading()

  // 监听元数据更新事件
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)

  // 监听扫描进度
  window.electronAPI.onScanProgress((progress) => {
    isScanning.value = true
    scanProgress.value = progress
  })

  // 监听扫描状态变化
  window.electronAPI.onScanStateChanged((state) => {
    isScanning.value = state.isScanning
    if (!state.isScanning) {
      scanProgress.value = null
      // 扫描结束后刷新列表
      musicStore.loadMusic(0, 20, true)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.electronAPI.removeScanProgress()
  window.electronAPI.removeScanStateChanged()
})

const startBackgroundLoading = async () => {
  // Check if there are more items to load
  if (musicStore.hasMore) {
    // Use requestIdleCallback or setTimeout to avoid blocking main thread
    setTimeout(async () => {
      if (musicStore.hasMore && !musicStore.loading) {
        await musicStore.loadMusic(musicStore.currentOffset, 20)
        // Continue loading next batch
        startBackgroundLoading()
      }
    }, 100) // Small delay between batches
  }
}

// 监听后端事件
onMounted(() => {
  // 监听单曲更新
  window.electronAPI.on('music-updated', async (_event: any, filePath: string) => {
    // 重新加载当前视图的数据
    // 简单起见，我们刷新整个列表，或者尝试只更新特定项
    // 由于我们使用了分页和虚拟滚动，精确定位比较麻烦，这里先尝试重新加载第一页并后台加载
    // 但为了不打断用户浏览，最好是只更新内存中的数据

    // 查找并更新 store 中的数据
    const index = musicStore.musicList.findIndex(m => m.filePath === filePath)
    if (index !== -1) {
      // 获取最新数据（可以通过重新加载或后端传递）
      // 这里简单触发重新加载，或者如果能获取到 ID，就只更新那个 ID
      // 暂时重新加载列表
      await musicStore.loadMusic(0, 20, true)
      startBackgroundLoading()
    }
  })

  // 监听列表刷新
  window.electronAPI.on('music-list-refresh', async () => {
    await musicStore.loadMusic(0, 20, true)
    startBackgroundLoading()
  })

  // 监听扫描进度
  window.electronAPI.onScanProgress((progress) => {
    scanProgress.value = progress
  })

  window.electronAPI.onScanStateChanged((state: any) => {
    // state 可能是对象或字符串，根据实际情况处理
    const status = typeof state === 'string' ? state : state?.status
    isScanning.value = status === 'scanning'
    if (!isScanning.value) {
      scanProgress.value = null
    }
  })
})

onUnmounted(() => {
  window.electronAPI.removeAllListeners('music-updated')
  window.electronAPI.removeAllListeners('music-list-refresh')
  window.electronAPI.removeAllListeners('scan-progress')
  window.electronAPI.removeAllListeners('scan-state-changed')
})

const loadMore = async () => {
  // This is now handled by background loading, but we keep it for manual trigger if needed
  if (!musicStore.loading && musicStore.hasMore) {
    await musicStore.loadMusic(musicStore.currentOffset, 20)
  }
}

const handleScan = async () => {
  const folders = await window.electronAPI.selectMusicFolder()
  if (folders.length === 0) return

  isScanning.value = true
  try {
    for (const folder of folders) {
      await window.electronAPI.scanMusicFolder(folder)
    }
    await musicStore.loadMusic(0, 20, true) // Force refresh initial batch
    startBackgroundLoading() // Restart background loading
  } catch (error: any) {
    if (error.message !== '扫描已取消') {
      alert(`扫描失败: ${error.message}`)
    }
  } finally {
    isScanning.value = false
    scanProgress.value = null
  }
}

const handleClearAll = async () => {
  if (!confirm('确定要清除所有本地音乐吗？\n\n这将清空本地音乐列表。\n不会影响收藏夹、歌单和播放历史。\n\n此操作不可恢复！')) {
    return
  }

  try {
    await window.electronAPI.clearLocalMusic()
    // 刷新列表
    await musicStore.loadMusic(0, 20, true)
  } catch (error: any) {
    alert(`清除失败: ${error.message}`)
  }
}

const handlePlayAll = async () => {
  if (totalCount.value === 0) return

  try {
    // 获取所有歌曲
    const allSongs = await window.electronAPI.getMusicList(0, totalCount.value)
    playerStore.queue = allSongs
    playerStore.setCurrentQueueIndex(0)
    await play(allSongs[0])
  } catch (error) {
    console.error('播放全部失败:', error)
  }
}

const handleSongsUpdated = () => {
  // 这个是从 SongList 发出的事件，只需要触发数据更新
  // 实际的更新由 music-metadata-updated 事件处理
}

// 监听元数据更新事件，只更新被修改的歌曲
const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail
  if (!updatedMusic) return

  // 在当前列表中查找并更新这首歌
  const index = musicStore.musicList.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    // 直接更新列表中的这首歌
    musicStore.musicList[index] = { ...musicStore.musicList[index], ...updatedMusic }
  }
}

const playMusic = async (music: MusicItem) => {
  // 如果播放列表不同，替换播放列表
  // 这里简化处理：如果当前队列不包含该歌曲，或者我们想把整个列表作为上下文
  // 简单起见，我们把当前列表作为播放队列

  // 检查是否需要更新队列（例如当前队列不是本地音乐列表）
  // 这里我们简单地把点击的歌曲加入队列并播放，或者替换整个队列
  // 为了体验更好，通常是替换整个队列为当前列表，并从点击的歌曲开始播放

  const newQueue = [...musicList.value]
  playerStore.queue = newQueue
  const index = newQueue.findIndex(m => m.id === music.id)
  playerStore.setCurrentQueueIndex(index)
  await play(music)
}
</script>

<style scoped>
.local-music-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.stats {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.btn-primary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-primary:hover {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  background: var(--color-primary-light);
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: transparent;
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  text-decoration: underline;
  margin-top: var(--spacing-sm);
}

.music-list-container {
  flex: 1;
  overflow: hidden;
}

/* 扫描进度条样式 */
.scan-progress-bar {
  padding: var(--spacing-md) var(--spacing-xl);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.current-file {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}

.progress-track {
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.2s ease;
}
</style>
