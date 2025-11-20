<template>
  <div class="music-list-view">
    <div class="toolbar">
      <div class="scan-controls">
        <button @click="handleScan" :disabled="scanStore.isScanning && !scanStore.isPaused" class="btn-scan">
          扫描音乐
        </button>
        <div v-if="scanStore.isScanning || scanStore.progress" class="scan-status">
          <span class="scan-progress">
            {{ scanStore.isPaused ? '已暂停' : '扫描中' }}:
            {{ scanStore.progress ? scanStore.progress.percentage.toFixed(1) + '%' : '0%' }}
            ({{ scanStore.progress ? scanStore.progress.current : 0 }}/{{ scanStore.progress ? scanStore.progress.total : 0 }})
          </span>
          <button
            v-if="scanStore.isScanning && !scanStore.isPaused"
            @click="pauseScan"
            class="btn-pause"
            title="暂停扫描"
          >
            ⏸
          </button>
          <button
            v-if="scanStore.isScanning && scanStore.isPaused"
            @click="resumeScan"
            class="btn-resume"
            title="继续扫描"
          >
            ▶
          </button>
          <button
            v-if="scanStore.isScanning"
            @click="cancelScan"
            class="btn-cancel"
            title="取消扫描"
          >
            ✕
          </button>
        </div>
      </div>
      <div class="toolbar-actions">
        <button @click="exportToExcel" class="btn-export">导出到 Excel</button>
        <button @click="exportFiles" class="btn-export">导出文件</button>
      </div>
    </div>
    <div class="advanced-controls">
      <button class="btn-secondary" @click="toggleAdvancedSearchPanel">
        {{ showAdvancedSearch ? '收起高级搜索' : '高级搜索' }}
      </button>
      <span v-if="musicStore.isAdvancedMode" class="advanced-status">
        已筛选 {{ musicStore.advancedResults.length }} 首
        <button class="link-button" @click="clearAdvancedSearchResults">清除筛选</button>
      </span>
      <span v-if="musicStore.advancedLoading" class="advanced-loading">搜索中...</span>
    </div>

    <div v-if="showAdvancedSearch" class="advanced-panel">
      <div class="advanced-grid">
        <label>
          <span>关键字</span>
          <input v-model="advancedForm.keyword" placeholder="标题 / 艺术家 / 专辑" />
        </label>
        <label>
          <span>艺术家</span>
          <input v-model="advancedForm.artist" placeholder="艺术家" />
        </label>
        <label>
          <span>专辑</span>
          <input v-model="advancedForm.album" placeholder="专辑" />
        </label>
        <label>
          <span>流派</span>
          <input v-model="advancedForm.genre" placeholder="流派/风格" />
        </label>
        <label>
          <span>目录前缀</span>
          <input v-model="advancedForm.directory" placeholder="/Users/xxx/Music" />
        </label>
        <label>
          <span>扩展名</span>
          <input v-model="advancedForm.fileExtension" placeholder="mp3 / flac" />
        </label>
        <label>
          <span>最短时长 (秒)</span>
          <input v-model="advancedForm.minDuration" type="number" min="0" />
        </label>
        <label>
          <span>最长时长 (秒)</span>
          <input v-model="advancedForm.maxDuration" type="number" min="0" />
        </label>
        <label>
          <span>年份 ≥</span>
          <input v-model="advancedForm.yearFrom" type="number" />
        </label>
        <label>
          <span>年份 ≤</span>
          <input v-model="advancedForm.yearTo" type="number" />
        </label>
        <label>
          <span>排序字段</span>
          <select v-model="advancedForm.sortBy">
            <option value="addedAt">添加时间</option>
            <option value="title">标题</option>
            <option value="duration">时长</option>
            <option value="playCount">播放次数</option>
          </select>
        </label>
        <label>
          <span>排序方向</span>
          <select v-model="advancedForm.sortOrder">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </label>
        <label>
          <span>最大返回</span>
          <input v-model="advancedForm.limit" type="number" min="10" max="1000" />
        </label>
        <label class="favorite-only">
          <input v-model="advancedForm.favoriteOnly" type="checkbox" />
          仅显示收藏
        </label>
      </div>
      <div class="advanced-actions">
        <button class="btn-primary" @click="runAdvancedSearch" :disabled="musicStore.advancedLoading">
          执行搜索
        </button>
        <button class="btn-secondary" @click="resetAdvancedForm">重置</button>
        <button
          v-if="musicStore.isAdvancedMode"
          class="btn-secondary"
          @click="clearAdvancedSearchResults"
        >
          退出高级搜索
        </button>
      </div>
    </div>

    <div ref="containerRef" class="virtual-list-container">
      <div class="table-header">
        <div class="col-index">#</div>
        <div class="col-title">标题</div>
        <div class="col-artist">艺术家</div>
        <div class="col-album">专辑</div>
        <div class="col-duration">时长</div>
        <div class="col-path">文件名</div>
        <div class="col-md5">MD5</div>
        <div class="col-status">状态</div>
        <div class="col-actions">操作</div>
      </div>
      <div :style="{ height: `${totalHeight}px` }" class="virtual-list-wrapper">
        <div
          :style="{
            transform: `translateY(${offsetY}px)`,
            height: `${visibleItems.length * itemHeight}px`
          }"
          class="virtual-list-content"
        >
          <div
            v-for="item in visibleItems"
            :key="item.id"
            :style="{ height: `${itemHeight}px` }"
            class="music-item"
            @click="handlePlay(item)"
            @dblclick="playAndAddToQueue(item)"
            @contextmenu.prevent="showContextMenu($event, item)"
          >
            <div class="item-index">{{ item.id }}</div>
            <div class="item-title" v-html="highlightText(item.title, getSearchQuery())"></div>
            <div class="item-artist" v-html="highlightText(item.artist, getSearchQuery())"></div>
            <div class="item-album" v-html="highlightText(item.album || '-', getSearchQuery())"></div>
            <div class="item-duration">{{ formatDuration(item.duration) }}</div>
            <div class="item-path" :title="item.filePath">{{ item.fileName }}</div>
            <div class="item-md5" :title="item.fileHash">{{ item.fileHash.substring(0, 8) }}...</div>
            <div class="item-status">
              <button
                class="status-icon favorite"
                :class="{ active: isFileFavorite(item.filePath) }"
                @click.stop="toggleFavorite(item)"
                title="收藏"
              >
                {{ isFileFavorite(item.filePath) ? '❤️' : '🤍' }}
              </button>
              <button
                class="status-icon queue"
                :class="{ active: isInQueue(item.id) }"
                @click.stop="toggleQueue(item)"
                title="播放队列"
              >
                {{ isInQueue(item.id) ? '📋' : '➕' }}
              </button>
            </div>
            <div class="item-actions">
              <button @click.stop="showMoreMenu(item)" class="btn-more">⋮</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="playNow(contextMenu.item)">
        <span class="menu-icon">▶️</span>
        <span>立即播放</span>
      </div>
      <div class="menu-item" @click="playNext(contextMenu.item)">
        <span class="menu-icon">⏭️</span>
        <span>下一首播放</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="toggleFavorite(contextMenu.item)">
        <span class="menu-icon">{{ contextMenu.item && isFileFavorite(contextMenu.item.filePath) ? '💔' : '❤️' }}</span>
        <span>{{ contextMenu.item && isFileFavorite(contextMenu.item.filePath) ? '取消收藏' : '收藏' }}</span>
      </div>
      <div class="menu-item" @click="addToPlayQueue(contextMenu.item)">
        <span class="menu-icon">📋</span>
        <span>添加到播放列表</span>
      </div>
      <div class="menu-item" @click="showAddToPlaylistDialog">
        <span class="menu-icon">🎶</span>
        <span>添加到歌单</span>
      </div>
      <div class="menu-item" @click="openSimilarDialog(contextMenu.item)">
        <span class="menu-icon">✨</span>
        <span>相似推荐</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="editMetadata(contextMenu.item)">
        <span class="menu-icon">✏️</span>
        <span>编辑元数据</span>
      </div>
      <div class="menu-item" @click="viewDetails(contextMenu.item)">
        <span class="menu-icon">ℹ️</span>
        <span>查看详情</span>
      </div>
    </div>

    <!-- 添加到歌单对话框 -->
    <div v-if="showPlaylistDialog" class="dialog-overlay" @click.self="closePlaylistDialog">
      <div class="dialog">
        <h3>添加到歌单</h3>

        <div class="playlist-list">
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="playlist-item"
            @click="addToPlaylist(playlist.id)"
          >
            <span>{{ playlist.name }}</span>
            <span class="song-count">{{ playlist.songCount }} 首</span>
          </div>

          <div v-if="playlists.length === 0" class="empty-state">
            <p>暂无歌单</p>
            <button @click="showCreateDialog" class="btn-create">创建新歌单</button>
          </div>
        </div>

        <div class="dialog-actions">
          <button @click="showCreateDialog" class="btn-primary">新建歌单</button>
          <button @click="closePlaylistDialog" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- 创建歌单对话框 -->
    <div v-if="showCreatePlaylistDialog" class="dialog-overlay" @click.self="closeCreateDialog">
      <div class="dialog">
        <h3>创建歌单</h3>

        <div class="form-group">
          <label>歌单名称 *</label>
          <input
            v-model="newPlaylistName"
            type="text"
            placeholder="输入歌单名称"
            @keyup.enter="confirmCreatePlaylist"
            autofocus
          />
        </div>

        <div class="form-group">
          <label>描述（可选）</label>
          <textarea
            v-model="newPlaylistDescription"
            placeholder="描述这个歌单"
            rows="3"
          ></textarea>
        </div>

        <div class="dialog-actions">
          <button @click="confirmCreatePlaylist" class="btn-primary" :disabled="!newPlaylistName.trim()">
            创建
          </button>
          <button @click="closeCreateDialog" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- 元数据编辑对话框 -->
    <MetadataEditDialog
      :show="metadataEditDialog.show"
      :music="metadataEditDialog.music"
      :musicIds="metadataEditDialog.musicIds"
      @close="closeMetadataEditDialog"
      @saved="handleMetadataSaved"
    />

    <!-- 相似歌曲推荐 -->
    <div v-if="similarDialog.show" class="dialog-overlay" @click.self="closeSimilarDialog">
      <div class="dialog dialog-similar">
        <h3>相似歌曲推荐</h3>
        <p v-if="similarDialog.base" class="similar-base">
          基于：{{ similarDialog.base.title }} - {{ similarDialog.base.artist }}
        </p>
        <div v-if="similarDialog.loading" class="similar-loading">正在分析...</div>
        <div v-else class="similar-list">
          <div v-if="similarDialog.songs.length === 0" class="empty-state">暂未找到相似歌曲</div>
          <div
            v-for="song in similarDialog.songs"
            :key="song.id"
            class="similar-item"
            @dblclick="playSimilarSong(song)"
          >
            <div class="info">
              <div class="title">{{ song.title }}</div>
              <div class="meta">{{ song.artist }} · {{ song.album || '未知专辑' }}</div>
            </div>
            <div class="similarity-score" v-if="song.similarity !== undefined">
              <span class="score-label">相似度</span>
              <span class="score-value">{{ Math.round(song.similarity * 100) }}%</span>
            </div>
            <div class="actions">
              <button @click.stop="queueSimilarSong(song)" title="添加到队列">➕</button>
              <button @click.stop="playSimilarSong(song)" title="播放">▶️</button>
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-secondary" @click="closeSimilarDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { useScanStore } from '@/stores/scan'
import { usePlayer } from '@/composables/usePlayer'
import MetadataEditDialog from './MetadataEditDialog.vue'
import type { MusicItem, ScanProgress, AdvancedSearchCriteria } from '@shared/types/music'

