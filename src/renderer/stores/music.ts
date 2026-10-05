import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { MusicItem, Playlist, AdvancedSearchCriteria, LocalMusicCursor } from '@shared/types/music'

export const useMusicStore = defineStore('music', () => {
  // State
  const musicList = shallowRef<MusicItem[]>([])
  const totalCount = ref(0)
  const currentOffset = ref(0)
  /** 默认续载批大小；首屏由调用方显式传 100 */
  const pageSize = ref(50)
  const loading = ref(false)
  /** 游标分页：下一页起点；null 表示没有更多 */
  const listCursor = ref<LocalMusicCursor | null>(null)
  const searchQuery = ref('')
  const searchResults = ref<MusicItem[]>([])
  const currentView = ref<'local' | 'recent' | 'playlist' | 'favorites' | 'queue' | 'playlist-detail' | 'settings' | 'statistics' | 'recommendations'>('local')
  const playlists = ref<Playlist[]>([])
  const selectedPlaylistId = ref<number | null>(null)
  const advancedResults = ref<MusicItem[]>([])
  const advancedCriteria = ref<AdvancedSearchCriteria | null>(null)
  const advancedLoading = ref(false)
  /** 播放栏「定位当前」：待滚动的列表下标；null 表示无待处理 */
  const pendingLocateIndex = ref<number | null>(null)
  /** 递增以通知 LocalMusicList 执行定位（已在本地页时） */
  const locateRequestSeq = ref(0)
  /** 定位进行中（加载列表 + 滚动），防止重复点击 */
  const locatingCurrent = ref(false)
  /** 预查缓存：当前曲在本地列表中的下标 */
  const cachedLocateMusicId = ref<number | null>(null)
  const cachedLocateIndex = ref<number | null>(null)
  let locateCacheEpoch = 0
  /** 列表加载世代：清空/强制重置时递增，丢弃进行中的过期分页结果 */
  let loadEpoch = 0

  // Getters：有下一页游标且已加载数未到总数（后台加载期间总数不变，只首屏查一次）
  const hasMore = computed(() => {
    return listCursor.value != null && currentOffset.value < totalCount.value
  })
  const isAdvancedMode = computed(() => !!advancedCriteria.value)
  const currentInLocalList = computed(
    () => cachedLocateMusicId.value != null && cachedLocateIndex.value != null && cachedLocateIndex.value >= 0
  )

  /** 立即清空本地列表状态（供「清除所有」等），并作废进行中的 loadMusic */
  function resetLocalList() {
    loadEpoch += 1
    musicList.value = []
    totalCount.value = 0
    currentOffset.value = 0
    listCursor.value = null
    loading.value = false
  }

  /**
   * 加载本地列表。
   * offset === 0：从第一页重拉（游标置空），并查一次总数。
   * offset !== 0：按 listCursor 追加下一页，不再查总数、不用 OFFSET。
   */
  async function loadMusic(offset: number = 0, limit: number = pageSize.value, force: boolean = false) {
    const isReset = offset === 0
    if (!force && isReset && musicList.value.length > 0) {
      return
    }

    const epoch = force && isReset ? (loadEpoch += 1) : loadEpoch
    // 重拉开始立刻作废旧游标，避免进行中的追加接到新列表后面
    const appendFrom = isReset ? null : listCursor.value
    if (isReset) {
      listCursor.value = null
    } else if (!appendFrom) {
      return
    }

    loading.value = true
    try {
      const page = await window.electronAPI.getLocalMusicPage(appendFrom, limit)
      if (epoch !== loadEpoch) return
      // 追加必须仍接在「发起时的那一页」后面；首屏重拉会改游标，对不上则丢弃
      if (!isReset && listCursor.value !== appendFrom) return

      if (isReset) {
        musicList.value = page.items
        currentOffset.value = page.items.length
        listCursor.value = page.nextCursor
        const count = await window.electronAPI.getMusicTotalCount()
        if (epoch !== loadEpoch) return
        totalCount.value = count
      } else {
        if (page.items.length === 0) {
          listCursor.value = null
          return
        }
        musicList.value.push(...page.items)
        triggerRef(musicList)
        currentOffset.value = musicList.value.length
        listCursor.value = page.nextCursor
      }
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

  /** 查询当前播放曲在本地列表中的下标；不在库中返回 null */
  async function resolveLocalMusicIndex(musicId: number): Promise<number | null> {
    const index = await window.electronAPI.getLocalMusicIndex(musicId)
    if (index == null || index < 0) return null
    return index
  }

  /**
   * 预查当前曲是否在本地库。
   * reset=true：切歌时先清空缓存（按钮立刻禁用），避免沿用上一首状态。
   */
  async function refreshLocateCache(musicId: number | undefined, reset = true) {
    locateCacheEpoch += 1
    const epoch = locateCacheEpoch
    cachedLocateMusicId.value = musicId ?? null
    if (reset || !musicId) {
      cachedLocateIndex.value = null
    }
    if (!musicId) return

    const index = await resolveLocalMusicIndex(musicId)
    if (epoch !== locateCacheEpoch) return
    cachedLocateIndex.value = index
  }

  /** 播放栏触发：使用预查缓存下标，避免点击时再查一次 */
  function requestLocateCurrent(musicId: number): boolean {
    if (locatingCurrent.value) return false
    if (cachedLocateMusicId.value !== musicId || cachedLocateIndex.value == null) return false

    locatingCurrent.value = true
    pendingLocateIndex.value = cachedLocateIndex.value
    locateRequestSeq.value += 1
    return true
  }

  function clearPendingLocate() {
    pendingLocateIndex.value = null
  }

  /** 定位流程结束（加载 + 滚动完成后由列表页调用） */
  function finishLocateCurrent() {
    locatingCurrent.value = false
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
    currentInLocalList,
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
    currentOffset,
    pendingLocateIndex,
    locateRequestSeq,
    locatingCurrent,
    resolveLocalMusicIndex,
    refreshLocateCache,
    requestLocateCurrent,
    clearPendingLocate,
    finishLocateCurrent
  }
})
