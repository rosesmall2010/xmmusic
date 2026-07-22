<template>
  <div class="song-list" @click="closeContextMenu">
    <!-- 批量操作栏 -->
    <div v-if="selectionMode && selectedSongs.size > 0" class="batch-actions">
      <div class="selection-info">
        <Check :size="16" />
        {{ $t('music.selected', { count: selectedSongs.size }) }}
      </div>
      <button class="batch-btn" @click="handleBatchAddToFavorites">
        <Heart :size="16" />
        {{ $t('music.addToFavorites') }}
      </button>
      <button class="batch-btn" @click="handleBatchAddToPlaylist">
        <Music :size="16" />
        {{ $t('music.addToPlaylist') }}
      </button>
      <button class="batch-btn" @click="handleBatchAddToQueue">
        <ListMusic :size="16" />
        {{ $t('music.addToQueue') }}
      </button>
      <button class="batch-btn" @click="handleBatchSyncToDatabase" :disabled="batchSyncing">
        <Database :size="16" />
        {{ batchSyncing ? $t('music.batchSyncing') : $t('music.batchSyncToDatabase') }}
      </button>
      <button v-if="showRemoveFromPlaylist" class="batch-btn danger" @click="handleBatchRemove">
        <Trash2 :size="16" />
        {{ $t('music.batchDelete') }}
      </button>
      <button class="batch-btn" @click="cancelSelection">
        <X :size="16" />
        {{ $t('common.cancel') }}
      </button>
    </div>

    <div class="list-header-row">
      <div class="col-checkbox" v-if="selectionMode">
        <input
          type="checkbox"
          :checked="isAllSelected"
          @change="toggleSelectAll"
        />
      </div>
      <div class="col-index">#</div>
      <div class="col-title">{{ $t('music.title') }}</div>
      <div class="col-album">{{ $t('music.album') }}</div>
      <div class="col-filename">{{ $t('music.fileName') }}</div>
      <div class="col-duration">{{ $t('music.duration') }}</div>
      <div class="col-actions">{{ $t('common.actions') }}</div>
    </div>

    <div class="list-content" ref="containerRef" @scroll="handleScroll">
      <div class="virtual-spacer" :style="{ height: totalHeight + 'px' }"></div>
      <div class="virtual-content" :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          class="list-item"
          v-for="(music) in visibleSongs"
          :key="music.id"
          @dblclick="handlePlay(music)"
          @contextmenu.prevent="showContextMenu($event, music)"
          :class="{
            playing: currentMusic?.id === music.id,
            selected: selectedSongs.has(music.filePath)
          }"
          :style="{ height: itemHeight + 'px' }"
        >
          <div class="col-checkbox" v-if="selectionMode">
            <input
              type="checkbox"
              :checked="selectedSongs.has(music.filePath)"
              @change="toggleSelect(music.filePath)"
              @click.stop
            />
          </div>
          <div class="col-index">
            <Volume2 v-if="currentMusic?.id === music.id" :size="14" class="playing-icon" />
            <span v-else>{{ music.originalIndex + 1 }}</span>
          </div>
          <div class="col-title">
            <div class="item-cover">
               <!-- Fallback/Default Cover Strategy:
                    1. If no coverPath, show DefaultCover directly.
                    2. If coverPath exists, show DefaultCover absolutely positioned BEHIND the img.
                       If img loads, it covers the DefaultCover.
                       If img fails, we hide the img, revealing the DefaultCover.
               -->
               <DefaultCover v-if="!music.coverPath" size="small" />
               <template v-else>
                 <DefaultCover class="fallback-cover" size="small" />
                 <img
                   :src="getCoverUrl(music.coverPath)"
                   :alt="$t('music.cover')"
                   loading="lazy"
                   @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                 />
               </template>
            </div>
            <div class="item-info">
              <div class="item-title-wrapper">
                <div class="item-title" :title="music.title">{{ music.title }}</div>
                <!-- 状态图标 -->
                <FileX
                  v-if="music.isExists === false"
                  :size="14"
                  class="status-icon status-icon-missing"
                  :title="$t('music.notExists')"
                />
                <AlertCircle
                  v-else-if="music.isPlayable === false"
                  :size="14"
                  class="status-icon status-icon-unplayable"
                  :title="music.playErrorReason || $t('music.cannotPlay')"
                />
              </div>
              <div class="item-artist" :title="music.artist">{{ music.artist }}</div>
            </div>
          </div>
          <div class="col-album" :title="music.album || ''">{{ music.album || '-' }}</div>
          <div class="col-filename" :title="music.fileName">{{ music.fileName }}</div>
          <div class="col-duration">
            <div class="duration-line">
              <span>{{ formatDuration(music.duration) }}</span>
              <span class="separator">|</span>
              <span>{{ formatChannels(music.channels) }}</span>
            </div>
            <div class="audio-info-line">
              <span>{{ formatBitrate(music.bitrate) }}</span>
              <span class="separator">|</span>
              <span>{{ formatSampleRate(music.sampleRate) }}</span>
            </div>
          </div>
          <div class="col-actions">
            <button
              class="action-btn"
              :class="{ active: isFavorite(music) }"
              @click.stop="toggleFavorite(music)"
              :title="isFavorite(music) ? $t('music.removeFromFavorites') : $t('music.addToFavorites')"
            >
              <Heart :size="16" :fill="isFavorite(music) ? 'currentColor' : 'none'" />
            </button>
            <button
              class="action-btn"
              :class="{ active: isInQueue(music) }"
              @click.stop="toggleQueue(music)"
              :title="isInQueue(music) ? $t('music.removeFromQueue') : $t('music.addToQueue')"
            >
              <ListMusic :size="16" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="songs.length === 0" class="empty-state">
        <slot name="empty">
          <p>{{ $t('common.empty') }}</p>
        </slot>
      </div>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible && contextMenu.music"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="menu-item" @click="handlePlay(contextMenu.music!)">
        {{ $t('music.play') }}
      </div>
      <div class="menu-item" @click="toggleFavorite(contextMenu.music!)">
        <Heart :size="16" :fill="contextMenu.isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': contextMenu.isFavorite }" class="icon" />
        {{ contextMenu.isFavorite ? $t('music.removeFromFavorites') : $t('music.addToFavorites') }}
      </div>
      <div class="menu-item" @click="openAddToPlaylist(contextMenu.music!)">
        <Music :size="16" class="icon" />
        {{ $t('music.addToPlaylist') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="openEditTag(contextMenu.music!)">
        <Edit :size="16" class="icon" />
        {{ $t('music.editTags') }}
      </div>
      <div class="menu-item" @click="openFileExplorer(contextMenu.music!)">
        <FolderOpen :size="16" class="icon" />
        {{ $t('music.openInExplorer') }}
      </div>
      <div class="menu-item" @click="showMusicDetails(contextMenu.music!)">
        <Info :size="16" class="icon" />
        {{ $t('music.viewDetails') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="enableSelectionMode">
        <Check :size="16" class="icon" />
        {{ $t('music.batchOperation') }}
      </div>
      <div
        v-if="showRemoveFromPlaylist"
        class="menu-item delete"
        @click="handleRemoveFromPlaylist(contextMenu.music!)"
      >
        <Trash2 :size="16" class="icon" />
        {{ $t('music.removeFromPlaylist') }}
      </div>
    </div>

    <AddToPlaylistModal
      v-model="showAddToPlaylist"
      :music-to-ad="selectedMusic"
      @added="handleAddedToPlaylist"
    />
    <AddToPlaylistModal
      v-model="showBatchAddToPlaylist"
      v-if="selectedSongs.size > 0"
      :music-list-to-ad="Array.from(selectedSongs).map(filePath => props.songs.find(s => s.filePath === filePath)!).filter(Boolean)"
      @added="handleBatchAddedToPlaylist"
    />
    <EditTagModal
      :show="showEditTag"
      :music="editingMusic"
      @close="closeEditTag"
      @saved="handleTagSaved"
    />
    <MusicDetailsModal
      :show="showDetailsDialog"
      :music="detailsMusic"
      @close="showDetailsDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { getCoverUrl } from '@/utils/media'
import { Volume2, Trash2, Heart, Music, Check, X, Edit, ListMusic, FolderOpen, Info, AlertCircle, FileX, Database } from 'lucide-vue-next'
import DefaultCover from '@/components/common/DefaultCover.vue'
import AddToPlaylistModal from '@/components/music/AddToPlaylistModal.vue'
import EditTagModal from '@/components/music/EditTagModal.vue'
import MusicDetailsModal from '@/components/music/MusicDetailsModal.vue'
import type { MusicItem } from '@shared/types/music'
import { useElementSize } from '@vueuse/core'

const props = defineProps<{
  songs: MusicItem[]
  showRemoveFromPlaylist?: boolean
  playlistId?: number  // 用于批量删除
}>()

const emit = defineEmits<{
  (e: 'play', music: MusicItem): void
  (e: 'remove-from-playlist', music: MusicItem): void
  (e: 'load-more'): void
  (e: 'songs-updated'): void  // 批量操作后通知父组件刷新
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()
const currentMusic = computed(() => playerStore.currentMusic)

// Virtual Scrolling
const itemHeight = 60
const containerRef = ref<HTMLElement | null>(null)
const { height: containerHeight } = useElementSize(containerRef)
const scrollTop = ref(0)

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  requestAnimationFrame(() => {
    scrollTop.value = target.scrollTop

    // Check if we need to load more
    const { scrollHeight, clientHeight, scrollTop: st } = target
    if (scrollHeight - st - clientHeight < 500) { // Threshold of 500px
      emit('load-more')
    }
  })
  closeContextMenu()
}

const visibleRange = computed(() => {
  const start = Math.floor(scrollTop.value / itemHeight)
  const visibleCount = Math.ceil(containerHeight.value / itemHeight)
  const buffer = 10 // Increased buffer for smoother scrolling

  return {
    start: Math.max(0, start - buffer),
    end: Math.min(props.songs.length, start + visibleCount + buffer)
  }
})

const visibleSongs = computed(() => {
  // 保留原始对象引用，只添加 originalIndex 属性
  // 这样当 music.favorite 或 music.inQueue 更新时，Vue 能够检测到变化
  return props.songs.slice(visibleRange.value.start, visibleRange.value.end).map((song, index) => {
    // 直接修改原始对象添加 originalIndex（如果还没有的话）
    if (!('originalIndex' in song)) {
      Object.defineProperty(song, 'originalIndex', {
        value: visibleRange.value.start + index,
        writable: true,
        enumerable: true,
        configurable: true
      })
    } else {
      song.originalIndex = visibleRange.value.start + index
    }
    return song
  })
})

const totalHeight = computed(() => props.songs.length * itemHeight)
const offsetY = computed(() => visibleRange.value.start * itemHeight)

// Context Menu & Modals
const showAddToPlaylist = ref(false)
const selectedMusic = ref<MusicItem | null>(null)
const showBatchAddToPlaylist = ref(false)

// Edit Tag Modal
const showEditTag = ref(false)
const editingMusic = ref<MusicItem | null>(null)

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  music: null as MusicItem | null,
  isFavorite: false
})

// 批量选择状态
const selectionMode = ref(false)
const selectedSongs = ref<Set<string>>(new Set())
const batchSyncing = ref(false)

// 全选状态
const isAllSelected = computed(() => {
  return props.songs.length > 0 && selectedSongs.value.size === props.songs.length
})

// 切换选择
const toggleSelect = (filePath: string) => {
  if (selectedSongs.value.has(filePath)) {
    selectedSongs.value.delete(filePath)
  } else {
    selectedSongs.value.add(filePath)
  }
}

// 全选/反选
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedSongs.value.clear()
  } else {
    selectedSongs.value = new Set(props.songs.map(s => s.filePath))
  }
}

