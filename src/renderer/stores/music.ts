import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { MusicItem, Playlist, AdvancedSearchCriteria, LocalMusicCursor } from '@shared/types/music'

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
  /** 游标分页的续接位置；null 表示无法/无需续接 */
  const listCursor = ref<LocalMusicCursor | null>(null)
  /** 游标已到末页 */
  const reachedEnd = ref(false)

  // Getters
  /**
   * 还能继续追加吗
   *
   * 由游标判定，不再用 currentOffset < totalCount：totalCount 只在首屏查一次，
   * 扫描期间库增长会让它偏小，导致后台预载提前停住、列表残缺。
   */
  const hasMore = computed(() => !reachedEnd.value && listCursor.value != null)
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
    loading.value = false
    listCursor.value = null
    reachedEnd.value = false
  }

  // Actions
  /**
   * 加载列表首屏
   *
   * 走游标 API 以便顺带拿到 nextCursor；OFFSET 0 不产生遍历开销，与原实现同样快。
   * offset 参数仅为兼容既有调用点保留 —— 全部调用方都传 0，顺序追加请用 loadMore()。
   */
  async function loadMusic(offset: number = 0, limit: number = pageSize.value, force: boolean = false) {
    // If not forcing refresh and we already have data (and asking for first page), skip
    if (!force && offset === 0 && musicList.value.length > 0) {
      return
    }

    const epoch = force && offset === 0 ? (loadEpoch += 1) : loadEpoch

    loading.value = true
    try {
      const page = await window.electronAPI.getLocalMusicPage(null, limit)
      if (epoch !== loadEpoch) return
      musicList.value = page.items
      currentOffset.value = page.items.length
      listCursor.value = page.nextCursor
      reachedEnd.value = page.nextCursor == null

      const count = await window.electronAPI.getMusicTotalCount()
      if (epoch !== loadEpoch) return
      totalCount.value = count
    } finally {
      if (epoch === loadEpoch) {
        loading.value = false
      }
    }
  }

  /**
   * 顺序追加下一页（游标 / keyset 分页）
   *
   * 不要用 loadMusic(currentOffset, n) 做追加：OFFSET 分页在大库下是 O(n²)，
   * 实测 5.1 万条整库预载纯 SQL 要 75 秒，游标版 0.3 秒。
   * 总数只在首屏取一次，这里不再每批重复查询（原先每批都发一次 IPC）。
   *
   * 返回值只表示「本次是否真的追加了数据」。调用方要判断能否继续，请看 hasMore：
   * 返回 false 可能只是当前有别的加载在跑，并不代表已到底。
   */
  async function loadMore(limit: number = pageSize.value): Promise<boolean> {
    if (loading.value || reachedEnd.value || !listCursor.value) return false
    const epoch = loadEpoch
    loading.value = true
    try {
      const page = await window.electronAPI.getLocalMusicPage(listCursor.value, limit)
      if (epoch !== loadEpoch) return false

      if (page.items.length > 0) {
        musicList.value.push(...page.items)
        triggerRef(musicList)
        currentOffset.value = musicList.value.length
      }
      listCursor.value = page.nextCursor
      // 游标到底即为真·到底
      reachedEnd.value = page.nextCursor == null
      return page.items.length > 0
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
    loadMore,
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