interface SimilarSong extends MusicItem {
  similarity?: number
}

interface SimilarDialogState {
  show: boolean
  loading: boolean
  songs: SimilarSong[]
  base: MusicItem | null
}

const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const scanStore = useScanStore()
const { play } = usePlayer()

const containerRef = ref<HTMLElement>()
const itemHeight = 50

const scrollTop = ref(0)
const containerHeight = ref(600)
const displayedList = computed<MusicItem[]>(() => {
  return musicStore.isAdvancedMode ? musicStore.advancedResults : musicStore.musicList
})

const visibleStart = computed(() => {
  return Math.floor(scrollTop.value / itemHeight)
})

const visibleEnd = computed(() => {
  return Math.min(
    visibleStart.value + Math.ceil(containerHeight.value / itemHeight) + 1,
    displayedList.value.length
  )
})

const visibleItems = computed(() => {
  return displayedList.value.slice(visibleStart.value, visibleEnd.value)
})

const totalHeight = computed(() => {
  return displayedList.value.length * itemHeight
})

const offsetY = computed(() => {
  return visibleStart.value * itemHeight
})

const showAdvancedSearch = ref(false)
const advancedForm = ref({
  keyword: '',
  artist: '',
  album: '',
  genre: '',
  directory: '',
  fileExtension: '',
  favoriteOnly: false,
  minDuration: '',
  maxDuration: '',
  yearFrom: '',
  yearTo: '',
  sortBy: 'addedAt',
  sortOrder: 'desc',
  limit: 200
})

