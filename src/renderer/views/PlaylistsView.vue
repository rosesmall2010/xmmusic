<template>
  <div class="playlists-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">我的歌单</h1>
        <div class="stats">{{ playlists.length }} 个歌单</div>
      </div>
      <div class="header-actions">
        <button class="btn-primary" @click="showCreateModal = true">
          新建歌单
        </button>
      </div>
    </div>

    <div class="content">
      <draggable
        v-model="playlists"
        class="playlist-grid"
        item-key="id"
        @end="handleDragEnd"
        v-if="playlists.length > 0"
      >
        <template #item="{ element: playlist }">
          <div
            class="playlist-card"
            @click="openPlaylist(playlist.id)"
          >
            <div class="cover-container">
              <img
                v-if="playlist.firstSongCover"
                :src="playlist.firstSongCover"
                class="cover-image"
                @error="handleImageError(playlist)"
              />
              <div v-else class="cover-placeholder">
                <Music :size="48" />
              </div>
              <div class="play-overlay">
                <Play :size="32" />
              </div>
            </div>
            <div class="playlist-info">
              <h3 class="playlist-name">{{ playlist.name }}</h3>
              <p class="playlist-count">{{ playlist.songCount }} 首歌曲</p>
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="playlists.length === 0" class="empty-state">
        <div class="empty-placeholder">
          <Heart :size="48" class="icon" />
          <p>还没有创建歌单</p>
          <button class="btn-link" @click="showCreateModal = true">创建一个吧</button>
        </div>
      </div>
    </div>

    <CreatePlaylistModal
      v-model="showCreateModal"
      @confirm="handleCreatePlaylist"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Play, Heart, Music } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import CreatePlaylistModal from '@/components/music/CreatePlaylistModal.vue'

const router = useRouter()
const playlists = ref<any[]>([])
const showCreateModal = ref(false)

onMounted(async () => {
  await loadPlaylists()
})

const loadPlaylists = async () => {
  try {
    const playlistData = await window.electronAPI.getPlaylists()
    // 为每个歌单加载第一首歌的封面
    playlists.value = await Promise.all(
      playlistData.map(async (playlist) => {
        try {
          const songs = await window.electronAPI.getPlaylistSongs(playlist.id)
          if (songs.length > 0 && songs[0].coverPath) {
            playlist.firstSongCover = `local-file://${songs[0].coverPath}`
          }
        } catch (error) {
          console.error(`Failed to load cover for playlist ${playlist.id}:`, error)
        }
        return playlist
      })
    )
  } catch (error) {
    console.error('Failed to load playlists:', error)
  }
}

const handleCreatePlaylist = async (name: string) => {
  try {
    await window.electronAPI.createPlaylist(name)
    await loadPlaylists()
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('Failed to create playlist:', error)
  }
}

const openPlaylist = (id: string) => {
  router.push(`/playlist/${id}`)
}

const handleImageError = (playlist: any) => {
  // 封面加载失败时移除封面引用
  playlist.firstSongCover = null
}

const handleDragEnd = async () => {
  try {
    const playlistIds = playlists.value.map(p => p.id)
    await window.electronAPI.updatePlaylistOrder(playlistIds)
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('Failed to update playlist order:', error)
  }
}
</script>

<style scoped>
.playlists-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.stats {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.btn-primary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-primary:hover {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl);
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--spacing-xl);
}

.playlist-card {
  cursor: pointer;
  transition: transform var(--transition-base);
}

.playlist-card:hover {
  transform: translateY(-4px);
}

.cover-container {
  width: 100%;
  aspect-ratio: 1;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  font-size: 4rem;
  opacity: 0.5;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: white;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.playlist-card:hover .play-overlay {
  opacity: 1;
}

.playlist-info {
  text-align: center;
}

.playlist-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-count {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-placeholder {
  text-align: center;
  color: var(--text-tertiary);
}

.empty-placeholder .icon {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
  display: block;
  color: var(--text-quaternary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  text-decoration: underline;
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-base);
}
</style>