//取消选择
const cancelSelection = () => {
  selectedSongs.value.clear()
  selectionMode.value = false
}

// 启用选择模式
const enableSelectionMode = () => {
  selectionMode.value = true
  closeContextMenu()
}

// 批量添加到歌单
// 批量添加到我喜欢
const handleBatchAddToFavorites = async () => {
  if (selectedSongs.value.size === 0) return

  try {
    const filePaths = Array.from(selectedSongs.value)
    let addedCount = 0

    for (const filePath of filePaths) {
      const music = props.songs.find(s => s.filePath === filePath)
      if (!music) continue

      // 检查是否已经在我喜欢中
      if (!favoriteFiles.value.has(filePath)) {
        const latest = await window.electronAPI.toggleFavorite(music.id)
        if (latest) {
          favoriteFiles.value.add(filePath)
          addedCount++
        } else {
          favoriteFiles.value.delete(filePath)
        }
      }
    }

    console.log(`Added ${addedCount} songs to favorites`)
    cancelSelection()
    favoriteFiles.value = new Set(favoriteFiles.value)
    window.dispatchEvent(new Event('favorites-updated'))
  } catch (error) {
    console.error('Failed to batch add to favorites:', error)
  }
}

const handleBatchAddToPlaylist = () => {
  if (selectedSongs.value.size === 0) return
  showBatchAddToPlaylist.value = true
}

