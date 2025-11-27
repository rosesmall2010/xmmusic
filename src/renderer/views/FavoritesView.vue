<template>
  <div class="favorites-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">我喜欢的音乐</h1>
        <div class="stats">{{ totalCount }} 首歌曲</div>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="clearList" :disabled="totalCount === 0">
          清空列表
        </button>
        <button class="btn-primary" @click="playAll" :disabled="totalCount === 0">
          播放全部
        </button>
      </div>
    </div>

    <div class="content">
      <div v-if="loading && songs.length === 0" class="loading-container">
        <div class="loading-spinner"></div>
        <p>加载中...</p>
      </div>
      <SongList
        v-else
        :songs="songs"
        @play="playMusic"
        @songs-updated="reloadFavorites"
        @load-more="loadMore"
      >
        <template #empty>
          <div class="empty-placeholder">
            <Heart :size="48" class="icon" />
            <p>还没有收藏任何歌曲</p>
            <p class="sub-text">在播放时点击爱心图标即可收藏</p>
          </div>
        </template>
      </SongList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, shallowRef, triggerRef } from 'vue'
import { Heart } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import type { MusicItem } from '@shared/types/music'

const playerStore = usePlayerStore()
const { play } = usePlayer()
const songs = shallowRef<MusicItem[]>([]) // 使用 shallowRef 优化性能
const totalCount = ref(0)
const loading = ref(false)
const PAGE_SIZE = 50 // 每页加载50条

let currentOffset = 0
let hasMore = true

onMounted(async () => {
  await loadFavorites()

  //监听收藏更新事件
  window.addEventListener('favorites-updated', reloadFavorites)
  // 监听元数据更新事件，只更新被修改的歌曲
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
})

onUnmounted(() => {
  // 清理事件监听
  window.removeEventListener('favorites-updated', reloadFavorites)
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
})

const loadFavorites = async () => {
  if (loading.value || !hasMore) return

  loading.value = true
  try {
    // 获取总数
    if (currentOffset === 0) {
      totalCount.value = await window.electronAPI.getFavoritesCount()
    }

    // 分页加载
    const newSongs = await window.electronAPI.getFavoritesPaginated(currentOffset, PAGE_SIZE)

    if (newSongs.length < PAGE_SIZE) {
      hasMore = false
    }

    // 追加到列表
    songs.value = [...songs.value, ...newSongs]
    triggerRef(songs)
    currentOffset += newSongs.length
  } finally {
    loading.value = false
  }
}

const reloadFavorites = async () => {
  // 重新加载：重置状态
  songs.value = []
  currentOffset = 0
  hasMore = true
  await loadFavorites()
}

const loadMore = () => {
  loadFavorites()
}

// 监听元数据更新事件，只更新被修改的歌曲
const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail
  if (!updatedMusic) return

  // 在当前列表中查找并更新这首歌
  const index = songs.value.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    // 直接更新列表中的这首歌
    songs.value[index] = { ...songs.value[index], ...updatedMusic }
    triggerRef(songs)
  }
}

const playMusic = async (music: MusicItem) => {
  const newQueue = [...songs.value]
  playerStore.queue = newQueue
  const index = newQueue.findIndex(m => m.id === music.id)
  playerStore.setCurrentQueueIndex(index)
  await play(music)
}

const playAll = async () => {
  if (totalCount.value === 0) return

  // 如果还有未加载的歌曲，先全部加载
  if (hasMore) {
    loading.value = true
    try {
      const allSongs = await window.electronAPI.getFavorites() // 使用旧接口一次性加载全部
      playerStore.queue = allSongs
      playerStore.setCurrentQueueIndex(0)
      await play(allSongs[0])
    } finally {
      loading.value = false
    }
  } else {
    playerStore.queue = [...songs.value]
    playerStore.setCurrentQueueIndex(0)
    await play(songs.value[0])
  }
}

const clearList = async () => {
  if (totalCount.value === 0) return

  if (!confirm(`确定要清空我喜欢列表吗？这将删除 ${totalCount.value} 首歌曲。`)) {
    return
  }

  try {
    await window.electronAPI.clearFavorites()
    // 重新加载
    await reloadFavorites()
    window.dispatchEvent(new Event('favorites-updated'))
  } catch (error) {
    console.error('清空列表失败:', error)
  }
}
</script>

<style scoped>
.favorites-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
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

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.content {
  flex: 1;
  overflow: hidden;
}

.empty-placeholder {
  text-align: center;
  color: var(--text-tertiary);
}

.empty-placeholder .icon {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
  display: block;
  color: var(--text-quaternary);
}

.sub-text {
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  color: var(--text-secondary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--spacing-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
