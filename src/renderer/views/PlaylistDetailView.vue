<template>
  <div class="playlist-detail-view">
    <div class="page-header" v-if="playlist">
      <div class="header-content">
        <div class="playlist-cover">
          <span class="icon">🎵</span>
        </div>
        <div class="playlist-info">
          <h1 class="page-title">{{ playlist.name }}</h1>
          <div class="stats">
            <span>{{ songs.length }} 首歌曲</span>
            <span class="separator">•</span>
            <span>创建于 {{ formatDate(playlist.createdAt) }}</span>
          </div>
          <div class="actions">
            <button class="btn-primary" @click="playAll" :disabled="songs.length === 0">
              播放全部
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
      <SongList
        :songs="songs"
        :show-remove-from-playlist="true"
        @play="playMusic"
        @remove-from-playlist="removeSong"
      >
        <template #empty>
          <div class="empty-placeholder">
            <span class="icon">🎵</span>
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import SongList from '@/components/music/SongList.vue'
import CreatePlaylistModal from '@/components/music/CreatePlaylistModal.vue'
import type { MusicItem } from '@shared/types/music'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const playlist = ref<any>(null)
const songs = ref<MusicItem[]>([])
const showEditModal = ref(false)

onMounted(async () => {
  await loadPlaylist()
})

const loadPlaylist = async () => {
  const id = route.params.id as string
  if (!id) return

  try {
    // 获取歌单详情
    const playlists = await window.electronAPI.getPlaylists()
    playlist.value = playlists.find((p: any) => p.id === id)

    if (playlist.value) {
      // 获取歌单歌曲
      songs.value = await window.electronAPI.getPlaylistMusic(id)
    }
  } catch (error) {
    console.error('Failed to load playlist:', error)
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
  if (songs.value.length === 0) return
  playerStore.queue = [...songs.value]
  playerStore.setCurrentQueueIndex(0)
  await play(songs.value[0])
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
    await window.electronAPI.removeFromPlaylistByPath(playlist.value.id, music.filePath)
    await loadPlaylist()
  } catch (error) {
    console.error('Failed to remove song:', error)
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
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
  display: block;
  color: var(--text-quaternary);
}

.sub-text {
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}
</style>