// 批量添加到播放队列
const handleBatchAddToQueue = () => {
  if (selectedSongs.value.size === 0) return

  try {
    const filePaths = Array.from(selectedSongs.value)
    const songsToAdd = props.songs.filter(s => filePaths.includes(s.filePath))

    for (const song of songsToAdd) {
      if (!isInQueue(song)) {
        playerStore.addToQueue(song)
        queueFiles.value.add(song.filePath)
      }
    }

    console.log(`Added ${songsToAdd.length} songs to queue`)
    cancelSelection()
  } catch (error) {
    console.error('Failed to batch add to queue:', error)
  }
}

/**
 * 批量同步元数据到数据库（从文件名/ID3 解析，不改写文件）
 * 歌单等列表通过 music_id JOIN，事件派发后会就地刷新显示
 */
const handleBatchSyncToDatabase = async () => {
  if (selectedSongs.value.size === 0 || batchSyncing.value) return

  const count = selectedSongs.value.size
  if (!confirm(t('music.batchSyncConfirm', { count }))) return

  try {
    batchSyncing.value = true
    const filePaths = Array.from(selectedSongs.value)
    const musicIds = filePaths
      .map(filePath => props.songs.find(s => s.filePath === filePath)?.id)
      .filter((id): id is number => id !== undefined)

    if (musicIds.length === 0) {
      alert(t('music.batchSyncNoMatch'))
      return
    }

    const result = await window.electronAPI.batchSyncMusicMetadataToDb(musicIds)

    // 逐条通知各列表/播放器 patch 显示
    for (const updated of result.updated) {
      window.dispatchEvent(new CustomEvent('music-metadata-updated', {
        detail: updated
      }))
    }

    emit('songs-updated')
    cancelSelection()

    if (result.failed > 0) {
      alert(t('music.batchSyncPartial', {
        success: result.success,
        failed: result.failed
      }))
    } else {
      alert(t('music.batchSyncSuccess', { count: result.success }))
    }
  } catch (error: any) {
    console.error('批量同步到数据库失败:', error)
    alert(t('music.batchSyncError') + ': ' + (error?.message || error))
  } finally {
    batchSyncing.value = false
  }
}