// 播放列表状态缓存（文件路径 -> 是否在播放列表中）
const playlistStatusCache = ref<Map<string, boolean>>(new Map())

onMounted(async () => {
  await musicStore.loadMusic(0, 50)

  // 监听滚动
  if (containerRef.value) {
    containerRef.value.addEventListener('scroll', handleScroll)
    containerHeight.value = containerRef.value.clientHeight
  }

  // 更新播放列表状态缓存
  const filePaths = displayedList.value.map(m => m.filePath)
  await updatePlaylistStatusCache(filePaths)

  // 更新收藏状态缓存
  await updateFavoriteStatusCache(filePaths)

  // 扫描状态由 App.vue 统一管理，这里不需要重复监听
})

// 监听列表变化，更新播放列表和收藏状态
watch(displayedList, async (newList) => {
  const filePaths = newList.map(m => m.filePath)
  await updatePlaylistStatusCache(filePaths)
  await updateFavoriteStatusCache(filePaths)
}, { deep: false })

onUnmounted(() => {
  // 扫描监听由 App.vue 统一管理，这里不需要移除
  if (containerRef.value) {
    containerRef.value.removeEventListener('scroll', handleScroll)
  }
})

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  scrollTop.value = target.scrollTop

  // 加载更多
  if (
    !musicStore.isAdvancedMode &&
    target.scrollTop + target.clientHeight >= target.scrollHeight - 100
  ) {
    if (musicStore.hasMore && !musicStore.loading) {
      musicStore.loadMusic(musicStore.musicList.length, 50)
    }
  }
}

