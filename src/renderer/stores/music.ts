import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MusicItem, Playlist } from '@shared/types/music'

export const useMusicStore = defineStore('music', () => {
  // State
  const musicList = ref<MusicItem[]>([])
  const totalCount = ref(0)
  const currentOffset = ref(0)
  const pageSize = ref(50)
  const loading = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<MusicItem[]>([])
  const currentView = ref<'local' | 'recent' | 'playlist' | 'favorites' | 'queue' | 'playlist-detail' | 'settings'>('local')
  const playlists = ref<Playlist[]>([])
  const selectedPlaylistId = ref<number | null>(null)

  // Getters
  const hasMore = computed(() => {
    return currentOffset.value < totalCount.value
  })

  // Actions
  async function loadMusic(offset: number = 0, limit: number = pageSize.value) {
    loading.value = true
    try {
      const items = await window.electronAPI.getMusicList(offset, limit)
      if (offset === 0) {
        musicList.value = items
      } else {
        musicList.value.push(...items)
      }
      currentOffset.value = offset + items.length
      totalCount.value = await window.electronAPI.getMusicTotalCount()
    } finally {
      loading.value = false
    }
  }

  async function searchMusic(query: string) {
    searchQuery.value = query
    if (!query.trim()) {
      searchResults.value = []
      return
    }
    searchResults.value = await window.electronAPI.searchMusic(query)
  }

  async function toggleFavorite(id: number) {
    await window.electronAPI.toggleFavorite(id)
    // 更新本地状态
    const item = musicList.value.find(m => m.id === id)
    if (item) {
      item.favorite = !item.favorite
    }
  }

  function setCurrentView(view: typeof currentView.value) {
    currentView.value = view
  }

  async function loadPlaylists() {
    playlists.value = await window.electronAPI.getPlaylists()
  }

  function selectPlaylist(id: number) {
    selectedPlaylistId.value = id
    currentView.value = 'playlist-detail'
  }

  return {
    musicList,
    totalCount,
    loading,
    searchQuery,
    searchResults,
    currentView,
    playlists,
    selectedPlaylistId,
    hasMore,
    loadMusic,
    searchMusic,
    toggleFavorite,
    setCurrentView,
    loadPlaylists,
    selectPlaylist
  }
})