// 批量删除
const handleBatchRemove = async () => {
  if (!props.playlistId || selectedSongs.value.size === 0) return

  try {
    const filePaths = Array.from(selectedSongs.value)
    const musicIds = filePaths
      .map(filePath => props.songs.find(s => s.filePath === filePath)?.id)
      .filter((id): id is number => id !== undefined)
    const result = await window.electronAPI.batchRemoveFromPlaylist(props.playlistId, musicIds)
    console.log(`Removed ${result.removed} songs`)
    cancelSelection()
    emit('songs-updated')
    // 触发事件通知其他组件更新封面和数量
    window.dispatchEvent(new CustomEvent('song-added-to-playlist'))
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('Failed to batch remove:', error)
  }
}

// 批量添加完成
const handleBatchAddedToPlaylist = () => {
  cancelSelection()
  emit('songs-updated')
}

const handlePlay = (music: MusicItem) => {
  emit('play', music)
  closeContextMenu()
}

const showContextMenu = async (event: MouseEvent, music: MusicItem) => {
  contextMenu.music = music
  contextMenu.visible = true

  // 先设置初始位置，然后在 nextTick 中调整边界
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY

  try {
    contextMenu.isFavorite = await window.electronAPI.isFileFavorite(music.id)
  } catch (e) {
    console.error('Failed to check favorite status', e)
  }

  // 在 nextTick 中调整菜单位置，确保不超出屏幕边界
  await nextTick()
  adjustContextMenuPosition()
}

