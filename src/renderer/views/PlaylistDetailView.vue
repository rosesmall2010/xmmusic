<template>
  <div class="playlist-detail-view">
    <div class="page-header" v-if="playlist">
      <div class="header-content">
        <div class="playlist-cover">
          <img
            v-if="playlistCover"
            :src="playlistCover"
            class="cover-image"
            @error="handleCoverError"
          />
          <Music v-else :size="64" class="icon" />
        </div>
        <div class="playlist-info">
          <h1 class="page-title">{{ playlist.name }}</h1>
          <div class="stats">
            <span>{{ songs.length }} 首歌曲</span>
            <span class="separator">•</span>
            <span>创建于 {{ formatDate(playlist.createdAt) }}</span>
          </div>
          <div class="actions">
            <button class="btn-primary" @click="playAll" :disabled="totalSongs === 0">
              播放全部
            </button>
            <button class="btn-secondary" @click="clearPlaylist" :disabled="totalSongs === 0">
              清空歌单
            </button>
            <button class="btn-secondary" @click="openEditModal">
              编辑信息
            </button>
            <button class="btn-secondary" @click="deletePlaylist">
              删除歌单
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="content">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-container">
          <div class="loading-spinner"></div>
          <p>加载中... ({{ songs.length }} / {{ totalSongs }})</p>
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
              <p>歌单还是空的</p>
              <p class="sub-text">去添加一些歌曲吧</p>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import CreatePlaylistModal from '@/components/music/CreatePlaylistModal.vue'
import type { MusicItem } from '@shared/types/music'
import { Music } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const playlist = ref<any>(null)
const songs = ref<MusicItem[]>([])
const totalSongs = ref(0)
const loading = ref(false)
const showEditModal = ref(false)
const PAGE_SIZE = 50

let currentOffset = 0
let hasMore = true

onMounted(async () => {
  await loadPlaylist()
  // 监听元数据更新事件
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  // 监听歌曲添加到歌单事件，刷新当前歌单
  window.addEventListener('song-added-to-playlist', handleSongAddedToPlaylist)
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.removeEventListener('song-added-to-playlist', handleSongAddedToPlaylist)
})

// 处理歌曲添加到歌单事件
const handleSongAddedToPlaylist = () => {
  // 重置分页状态并重新加载
  currentOffset = 0
  hasMore = true
  loadPlaylist()
}

const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail as MusicItem
  const index = songs.value.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    songs.value[index] = { ...songs.value[index], ...updatedMusic }
  }
}

// 监听路由参数变化，切换歌单时重新加载
watch(() => route.params.id as string, async (newId: string, oldId: string) => {
  if (newId !== oldId) {
    // 重置数据防止旧数据残留
    playlist.value = null
    songs.value = []
    totalSongs.value = 0
    currentOffset = 0
    hasMore = true
    await loadPlaylist()
  }
})

let currentLoadId = 0 // 用于追踪当前的加载任务，防止切换歌单时数据错乱

const loadPlaylist = async () => {
  const id = route.params.id as string
  if (!id) return

  const playlistId = Number(id)

  // 增加加载ID，立即使之前的加载任务失效
  currentLoadId++
  const thisLoadId = currentLoadId

  try {
    // 首次加载：获取歌单详情
    if (currentOffset === 0) {
      loading.value = true
      songs.value = [] // 清空列表

      // 获取歌单详情
      const playlists = await window.electronAPI.getPlaylists()

      // 如果任务已过时，直接返回
      if (thisLoadId !== currentLoadId) return

      playlist.value = playlists.find((p: any) => p.id === playlistId)

      if (!playlist.value) {
        loading.value = false
        return
      }

      // 获取总数
      totalSongs.value = await window.electronAPI.getPlaylistSongsCount(playlistId)
    }

    // 如果没有更多数据或正在加载，直接返回
    if (!hasMore || loading.value) return

    loading.value = true

    // 分页加载歌曲
    const newSongs = await window.electronAPI.getPlaylistSongsPaginated(playlistId, currentOffset, PAGE_SIZE)

    // 如果任务已过时，直接返回
    if (thisLoadId !== currentLoadId) return

    if (newSongs.length < PAGE_SIZE) {
      hasMore = false
    }

    // 追加到列表
    songs.value = [...songs.value, ...newSongs]
    currentOffset += newSongs.length
  } catch (error) {
    console.error('加载歌单失败:', error)
  } finally {
    loading.value = false
  }
}

const playMusic = async (music: MusicItem) => {
  const newQueue = [...songs.value]
  playerStore.queue = newQueue
  const index = newQueue.findIndex(m => m.id === music.id)
  playerStore.setCurrentQueueIndex(index)
  await play(music)
}

const playAll = async () => {
  if (totalSongs.value === 0) return

  // 如果还有未加载的歌曲，先全部加载
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
    await loadPlaylist()
  } catch (error) {
    console.error('Failed to rename playlist:', error)
  }
}

const removeSong = async (music: MusicItem) => {
  if (!playlist.value) return
  try {
    await window.electronAPI.removeFromPlaylistByPath(playlist.value.id, music.id)
    await loadPlaylist()
  } catch (error) {
    console.error('Failed to remove song:', error)
  }
}

const clearPlaylist = async () => {
  if (!playlist.value || totalSongs.value === 0) return

  if (!confirm(`确定要清空歌单"${playlist.value.name}"吗？这将删除 ${totalSongs.value} 首歌曲。`)) {
    return
  }

  try {
    await window.electronAPI.clearPlaylist(playlist.value.id)
    // 重新加载
    songs.value = []
    totalSongs.value = 0
    currentOffset = 0
    hasMore = true
    await loadPlaylist()
  } catch (error) {
    console.error('清空歌单失败:', error)
  }
}

const deletePlaylist = async () => {
  if (!confirm('确定要删除这个歌单吗？')) return

  try {
    await window.electronAPI.deletePlaylist(playlist.value.id)
    router.push('/playlists')
  } catch (error) {
    console.error('Failed to delete playlist:', error)
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString()
}

const playlistCover = computed(() => {
  if (songs.value.length > 0) {
    const firstSongWithCover = songs.value.find(s => s.coverPath)
    if (firstSongWithCover) {
      return `local-file://${firstSongWithCover.coverPath}`
    }
  }
  return null
})

const handleCoverError = (e: Event) => {
  const target = e.target as HTMLImageElement
  target.style.display = 'none'
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

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
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

/* 加载状态样式 */
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
</style>
