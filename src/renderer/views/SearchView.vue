<template>
  <div class="search-view">
    <div class="page-header">
      <h1 class="page-title">搜索结果: "{{ query }}"</h1>
      <p class="result-count">找到 {{ searchResults.length }} 首歌曲</p>
    </div>

    <div class="content">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在搜索...</p>
      </div>

      <SongList
        v-else-if="searchResults.length > 0"
        :songs="searchResults"
        @play="handlePlay"
      />

      <div v-else class="empty-state">
        <div class="empty-icon">
          <Search :size="64" />
        </div>
        <p>未找到相关歌曲</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import { Search } from 'lucide-vue-next'
import type { MusicItem } from '@shared/types/music'

const route = useRoute()
const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const loading = ref(false)
const query = computed(() => route.query.q as string || '')
const searchResults = computed(() => musicStore.searchResults)

const performSearch = async () => {
  if (!query.value) return

  loading.value = true
  try {
    await musicStore.searchMusic(query.value)
  } finally {
    loading.value = false
  }
}

const handlePlay = async (music: MusicItem) => {
  // Add search results to queue and play
  // We might want to replace queue or just add this song
  // For now, let's just play this song
  await play(music)
}

watch(query, performSearch, { immediate: true })
</script>

<style scoped>
.search-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xl);
}

.page-header {
  margin-bottom: var(--spacing-lg);
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.result-count {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: var(--spacing-md);
  opacity: 0.5;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid var(--bg-tertiary);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--spacing-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
