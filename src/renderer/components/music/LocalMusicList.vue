<template>
  <div class="local-music-list">
    <div class="list-header">
      <div>
        <h1 class="page-title">本地音乐</h1>
        <div class="stats">{{ totalCount }} 首歌曲</div>
      </div>
      <div class="header-actions">
        <button class="btn-primary" @click="handleScan">
          扫描音乐
        </button>
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
import { computed, onMounted } from 'vue'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import type { MusicItem } from '@shared/types/music'

const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const musicList = computed(() => musicStore.musicList)
const totalCount = computed(() => musicStore.totalCount)

onMounted(async () => {
  // Initial load of 20 items
  await musicStore.loadMusic(0, 20)

  // Start background loading
  startBackgroundLoading()
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

const loadMore = async () => {
  // This is now handled by background loading, but we keep it for manual trigger if needed
  if (!musicStore.loading && musicStore.hasMore) {
    await musicStore.loadMusic(musicStore.currentOffset, 20)
  }
}

const handleScan = async () => {
  const folders = await window.electronAPI.selectMusicFolder()
  if (folders.length === 0) return

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
  }
}

const handleSongsUpdated = async () => {
  // 重新加载音乐列表
  await musicStore.loadMusic(0, musicStore.musicList.length || 20, true)
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
</style>
