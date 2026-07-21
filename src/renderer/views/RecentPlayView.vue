<template>
  <div class="recent-play-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ $t('recent.title') }}</h1>
        <div class="stats">{{ $t('recent.songs', { count: songs.length }) }}</div>
      </div>
      <div class="header-actions">
        <button class="btn-primary" @click="playAll" :disabled="songs.length === 0">
          {{ $t('player.playAll') }}
        </button>
      </div>
    </div>

    <div class="content">
      <SongList :songs="songs" @play="playMusic" @songs-updated="loadRecent">
        <template #empty>
          <div class="empty-placeholder">
            <Clock :size="48" class="icon" />
            <p>{{ $t('recent.empty') }}</p>
            <p class="sub-text">{{ $t('recent.playHint') }}</p>
          </div>
        </template>
      </SongList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Clock } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import type { MusicItem } from '@shared/types/music'

const playerStore = usePlayerStore()
const { play } = usePlayer()
const songs = ref<MusicItem[]>([])

onMounted(async () => {
  await loadRecent()
  // 监听元数据更新事件，只更新被修改的歌曲
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  // 播放记录更新后刷新列表（同曲置顶、去重后的顺序）
  window.addEventListener('recent-plays-updated', loadRecent)
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.removeEventListener('recent-plays-updated', loadRecent)
})

const loadRecent = async () => {
  songs.value = await window.electronAPI.getRecentPlays()
}

// 监听元数据更新事件，只更新被修改的歌曲
const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail
  if (!updatedMusic || !updatedMusic.id) return

  // 在当前列表中查找并更新这首歌
  const index = songs.value.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    // 重新赋值整个数组以触发响应式更新
    const updatedList = [...songs.value]
    updatedList[index] = { ...updatedList[index], ...updatedMusic }
    songs.value = updatedList
  }
}

const playMusic = async (music: MusicItem) => {
  // 检查歌曲是否已在队列中
  const existingIndex = playerStore.queue.findIndex(m => m.id === music.id)

  if (existingIndex >= 0) {
    // 如果已在队列中，直接切换到该歌曲并播放
    playerStore.setCurrentQueueIndex(existingIndex)
    await play(music)
  } else {
    // 如果不在队列中，只添加这一首歌曲到队列并播放
    playerStore.addToQueue(music)
    const newIndex = playerStore.queue.length - 1
    playerStore.setCurrentQueueIndex(newIndex)
  await play(music)
  }
}

const playAll = async () => {
  if (songs.value.length === 0) return
  playerStore.queue = [...songs.value]
  playerStore.setCurrentQueueIndex(0)
  await play(songs.value[0])
}
</script>

<style scoped>
.recent-play-view {
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
</style>
