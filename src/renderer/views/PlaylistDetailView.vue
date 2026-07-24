<template>
  <div class="playlist-detail-view">
    <div class="page-header" v-if="playlist">
      <div class="header-content">
        <div class="playlist-cover">
          <img
            v-if="playlistCover"
            :key="playlistCover"
            :src="playlistCover"
            class="cover-image"
            @error="handleCoverError"
          />
          <Music v-else :size="64" class="icon" />
        </div>
        <div class="playlist-info">
          <h1 class="page-title">{{ playlist.name }}</h1>
          <div class="stats">
            <span>{{ $t('playlist.songs', { count: totalSongs || songs.length }) }}</span>
            <span class="separator">•</span>
            <span>{{ $t('playlist.createdAt') }} {{ formatDate(playlist.createdAt) }}</span>
          </div>
          <div class="actions">
            <button class="btn-primary" @click="playAll" :disabled="totalSongs === 0">
              {{ $t('player.playAll') }}
            </button>
            <button class="btn-secondary" @click="showCoverModal = true">
              {{ $t('playlist.setCover') }}
            </button>
            <button class="btn-secondary" @click="copySongsToFolder" :disabled="totalSongs === 0 || copying">
              {{ $t('playlist.copyToFolder') }}
            </button>
            <button class="btn-secondary" @click="clearPlaylist" :disabled="totalSongs === 0">
              {{ $t('playlist.clear') }}
            </button>
            <button class="btn-secondary" @click="openEditModal">
              {{ $t('playlist.edit') }}
            </button>
            <button class="btn-secondary" @click="deletePlaylist">
              {{ $t('playlist.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="content">
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>{{ $t('common.loading') }} ({{ songs.length }} / {{ totalSongs }})</p>
      </div>

      <SongList
        v-else-if="playlist"
        :songs="songs"
        :show-remove-from-playlist="true"
        :playlist-id="playlist.id"
        @play="playMusic"
        @remove-from-playlist="removeSong"
        @songs-updated="loadPlaylist"
      >
        <template #empty>
          <div class="empty-placeholder">
            <Music :size="64" class="icon" />
            <p>{{ $t('playlist.empty') }}</p>
            <p class="sub-text">{{ $t('playlist.addSongsHint') }}</p>
          </div>
        </template>
      </SongList>
    </div>

    <CreatePlaylistModal
      v-model="showEditModal"
      :initial-name="playlist?.name"
      :is-edit="true"
      @confirm="handleRename"
    />

    <SetPlaylistCoverModal
      v-if="playlist"
      :show="showCoverModal"
      :playlist-id="playlist.id"
      @close="showCoverModal = false"
      @updated="handleCoverUpdated"
    />

    <div v-if="copying" class="copy-progress-overlay">
      <div class="copy-progress-panel">
        <div class="progress-text">{{ $t('playlist.copying') }}</div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: copyPercent + '%' }"></div>
        </div>
        <div class="progress-info">
          {{ copyProgress.current }} / {{ copyProgress.total }}
          <span v-if="copyProgress.fileName"> · {{ copyProgress.fileName }}</span>
        </div>
        <div class="progress-stats">
          {{ $t('playlist.copyStats', {
            success: copyProgress.success,
            failed: copyProgress.failed
          }) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import CreatePlaylistModal from '@/components/music/CreatePlaylistModal.vue'
import SetPlaylistCoverModal from '@/components/music/SetPlaylistCoverModal.vue'
import type { MusicItem } from '@shared/types/music'
import { Music } from 'lucide-vue-next'
import { toLocalFileUrl } from '@/utils/media'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const playlist = ref<any>(null)
const songs = ref<MusicItem[]>([])
const totalSongs = ref(0)
const loading = ref(false)
const showEditModal = ref(false)
const showCoverModal = ref(false)
const coverBroken = ref(false)
const PAGE_SIZE = 50

const copying = ref(false)
const copyProgress = ref({
  current: 0,
  total: 0,
  fileName: '',
  success: 0,
  failed: 0,
  skipped: 0
})
const copyPercent = computed(() => {
  if (!copyProgress.value.total) return 0
  return Math.min(100, Math.round((copyProgress.value.current / copyProgress.value.total) * 100))
})

let currentOffset = 0
let hasMore = true
let exportProgressHandler: any = null

onMounted(async () => {
  await loadPlaylist()
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.addEventListener('song-added-to-playlist', handleSongAddedToPlaylist)
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.removeEventListener('song-added-to-playlist', handleSongAddedToPlaylist)
  if (exportProgressHandler) {
    window.electronAPI.offExportMusicProgress(exportProgressHandler)
    exportProgressHandler = null
  }
})

const handleSongAddedToPlaylist = () => {
  currentOffset = 0
  hasMore = true
  loadPlaylist()
}

const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail as MusicItem
  if (!updatedMusic || !updatedMusic.id) return

  const index = songs.value.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    const updatedList = [...songs.value]
    updatedList[index] = { ...updatedList[index], ...updatedMusic }
    songs.value = updatedList
  }
}

watch(() => route.params.id as string, async (newId: string, oldId: string) => {
  if (newId !== oldId) {
    playlist.value = null
    songs.value = []
    totalSongs.value = 0
    currentOffset = 0
    hasMore = true
    coverBroken.value = false
    await loadPlaylist()
  }
})

let currentLoadId = 0

const loadPlaylist = async () => {
  const id = route.params.id as string
  if (!id) return

  const playlistId = Number(id)
  currentLoadId++
  const thisLoadId = currentLoadId

  try {
    if (currentOffset === 0) {
      loading.value = true
      songs.value = []
      hasMore = true
      coverBroken.value = false

      const playlists = await window.electronAPI.getPlaylists()
      if (thisLoadId !== currentLoadId) return

      playlist.value = playlists.find((p: any) => p.id === playlistId)

      if (!playlist.value) {
        loading.value = false
        hasMore = false
        return
      }

      totalSongs.value = await window.electronAPI.getPlaylistSongsCount(playlistId)

      if (totalSongs.value === 0) {
        loading.value = false
        hasMore = false
        return
      }

      loading.value = false
    }

    if (!hasMore || loading.value) return

    loading.value = true

    const newSongs = await window.electronAPI.getPlaylistSongsPaginated(playlistId, currentOffset, PAGE_SIZE)
    if (thisLoadId !== currentLoadId) return

    if (newSongs.length < PAGE_SIZE) {
      hasMore = false
    }

    songs.value = [...songs.value, ...newSongs]
    currentOffset += newSongs.length
  } catch (error) {
    console.error('加载歌单失败:', error)
  } finally {
    loading.value = false
  }
}

const playMusic = async (music: MusicItem) => {
  const existingIndex = playerStore.queue.findIndex(m => m.id === music.id)

  if (existingIndex >= 0) {
    playerStore.setCurrentQueueIndex(existingIndex)
    await play(music)
  } else {
    playerStore.addToQueue(music)
    const newIndex = playerStore.queue.length - 1
    playerStore.setCurrentQueueIndex(newIndex)
    music.inQueue = true
    await play(music)
  }
}

const playAll = async () => {
  if (totalSongs.value === 0) return

  if (hasMore) {
    loading.value = true
    try {
      const allSongs = await window.electronAPI.getPlaylistSongs(Number(route.params.id))
      playerStore.queue = allSongs
      playerStore.setCurrentQueueIndex(0)
      await play(allSongs[0])
    } finally {
      loading.value = false
    }
  } else {
    playerStore.queue = [...songs.value]
    playerStore.setCurrentQueueIndex(0)
    await play(songs.value[0])
  }
}

const openEditModal = () => {
  showEditModal.value = true
}

const handleRename = async (newName: string) => {
  if (!playlist.value) return
  try {
    await window.electronAPI.updatePlaylist(playlist.value.id, { name: newName })
    currentOffset = 0
    hasMore = true
    await loadPlaylist()
  } catch (error) {
    console.error('Failed to rename playlist:', error)
  }
}

const handleCoverUpdated = (coverPath: string | null) => {
  if (playlist.value) {
    playlist.value = { ...playlist.value, coverPath }
  }
  coverBroken.value = false
  window.dispatchEvent(new CustomEvent('playlist-updated'))
}

const removeSong = async (music: MusicItem) => {
  if (!playlist.value) return
  try {
    await window.electronAPI.removeFromPlaylistByPath(playlist.value.id, music.id)
    currentOffset = 0
    hasMore = true
    await loadPlaylist()
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('Failed to remove song:', error)
  }
}

const clearPlaylist = async () => {
  if (!playlist.value || totalSongs.value === 0) return

  if (!confirm(t('playlist.clearConfirm', { name: playlist.value.name, count: totalSongs.value }))) {
    return
  }

  try {
    await window.electronAPI.clearPlaylist(playlist.value.id)
    songs.value = []
    totalSongs.value = 0
    currentOffset = 0
    hasMore = true
    await loadPlaylist()
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('清空歌单失败:', error)
  }
}

const deletePlaylist = async () => {
  if (!confirm(t('playlist.deleteConfirm', { name: playlist.value?.name || '' }))) return

  try {
    await window.electronAPI.deletePlaylist(playlist.value.id)
    router.push('/playlists')
  } catch (error) {
    console.error('Failed to delete playlist:', error)
  }
}

const copySongsToFolder = async () => {
  if (!playlist.value || totalSongs.value === 0 || copying.value) return

  try {
    const targetDir = await window.electronAPI.selectFolder(t('playlist.selectCopyFolder'))
    if (!targetDir) return

    let musicIds = songs.value.map(s => s.id)
    if (hasMore || musicIds.length < totalSongs.value) {
      const allSongs = await window.electronAPI.getPlaylistSongs(playlist.value.id)
      musicIds = allSongs.map((s: MusicItem) => s.id)
    }

    if (musicIds.length === 0) {
      alert(t('playlist.copyEmpty'))
      return
    }

    copying.value = true
    copyProgress.value = {
      current: 0,
      total: musicIds.length,
      fileName: '',
      success: 0,
      failed: 0,
      skipped: 0
    }

    exportProgressHandler = window.electronAPI.onExportMusicProgress((progress) => {
      copyProgress.value = { ...progress }
    })

    const result = await window.electronAPI.exportMusicFiles(musicIds, {
      targetDir,
      organizeBy: 'none',
      conflictAction: 'overwrite'
    })

    if (exportProgressHandler) {
      window.electronAPI.offExportMusicProgress(exportProgressHandler)
      exportProgressHandler = null
    }

    copying.value = false

    if (!result) return

    alert(t('playlist.copyComplete', {
      success: result.success,
      failed: result.failed,
      dir: targetDir
    }))
  } catch (error: any) {
    console.error('复制歌单歌曲失败:', error)
    if (exportProgressHandler) {
      window.electronAPI.offExportMusicProgress(exportProgressHandler)
      exportProgressHandler = null
    }
    copying.value = false
    alert(t('playlist.copyError') + ': ' + (error?.message || error))
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString()
}

const playlistCover = computed(() => {
  if (coverBroken.value) return null
  if (playlist.value?.coverPath) {
    return toLocalFileUrl(playlist.value.coverPath)
  }
  if (songs.value.length > 0) {
    const firstSongWithCover = songs.value.find(s => s.coverPath)
    if (firstSongWithCover?.coverPath) {
      return toLocalFileUrl(firstSongWithCover.coverPath)
    }
  }
  return null
})

const handleCoverError = () => {
  coverBroken.value = true
}
</script>

<style scoped>
.playlist-detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
}

.header-content {
  display: flex;
  gap: var(--spacing-xl);
}

.playlist-cover {
  width: 160px;
  height: 160px;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  position: relative;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-sm);
}

.stats {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.separator {
  color: var(--text-quaternary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.btn-primary,
.btn-secondary {
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--radius-base);
  font-size: var(--font-size-base);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--hover-bg);
}

.content {
  flex: 1;
  overflow: hidden;
}

.empty-placeholder {
  text-align: center;
  color: var(--text-tertiary);
  margin-top: var(--spacing-2xl);
}

.empty-placeholder .icon {
  margin-bottom: var(--spacing-md);
  color: var(--text-quaternary);
}

.sub-text {
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
  min-height: 300px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--spacing-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container p {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.copy-progress-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.copy-progress-panel {
  width: min(420px, 90vw);
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.progress-text {
  font-size: var(--font-size-base);
  font-weight: 500;
  margin-bottom: var(--spacing-md);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #31c48d, #0e9f6e);
  transition: width 0.2s ease;
}

.progress-info,
.progress-stats {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--spacing-xs);
  word-break: break-all;
}
</style>