const adjustContextMenuPosition = () => {
  if (!contextMenu.visible) return

  // 获取菜单元素
  const menuElement = document.querySelector('.context-menu') as HTMLElement
  if (!menuElement) return

  const menuRect = menuElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = menuRect.width || 200 // 默认宽度 200px
  const menuHeight = menuRect.height || 300 // 默认高度 300px

  let adjustedX = contextMenu.x
  let adjustedY = contextMenu.y

  // 检查右边界
  if (adjustedX + menuWidth > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - 10 // 留 10px 边距
  }

  // 检查左边界
  if (adjustedX < 0) {
    adjustedX = 10 // 留 10px 边距
  }

  // 检查下边界
  if (adjustedY + menuHeight > viewportHeight) {
    adjustedY = viewportHeight - menuHeight - 10 // 留 10px 边距
  }

  // 检查上边界
  if (adjustedY < 0) {
    adjustedY = 10 // 留 10px 边距
  }

  contextMenu.x = adjustedX
  contextMenu.y = adjustedY
}

const closeContextMenu = () => {
  contextMenu.visible = false
}

const openAddToPlaylist = (music: MusicItem) => {
  selectedMusic.value = music
  showAddToPlaylist.value = true
  closeContextMenu()
}

const handleRemoveFromPlaylist = (music: MusicItem) => {
  if (confirm(t('music.removeFromPlaylistConfirm', { title: music.title }))) {
    emit('remove-from-playlist', music)
  }
  closeContextMenu()
}

// 收藏状态管理（以响应式 Set 为准，确保 UI 立即刷新）
const favoriteFiles = ref<Set<string>>(new Set())

const isFavorite = (music: MusicItem) => {
  // 不依赖 music.favorite：列表数据很多来自 shallowRef，直接改字段不会触发渲染
  // 统一以 favoriteFiles（ref）为准，保证点击后空心/实心立即切换
  return favoriteFiles.value.has(music.filePath)
}

const loadFavoriteStatus = async () => {
  try {
    const favorites = await window.electronAPI.getFavorites()
    const favoriteFilePaths = new Set(favorites.map((m: MusicItem) => m.filePath))
    favoriteFiles.value = favoriteFilePaths
  } catch (e) {
    console.error('Failed to load favorites', e)
  }
}