const handleScan = async () => {
  const folders = await window.electronAPI.selectMusicFolder()
  if (folders.length === 0) return

  try {
    for (const folder of folders) {
      await window.electronAPI.scanMusicFolder(folder)
    }
    // 重新加载列表
    await musicStore.loadMusic(0, 50)
  } catch (error: any) {
    if (error.message !== '扫描已取消') {
      alert(`扫描失败: ${error.message}`)
    }
  }
}

const pauseScan = async () => {
  await window.electronAPI.pauseScan()
}

const resumeScan = async () => {
  await window.electronAPI.resumeScan()
}

const cancelScan = async () => {
  if (confirm('确定要取消扫描吗？')) {
    await window.electronAPI.cancelScan()
    scanStore.setScanning(false)
    scanStore.setPaused(false)
    scanStore.setProgress(null)
  }
}

const resetAdvancedForm = () => {
  advancedForm.value = {
    keyword: '',
    artist: '',
    album: '',
    genre: '',
    directory: '',
    fileExtension: '',
    favoriteOnly: false,
    minDuration: '',
    maxDuration: '',
    yearFrom: '',
    yearTo: '',
    sortBy: 'addedAt',
    sortOrder: 'desc',
    limit: 200
  }
}

const toggleAdvancedSearchPanel = () => {
  showAdvancedSearch.value = !showAdvancedSearch.value
  if (!showAdvancedSearch.value) {
    resetAdvancedForm()
  }
}

const buildAdvancedCriteria = (): AdvancedSearchCriteria => {
  const criteria: AdvancedSearchCriteria = {
    sortBy: advancedForm.value.sortBy as AdvancedSearchCriteria['sortBy'],
    sortOrder: advancedForm.value.sortOrder as AdvancedSearchCriteria['sortOrder'],
    limit: Number(advancedForm.value.limit) || 200
  }

  const maybeNumber = (value: string) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : undefined
  }

  if (advancedForm.value.keyword.trim()) criteria.keyword = advancedForm.value.keyword.trim()
  if (advancedForm.value.artist.trim()) criteria.artist = advancedForm.value.artist.trim()
  if (advancedForm.value.album.trim()) criteria.album = advancedForm.value.album.trim()
  if (advancedForm.value.genre.trim()) criteria.genre = advancedForm.value.genre.trim()
  if (advancedForm.value.directory.trim()) criteria.directory = advancedForm.value.directory.trim()
  if (advancedForm.value.fileExtension.trim()) {
    criteria.fileExtension = advancedForm.value.fileExtension.trim().toLowerCase()
  }
  if (advancedForm.value.favoriteOnly) criteria.favorite = true

  const minDuration = maybeNumber(advancedForm.value.minDuration)
  if (minDuration !== undefined) criteria.minDuration = minDuration
  const maxDuration = maybeNumber(advancedForm.value.maxDuration)
  if (maxDuration !== undefined) criteria.maxDuration = maxDuration
  const yearFrom = maybeNumber(advancedForm.value.yearFrom)
  if (yearFrom !== undefined) criteria.yearFrom = yearFrom
  const yearTo = maybeNumber(advancedForm.value.yearTo)
  if (yearTo !== undefined) criteria.yearTo = yearTo

  return criteria
}

