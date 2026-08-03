import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { MusicItem, Playlist, AdvancedSearchCriteria } from '@shared/types/music'

export const useMusicStore = defineStore('music', () => {
  // State
  const musicList = shallowRef<MusicItem[]>([])
  const totalCount = ref(0)
  const currentOffset = ref(0)
  const pageSize = ref(50)
  const loading = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<MusicItem[]>([])
  const currentView = ref<'local' | 'recent' | 'playlist' | 'favorites' | 'queue' | 'playlist-detail' | 'settings' | 'statistics' | 'recommendations'>('local')
  const playlists = ref<Playlist[]>([])
  const selectedPlaylistId = ref<number | null>(null)
  const advancedResults = ref<MusicItem[]>([])
  const advancedCriteria = ref<AdvancedSearchCriteria | null>(null)
  const advancedLoading = ref(false)
  /** 列表加载世代：清空/强制重置时递增，丢弃进行中的过期分页结果 */
  let loadEpoch = 0

  // Getters
  const hasMore = computed(() => {
    return currentOffset.value < totalCount.value
  })
  const isAdvancedMode = computed(() => !!advancedCriteria.value)

  /** 立即清空本地列表状态（供「清除所有」等），并作废进行中的 loadMusic */
  function resetLocalList() {
    loadEpoch += 1
    musicList.value = []
    totalCount.value = 0
    currentOffset.value = 0
    loading.value = false
  }

  // Actions
  async function loadMusic(offset: number = 0, limit: number = pageSize.value, force: boolean = false) {
    // If not forcing refresh and we already have data (and asking for first page), skip
    if (!force && offset === 0 && musicList.value.length > 0) {
      return
    }

    const epoch = force && offset === 0 ? (loadEpoch += 1) : loadEpoch

    loading.value = true
    try {
      const items = await window.electronAPI.getMusicList(offset, limit)
      if (epoch !== loadEpoch) return

      if (offset === 0) {
        musicList.value = items
      } else {
        // For shallowRef, we need to reassign or triggerRef.
        // Reassigning is safer for immutability but pushing + triggerRef is more efficient for large arrays.
        // Let's use push + triggerRef to avoid copying huge arrays.
        musicList.value.push(...items)
        triggerRef(musicList)
      }
      currentOffset.value = offset + items.length
      const count = await window.electronAPI.getMusicTotalCount()
      if (epoch !== loadEpoch) return
      totalCount.value = count
    } finally {
      if (epoch === loadEpoch) {
        loading.value = false
      }
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

  async function runAdvancedSearch(criteria: AdvancedSearchCriteria) {
    advancedLoading.value = true
    try {
      const cleaned: AdvancedSearchCriteria = { ...criteria }
      // 移除空字符串
      Object.keys(cleaned).forEach(key => {
        const value = (cleaned as any)[key]
        if (value === '' || value === null) {
          delete (cleaned as any)[key]
        }
      })
      const results = await window.electronAPI.advancedSearch(cleaned)
      advancedResults.value = results
      advancedCriteria.value = cleaned
    } finally {
      advancedLoading.value = false
    }
  }

  function clearAdvancedSearch() {
    advancedResults.value = []
    advancedCriteria.value = null
  }

  /** 清空搜索相关内存缓存（清除库后调用，避免搜索页仍显示已删曲目） */
  function clearSearchCaches() {
    searchQuery.value = ''
    searchResults.value = []
    clearAdvancedSearch()
  }

  async function toggleFavorite(musicId: number) {
    const latest = await window.electronAPI.toggleFavorite(musicId)
    // 更新本地状态（musicList 为 shallowRef，需要 triggerRef）
    const item = musicList.value.find(m => m.id === musicId)
    if (item) {
      item.favorite = latest
      triggerRef(musicList) // Trigger update since we modified deep property of shallowRef
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
    advancedResults,
    advancedCriteria,
    advancedLoading,
    isAdvancedMode,
    hasMore,
    loadMusic,
    searchMusic,
    runAdvancedSearch,
    clearAdvancedSearch,
    clearSearchCaches,
    resetLocalList,
    toggleFavorite,
    setCurrentView,
    loadPlaylists,
    selectPlaylist,
    currentOffset
  }
})
