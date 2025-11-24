<template>
  <div class="song-list" @click="closeContextMenu">
    <!-- 批量操作栏 -->
    <div v-if="selectionMode && selectedSongs.size > 0" class="batch-actions">
      <div class="selection-info">
        <Check :size="16" />
        已选择 {{ selectedSongs.size }} 首
      </div>
      <button class="batch-btn" @click="handleBatchAddToPlaylist">
        <Music :size="16" />
        添加到歌单
      </button>
      <button v-if="showRemoveFromPlaylist" class="batch-btn danger" @click="handleBatchRemove">
        <Trash2 :size="16" />
        批量删除
      </button>
      <button class="batch-btn" @click="cancelSelection">
        <X :size="16" />
        取消
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
      <div class="col-title">标题</div>
      <div class="col-album">专辑</div>
      <div class="col-duration">时长</div>
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
                   alt="封面"
                   loading="lazy"
                   @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                 />
               </template>
            </div>
            <div class="item-info">
              <div class="item-title" :title="music.title">{{ music.title }}</div>
              <div class="item-artist" :title="music.artist">{{ music.artist }}</div>
            </div>
          </div>
          <div class="col-album" :title="music.album || ''">{{ music.album || '-' }}</div>
          <div class="col-duration">{{ formatDuration(music.duration) }}</div>
        </div>
      </div>

      <div v-if="songs.length === 0" class="empty-state">
        <slot name="empty">
          <p>暂无歌曲</p>
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
        播放
      </div>
      <div class="menu-item" @click="openAddToPlaylist(contextMenu.music!)">
        <span class="icon">➕</span>
        添加到歌单
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="enableSelectionMode">
        <Check :size="16" class="icon" />
        批量操作
      </div>
      <div
        v-if="showRemoveFromPlaylist"
        class="menu-item delete"
        @click="handleRemoveFromPlaylist(contextMenu.music!)"
      >
        <Trash2 :size="16" class="icon" />
        从歌单移除
      </div>
      <div class="menu-item" @click="toggleFavorite(contextMenu.music!)">
        <Heart :size="16" :fill="contextMenu.isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': contextMenu.isFavorite }" class="icon" />
        {{ contextMenu.isFavorite ? '取消喜欢' : '喜欢' }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { getCoverUrl } from '@/utils/media'
import { Volume2, Trash2, Heart, Music, Check, X } from 'lucide-vue-next'
import DefaultCover from '@/components/common/DefaultCover.vue'
import AddToPlaylistModal from '@/components/music/AddToPlaylistModal.vue'
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
  return props.songs.slice(visibleRange.value.start, visibleRange.value.end).map((song, index) => ({
    ...song,
    originalIndex: visibleRange.value.start + index
  }))
})

const totalHeight = computed(() => props.songs.length * itemHeight)
const offsetY = computed(() => visibleRange.value.start * itemHeight)

// Context Menu & Modals
const showAddToPlaylist = ref(false)
const selectedMusic = ref<MusicItem | null>(null)

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
const showBatchAddToPlaylist = ref(false)

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
const handleBatchAddToPlaylist = () => {
  if (selectedSongs.value.size === 0) return
  showBatchAddToPlaylist.value = true
}

// 批量删除
const handleBatchRemove = async () => {
  if (!props.playlistId || selectedSongs.value.size === 0) return

  try {
    const filePaths = Array.from(selectedSongs.value)
    const result = await window.electronAPI.batchRemoveFromPlaylist(props.playlistId, filePaths)
    console.log(`Removed ${result.removed} songs`)
    cancelSelection()
    emit('songs-updated')
    window.dispatchEvent(new CustomEvent('song-added-to-playlist'))
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
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.visible = true

  try {
    contextMenu.isFavorite = await window.electronAPI.isFileFavorite(music.filePath)
  } catch (e) {
    console.error('Failed to check favorite status', e)
  }
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
  if (confirm(`确定要将 "${music.title}" 从歌单中移除吗？`)) {
    emit('remove-from-playlist', music)
  }
  closeContextMenu()
}

const toggleFavorite = async (music: MusicItem) => {
  try {
    await window.electronAPI.toggleFavorite(music.filePath)
  } catch (e) {
    console.error('Failed to toggle favorite', e)
  }
  closeContextMenu()
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
  width: 25%;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: var(--spacing-md);
}

.col-duration {
  width: 60px;
  text-align: right;
  color: var(--text-tertiary);
  flex-shrink: 0;
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

.item-title {
  color: var(--text-color);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
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
</style>