const runAdvancedSearch = async () => {
  const criteria = buildAdvancedCriteria()
  await musicStore.runAdvancedSearch(criteria)
  showAdvancedSearch.value = false
}

const clearAdvancedSearchResults = () => {
  musicStore.clearAdvancedSearch()
  showAdvancedSearch.value = false
}

const handlePlay = async (music: MusicItem) => {
  await play(music)
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const getSearchQuery = (): string => {
  if (musicStore.isAdvancedMode && musicStore.advancedCriteria?.keyword) {
    return musicStore.advancedCriteria.keyword
  }
  return musicStore.searchQuery
}

const highlightText = (text: string, query: string): string => {
  if (!query || !text || text === '-') return text
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

// 收藏状态缓存（文件路径 -> 是否收藏）
const favoriteStatusCache = ref<Map<string, boolean>>(new Map())

// 检查文件是否收藏（基于文件路径）
const isFileFavorite = (filePath: string): boolean => {
  return favoriteStatusCache.value.get(filePath) || false
}

// 更新收藏状态缓存
const updateFavoriteStatusCache = async (filePaths: string[]) => {
  for (const filePath of filePaths) {
    const isFavorite = await window.electronAPI.isFileFavorite(filePath)
    favoriteStatusCache.value.set(filePath, isFavorite)
  }
}

const toggleFavorite = async (music: MusicItem) => {
  await window.electronAPI.toggleFavorite(music.filePath)
  // 更新缓存
  const newFavoriteStatus = !isFileFavorite(music.filePath)
  favoriteStatusCache.value.set(music.filePath, newFavoriteStatus)
  music.favorite = newFavoriteStatus
}

const exportToExcel = async () => {
  try {
    // 获取当前列表中的所有音乐ID
    const musicIds = displayedList.value.map(m => m.id)

    if (musicIds.length === 0) {
      alert('没有可导出的音乐')
      return
    }

    const filePath = await window.electronAPI.exportMusicToExcel(musicIds, {
      format: 'xlsx',
      columns: ['title', 'artist', 'album', 'year', 'genre', 'duration', 'filePath', 'fileHash', 'fileSize', 'bitrate', 'playCount', 'favorite']
    })

    if (filePath) {
      alert(`导出成功！\n文件已保存到：\n${filePath}`)
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    alert(`导出失败: ${error.message}`)
  }
}

const exportFiles = async () => {
  try {
    // 获取当前列表中的所有音乐ID
    const musicIds = displayedList.value.map(m => m.id)

    if (musicIds.length === 0) {
      alert('没有可导出的音乐')
      return
    }

    const result = await window.electronAPI.exportMusicFiles(musicIds, {
      organizeBy: 'none', // 可选: 'none', 'artist', 'album', 'original'
      conflictAction: 'skip' // 可选: 'skip', 'overwrite', 'rename'
    })

    if (result) {
      alert(`导出完成！\n成功: ${result.success}\n失败: ${result.failed}\n跳过: ${result.skipped}`)
      if (result.errors.length > 0) {
        console.error('导出错误:', result.errors)
      }
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    alert(`导出失败: ${error.message}`)
  }
}

// 右键菜单
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  item: null as MusicItem | null
})

const showPlaylistDialog = ref(false)
const showCreatePlaylistDialog = ref(false)
const playlists = ref<any[]>([])
const newPlaylistName = ref('')
const newPlaylistDescription = ref('')
const similarDialog = ref<SimilarDialogState>({
  show: false,
  loading: false,
  songs: [],
  base: null
})

const metadataEditDialog = ref({
  show: false,
  music: null as MusicItem | null,
  musicIds: [] as number[]
})

// 显示右键菜单
const showContextMenu = (event: MouseEvent, item: MusicItem) => {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    item
  }

  // 点击其他地方关闭菜单
  document.addEventListener('click', hideContextMenu)
}

// 隐藏右键菜单
const hideContextMenu = () => {
  contextMenu.value.show = false
  document.removeEventListener('click', hideContextMenu)
}

// 显示更多菜单（用于移动端或点击按钮）
const showMoreMenu = (item: MusicItem) => {
  // 使用按钮位置显示菜单
  const button = event?.target as HTMLElement
  const rect = button.getBoundingClientRect()
  contextMenu.value = {
    show: true,
    x: rect.left,
    y: rect.bottom + 5,
    item
  }
  document.addEventListener('click', hideContextMenu)
}

// 立即播放
const playNow = async (music: MusicItem | null) => {
  if (music) {
    // 添加到队列并播放
    playerStore.addToQueue(music)
    playerStore.setCurrentQueueIndex(playerStore.queue.length - 1)
    await play(music)
  }
  hideContextMenu()
}

const playNext = (music: MusicItem | null) => {
  if (music) {
    // 插入到当前播放的下一首
    const nextIndex = playerStore.currentQueueIndex >= 0
      ? playerStore.currentQueueIndex + 1
      : playerStore.queue.length
    playerStore.addToQueue(music, nextIndex)
    alert('已添加到下一首播放')
  }
  hideContextMenu()
}

const isInQueue = (id: number) => {
  return playerStore.queue.some(m => m.id === id)
}

const toggleQueue = (music: MusicItem) => {
  if (isInQueue(music.id)) {
    const index = playerStore.queue.findIndex(m => m.id === music.id)
    if (index >= 0) {
      playerStore.removeFromQueue(index)
      // 图标状态变化已足够提示，无需 alert
    }
  } else {
    playerStore.addToQueue(music)
    // 图标状态变化已足够提示，无需 alert
  }
}

// 检查文件是否在播放列表中（基于文件路径）
const isInPlaylist = (filePath: string): boolean => {
  return playlistStatusCache.value.get(filePath) || false
}

// 切换播放列表状态
const togglePlaylist = async (music: MusicItem) => {
  const isIn = isInPlaylist(music.filePath)
  if (isIn) {
    // 如果已在播放列表中，显示菜单让用户选择从哪个播放列表移除
    const playlistIds = await window.electronAPI.getPlaylistsForFile(music.filePath)
    if (playlistIds.length === 0) {
      playlistStatusCache.value.set(music.filePath, false)
      return
    }
    if (playlistIds.length === 1) {
      // 只有一个播放列表，直接移除
      await window.electronAPI.removeFromPlaylistByPath(playlistIds[0], music.filePath)
      playlistStatusCache.value.set(music.filePath, false)
    } else {
      // 多个播放列表，显示选择对话框
      alert(`该文件在 ${playlistIds.length} 个播放列表中，请通过播放列表管理页面移除`)
    }
  } else {
    // 如果不在播放列表中，显示添加到播放列表对话框
    showAddToPlaylistDialog()
  }
}

// 更新播放列表状态缓存
const updatePlaylistStatusCache = async (filePaths: string[]) => {
  for (const filePath of filePaths) {
    const isIn = await window.electronAPI.isFileInPlaylist(filePath)
    playlistStatusCache.value.set(filePath, isIn)
  }
}

const playAndAddToQueue = async (music: MusicItem) => {
  if (!isInQueue(music.id)) {
    playerStore.addToQueue(music)
  }
  const index = playerStore.queue.findIndex(m => m.id === music.id)
  playerStore.setCurrentQueueIndex(index >= 0 ? index : playerStore.queue.length - 1)
  await play(music)
}

const addToPlayQueue = (music: MusicItem | null) => {
  if (music) {
    playerStore.addToQueue(music)
    // 图标状态变化已足够提示，无需 alert
  }
  hideContextMenu()
}

const openSimilarDialog = async (music: MusicItem | null) => {
  if (!music) return
  hideContextMenu()
  similarDialog.value.show = true
  similarDialog.value.loading = true
  similarDialog.value.base = music
  try {
    const songs = await window.electronAPI.getSimilarMusic(music.id, 30, 0.5)
    similarDialog.value.songs = songs as SimilarSong[]
  } catch (error) {
    console.error('获取相似歌曲失败:', error)
    alert('获取相似歌曲失败，请稍后重试')
  } finally {
    similarDialog.value.loading = false
  }
}

const closeSimilarDialog = () => {
  similarDialog.value.show = false
  similarDialog.value.songs = []
  similarDialog.value.base = null
}

const playSimilarSong = async (music: MusicItem) => {
  await play(music)
}

const queueSimilarSong = (music: MusicItem) => {
  playerStore.addToQueue(music)
}

// 显示添加到播放列表对话框
const showAddToPlaylistDialog = async () => {
  hideContextMenu()
  // 加载播放列表
  playlists.value = await window.electronAPI.getPlaylists()
  showPlaylistDialog.value = true
}

// 关闭播放列表选择对话框
const closePlaylistDialog = () => {
  showPlaylistDialog.value = false
}

// 添加到播放列表
const addToPlaylist = async (playlistId: number) => {
  if (contextMenu.value.item) {
    try {
      await window.electronAPI.addToPlaylist(playlistId, contextMenu.value.item.filePath)

      // 重新加载缓存（更可靠）
      await updatePlaylistStatusCache([contextMenu.value.item.filePath])

      showPlaylistDialog.value = false
      contextMenu.value.show = false
      alert('已添加到歌单')
    } catch (error) {
      console.error('添加失败:', error)
      alert('添加失败，请重试')
    }
  }
}

// 显示创建播放列表对话框
const showCreateDialog = () => {
  newPlaylistName.value = ''
  newPlaylistDescription.value = ''
  showCreatePlaylistDialog.value = true
  // 暂时隐藏播放列表选择对话框
  showPlaylistDialog.value = false
}

// 关闭创建对话框
const closeCreateDialog = () => {
  showCreatePlaylistDialog.value = false
  newPlaylistName.value = ''
  newPlaylistDescription.value = ''
}

// 确认创建播放列表
const confirmCreatePlaylist = async () => {
  if (!newPlaylistName.value.trim()) {
    alert('请输入歌单名称')
    return
  }

  try {
    await window.electronAPI.createPlaylist(
      newPlaylistName.value.trim(),
      newPlaylistDescription.value.trim() || undefined
    )

    // 重新加载播放列表
    playlists.value = await window.electronAPI.getPlaylists()

    // 关闭创建对话框，显示选择对话框
    showCreatePlaylistDialog.value = false
    showPlaylistDialog.value = true

    alert('歌单创建成功！')
  } catch (error) {
    console.error('创建失败:', error)
    alert('创建失败，请重试')
  }
}

// 查看详情
const viewDetails = (music: MusicItem | null) => {
  if (music) {
    const details = `
标题: ${music.title}
艺术家: ${music.artist}
专辑: ${music.album || '-'}
时长: ${formatDuration(music.duration)}
文件路径: ${music.filePath}
MD5: ${music.fileHash}
文件大小: ${(music.fileSize / 1024 / 1024).toFixed(2)} MB
播放次数: ${music.playCount}
    `
    alert(details)
  }
  hideContextMenu()
}

const editMetadata = (music: MusicItem | null) => {
  if (music) {
    metadataEditDialog.value = {
      show: true,
      music,
      musicIds: []
    }
  }
  hideContextMenu()
}

const closeMetadataEditDialog = () => {
  metadataEditDialog.value = {
    show: false,
    music: null,
    musicIds: []
  }
}

const handleMetadataSaved = async () => {
  // 重新加载当前列表
  if (musicStore.isAdvancedMode) {
    await musicStore.runAdvancedSearch(musicStore.advancedCriteria!)
  } else {
    await musicStore.loadMusic(0, 50)
  }
}
</script>

<style scoped>
.music-list-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
}

