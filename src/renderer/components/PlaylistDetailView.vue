<template>
  <div class="playlist-detail" v-if="playlist">
    <div class="header">
      <div class="info">
        <h2>{{ playlist.name }}</h2>
        <p>{{ playlist.description || '暂无描述' }}</p>
        <span>{{ songs.length }} 首歌曲</span>
      </div>
      <div class="actions">
        <button class="btn-secondary" @click="refresh">刷新</button>
      </div>
    </div>

    <div class="song-list">
      <div v-for="song in songs" :key="song.id" class="song-item">
        <div class="song-title">{{ song.title }}</div>
        <div class="song-artist">{{ song.artist }}</div>
        <div class="song-duration">{{ formatDuration(song.duration) }}</div>
      </div>
      <div v-if="songs.length === 0" class="empty">该歌单暂无歌曲</div>
    </div>
  </div>
  <div v-else class="empty-state">
    请选择左侧歌单查看内容
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMusicStore } from '@/stores/music'
import type { Playlist, MusicItem } from '@shared/types/music'

const musicStore = useMusicStore()
const playlist = ref<Playlist | null>(null)
const songs = ref<MusicItem[]>([])

const loadPlaylist = async () => {
  if (musicStore.selectedPlaylistId == null) {
    playlist.value = null
    songs.value = []
    return
  }
  const list = musicStore.playlists.find(p => p.id === musicStore.selectedPlaylistId)
  playlist.value = list || null
  songs.value = await window.electronAPI.getPlaylistSongs(musicStore.selectedPlaylistId)
}

const refresh = async () => {
  await musicStore.loadPlaylists()
  await loadPlaylist()
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

watch(() => musicStore.selectedPlaylistId, loadPlaylist)
onMounted(loadPlaylist)
</script>

<style scoped>
.playlist-detail {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.info h2 {
  margin: 0;
  color: var(--text-color);
}

.info p {
  margin: 4px 0;
  color: var(--secondary-text-color);
}

.song-list {
  flex: 1;
  overflow-y: auto;
}

.song-item {
  display: grid;
  grid-template-columns: 2fr 1fr 80px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.song-title {
  color: var(--text-color);
}

.song-artist,
.song-duration {
  color: var(--secondary-text-color);
}

.empty,
.empty-state {
  text-align: center;
  color: var(--secondary-text-color);
  padding: 40px 0;
}
</style>