const toggleFavorite = async (music: MusicItem) => {
  // 先本地立即切换，提升响应速度（避免等待 IPC 才变化）
  const currentFavoriteStatus = isFavorite(music)
  const optimisticNext = !currentFavoriteStatus

  // 同步更新 favoriteFiles Set（这个 Set 的变化会触发 isFavorite 的重新计算）
  if (optimisticNext) {
    favoriteFiles.value.add(music.filePath)
  } else {
    favoriteFiles.value.delete(music.filePath)
  }
  // 强制触发响应式更新：重新创建 Set 对象，确保 Vue 检测到变化
  favoriteFiles.value = new Set(favoriteFiles.value)
  // 同步更新 music 对象的状态（仅用于兜底）
  music.favorite = optimisticNext

  try {
    // toggleFavorite 直接返回最新状态，避免二次查询
    const latest = await window.electronAPI.toggleFavorite(music.id)
    music.favorite = latest
    // 以数据库结果为准回填 Set，避免本地与数据库不一致
    if (latest) {
      favoriteFiles.value.add(music.filePath)
    } else {
      favoriteFiles.value.delete(music.filePath)
    }
    favoriteFiles.value = new Set(favoriteFiles.value)

    // 触发全局事件，通知其他组件更新
    window.dispatchEvent(new Event('favorites-updated'))
    await nextTick()
  } catch (e) {
    console.error('Failed to toggle favorite', e)
    // 如果失败，重新加载状态并纠正 UI
    await loadFavoriteStatus()
  }
  closeContextMenu()
}

// 播放队列状态管理（以响应式 Set 为准，确保 UI 立即刷新）
const queueFiles = ref<Set<string>>(new Set())

const isInQueue = (music: MusicItem) => {
  // 不优先依赖 music.inQueue：列表数据很多来自 shallowRef，直接改字段不会触发 UI
  // 统一以 queueFiles（ref）为准，保证点击后图标立即切换
  return queueFiles.value.has(music.filePath)
}

const updateQueueStatus = () => {
  const queueFilePaths = new Set(playerStore.queue.map(m => m.filePath))
  queueFiles.value = queueFilePaths
  // 同时更新列表中每个 music 对象的 inQueue 状态
  // 确保每个 music 对象都有明确的 inQueue 值（boolean）
  props.songs.forEach(music => {
    music.inQueue = queueFilePaths.has(music.filePath)
  })
}

const toggleQueue = async (music: MusicItem) => {
  const currentInQueue = isInQueue(music)

  if (currentInQueue) {
    // 从队列移除：找到歌曲在队列中的索引
    const queueIndex = playerStore.queue.findIndex(m => m.id === music.id)
    if (queueIndex >= 0) {
      playerStore.removeFromQueue(queueIndex)
    }
    queueFiles.value.delete(music.filePath)
    music.inQueue = false
  } else {
    // 添加到队列
    playerStore.addToQueue(music)
    queueFiles.value.add(music.filePath)
    music.inQueue = true
  }

  // 强制触发响应式更新：重新创建 Set 对象，确保 Vue 检测到变化
  // 这会让 isInQueue 函数重新计算，因为它依赖于 queueFiles.value
  queueFiles.value = new Set(queueFiles.value)

  // 使用 nextTick 确保 DOM 更新完成
  await nextTick()
}

const handleAddedToPlaylist = () => {
  // Optional: show toast
}

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatBitrate = (bitrate: number) => {
  if (bitrate === 0) return '-'
  return `${bitrate} ${t('music.kbps')}`
}

const formatSampleRate = (sampleRate: number) => {
  if (sampleRate === 0) return '-'
  return `${sampleRate}${t('music.hz')}`
}

const formatChannels = (channels: number) => {
  if (channels === 0) return '-'
  if (channels === 1) return t('music.mono')
  if (channels === 2) return t('music.stereo')
  return `${channels}ch`
}

// Edit Tag Modal handlers
const openEditTag = (music: MusicItem) => {
  editingMusic.value = music
  showEditTag.value = true
  closeContextMenu()
}

const closeEditTag = () => {
  showEditTag.value = false
  editingMusic.value = null
}

const handleTagSaved = () => {
  // Emit event to refresh the list
  emit('songs-updated')
}

