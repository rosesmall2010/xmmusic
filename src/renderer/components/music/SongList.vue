<template>
  <div class="song-list" @click="closeContextMenu">
    <div class="list-header-row">
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
          :class="{ playing: currentMusic?.id === music.id }"
          :style="{ height: itemHeight + 'px' }"
        >
          <div class="col-index">
            <Volume2 v-if="currentMusic?.id === music.id" :size="14" class="playing-icon" />
            <span v-else>{{ music.originalIndex + 1 }}</span>
          </div>
          <div class="col-title">
            <div class="item-cover">
               <DefaultCover v-if="!music.coverPath" size="small" />
               <img
                 v-else
                 :src="`local-file://${music.coverPath}`"
                 alt="封面"
                 loading="lazy"
                 @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
               />
               <!-- Fallback if image fails to load but we have a path -->
               <DefaultCover
                 v-if="music.coverPath"
                 class="fallback-cover"
                 size="small"
                 style="display: none;"
               />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { Volume2, Trash2, Heart } from 'lucide-vue-next'
import DefaultCover from '@/components/common/DefaultCover.vue'
import AddToPlaylistModal from '@/components/music/AddToPlaylistModal.vue'
import type { MusicItem } from '@shared/types/music'
import { useElementSize } from '@vueuse/core'

const props = defineProps<{
  songs: MusicItem[]
  showRemoveFromPlaylist?: boolean
}>()

const emit = defineEmits<{
  (e: 'play', music: MusicItem): void
  (e: 'remove-from-playlist', music: MusicItem): void
  (e: 'load-more'): void
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
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: var(--font-size-sm);
  position: relative;
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
  background: var(--active-bg);
}

.list-item.playing .item-title,
.list-item.playing .playing-icon {
  color: var(--color-primary);
}

/* Columns */
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
}

.fallback-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs) 0;
  min-width: 160px;
  z-index: var(--z-dropdown);
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