.scan-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-scan {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: var(--active-text);
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-scan:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-scan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scan-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scan-progress {
  color: var(--secondary-text-color);
  font-size: 13px;
}

.btn-pause,
.btn-resume,
.btn-cancel {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: var(--hover-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-pause:hover,
.btn-resume:hover,
.btn-cancel:hover {
  background: var(--active-bg);
}

.btn-cancel {
  color: var(--active-text);
}

.virtual-list-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.table-header {
  display: grid;
  grid-template-columns: 40px 2fr 1.5fr 1.3fr 80px 1.7fr 120px 120px 60px;
  column-gap: 12px;
  padding: 10px 20px;
  background: var(--sidebar-bg);
  font-weight: bold;
  color: var(--text-color);
  font-size: 13px;
  position: sticky;
  top: 0;
  z-index: 1;
}

.virtual-list-wrapper {
  position: relative;
  flex: 1;
}

.virtual-list-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.col-index,
.item-index {
  text-align: center;
  color: var(--secondary-text-color);
}

.col-title,
.item-title,
.col-artist,
.item-artist,
.col-album,
.item-album {
  color: var(--text-color);
}

.item-title mark,
.item-artist mark,
.item-album mark {
  background-color: #ffeb3b;
  color: inherit;
  font-weight: 600;
  padding: 0;
}

.col-duration,
.item-duration {
  text-align: center;
  color: var(--text-color);
}

.col-path,
.item-path {
  color: var(--text-color);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-md5,
.item-md5 {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-color);
}

.col-status,
.col-actions,
.item-status,
.item-actions {
  text-align: center;
}

.music-item {
  display: grid;
  grid-template-columns: 40px 2fr 1.5fr 1.3fr 80px 1.7fr 120px 120px 60px;
  column-gap: 12px;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 13px;
  color: var(--text-color);
}

.music-item:hover {
  background-color: var(--hover-bg);
}

.item-index {
  width: 40px;
  text-align: center;
  color: var(--secondary-text-color);
}

.item-status {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.status-icon {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, background-color 0.2s;
}

.status-icon:hover {
  transform: scale(1.1);
  background: var(--hover-bg);
}

.status-icon.favorite.active {
  color: var(--active-text);
}

.status-icon.playlist.active {
  color: #4290ff;
}

.item-actions {
  width: 60px;
  text-align: center;
}

.btn-favorite {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.btn-favorite:hover {
  transform: scale(1.2);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.advanced-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);
}

.advanced-status {
  font-size: 13px;
  color: var(--secondary-text-color);
}

.advanced-loading {
  font-size: 13px;
  color: #ff9800;
}

.link-button {
  border: none;
  background: none;
  color: #2196f3;
  cursor: pointer;
  padding: 0 4px;
}

.advanced-panel {
  padding: 12px 20px 4px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.advanced-grid label {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--secondary-text-color);
  gap: 6px;
}

.advanced-grid input,
.advanced-grid select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-color);
  color: var(--text-color);
}

.favorite-only {
  flex-direction: row !important;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.advanced-actions {
  padding: 12px 20px;
  display: flex;
  gap: 10px;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
}

.btn-export {
  background: #2196F3;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-export:hover {
  background: #0b7dda;
  opacity: 0.9;
}

.btn-more {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  color: var(--text-color);
}

.btn-more:hover {
  background: var(--hover-bg);
  border-radius: 4px;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  min-width: 200px;
  z-index: 1000;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s;
}

.menu-item:hover {
  background: var(--hover-bg);
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

/* 对话框 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog {
  background: var(--bg-color) !important;
  padding: 24px;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  z-index: 1001;
}

.dialog * {
  color: inherit !important;
}

.dialog h3 {
  margin-bottom: 20px;
  color: var(--text-color) !important;
  font-size: 18px;
  font-weight: 600;
  margin-top: 0;
}

.playlist-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  background: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
}

.playlist-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--hover-bg);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--text-color);
}

.playlist-item:hover {
  background: var(--active-bg);
}

.song-count {
  color: var(--secondary-text-color);
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--secondary-text-color);
}

.empty-state p {
  margin-bottom: 16px;
}

.btn-create {
  background: var(--active-text);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-create:hover {
  background: var(--active-text);
  opacity: 0.9;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.dialog-similar {
  max-width: 640px;
}

.similar-base {
  font-size: 13px;
  color: var(--secondary-text-color);
  margin-bottom: 12px;
}

.similar-list {
  max-height: 360px;
  overflow-y: auto;
  margin: 12px 0;
}

.similar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
}

.similarity-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.score-label {
  font-size: 11px;
  color: var(--secondary-text-color);
  margin-bottom: 2px;
}

.score-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--active-text);
}

.similar-item:last-child {
  border-bottom: none;
}

.similar-item .info .title {
  font-weight: 500;
  color: var(--text-color);
}

.similar-item .info .meta {
  font-size: 12px;
  color: var(--secondary-text-color);
}

.similar-item .actions {
  display: flex;
  gap: 8px;
}

.similar-item .actions button {
  border: none;
  background: var(--hover-bg);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.similar-loading {
  padding: 20px 0;
  text-align: center;
  color: var(--secondary-text-color);
}

.btn-secondary {
  background: var(--hover-bg);
  color: var(--text-color);
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover {
  background: var(--sidebar-border);
}

.btn-primary {
  background: var(--active-text);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary:hover:not(:disabled) {
  background: var(--active-text);
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-color) !important;
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: var(--bg-color) !important;
  color: var(--text-color) !important;
  box-sizing: border-box;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--secondary-text-color) !important;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--active-text);
}

.form-group textarea {
  resize: vertical;
  font-family: inherit;
}
</style>