// 在文件管理器中打开
const openFileExplorer = (music: MusicItem) => {
  window.electronAPI.openInFileExplorer(music.filePath)
  closeContextMenu()
}

// 显示详细信息
const showDetailsDialog = ref(false)
const detailsMusic = ref<MusicItem | null>(null)

const showMusicDetails = (music: MusicItem) => {
  detailsMusic.value = music
  showDetailsDialog.value = true
  closeContextMenu()
}

const handleFavoritesUpdated = () => {
  void loadFavoriteStatus()
}

const handleMetadataUpdated = () => {
  emit('songs-updated')
}

// Listen for metadata updates from other parts of the app
onMounted(() => {
  loadFavoriteStatus()
  updateQueueStatus()

  window.addEventListener('music-metadata-updated', handleMetadataUpdated as EventListener)
  window.addEventListener('favorites-updated', handleFavoritesUpdated)

  // 监听播放队列变化
  watch(() => playerStore.queue, () => {
    updateQueueStatus()
  }, { deep: true })
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdated as EventListener)
  window.removeEventListener('favorites-updated', handleFavoritesUpdated)
})

// 监听播放队列变化
watch(() => playerStore.queue, updateQueueStatus, { deep: true })
</script>

<style scoped>
.song-list {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  font-size: var(--font-size-sm);
  position: relative;
}

/* 批量操作栏 */
.batch-actions {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

.selection-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.batch-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.batch-btn:hover {
  background: var(--bg-tertiary);
  transform: translateY(-1px);
}

.batch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.batch-btn.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.batch-btn.danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.list-header-row {
  display: flex;
  padding: 0 var(--spacing-md);
  height: 40px;
  align-items: center;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  position: relative;
}

.virtual-spacer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
}

.virtual-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.list-item {
  display: flex;
  padding: 0 var(--spacing-md);
  align-items: center;
  cursor: default;
  transition: background var(--transition-fast);
  box-sizing: border-box;
}

.list-item:hover {
  background: var(--hover-bg);
}

.list-item.playing {
  background: var(--color-primary-alpha-5);
}

.list-item.playing .col-index {
  color: var(--color-primary);
}

.list-item.selected {
  background: var(--color-primary-alpha-10);
  border-left: 3px solid var(--color-primary);
  padding-left: calc(var(--spacing-md) - 3px);
}

/* List columns */
.col-checkbox {
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.col-checkbox input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.col-index {
  width: 40px;
  text-align: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.col-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  min-width: 0;
  padding-right: var(--spacing-md);
}

.col-album {
  width: 20%;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: var(--spacing-md);
}

.col-filename {
  width: calc(20% + 20px);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: var(--spacing-md);
}

.col-duration {
  width: 180px;
  text-align: right;
  color: var(--text-tertiary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: var(--font-size-xs);
}

.duration-line {
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.audio-info-line {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.audio-info-line .separator {
  color: var(--text-tertiary);
  opacity: 0.5;
}

/* Item content */
.item-cover {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-secondary);
  position: relative;
}

.item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: relative;
  z-index: 1;
}

.fallback-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.item-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.item-title-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: 2px;
}

.item-title {
  color: var(--text-color);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.status-icon {
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.status-icon:hover {
  opacity: 1;
}

.status-icon-missing {
  color: var(--color-error, #ef4444);
}

.status-icon-unplayable {
  color: var(--color-warning, #f59e0b);
}

.item-artist {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-tertiary);
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs);
  min-width: 180px;
  z-index: 1000;
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: var(--spacing-xs) 0;
}

.menu-item {
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  transition: background var(--transition-fast);
}

.menu-item:hover {
  background: var(--hover-bg);
}

/* 快捷操作按钮 */
.col-actions {
  flex: 0 0 100px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-xs);
  opacity: 1;
  transition: opacity var(--transition-base);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn.active {
  color: var(--color-primary);
}

.action-btn.active:hover {
  color: var(--color-primary-light);
}
</style>
