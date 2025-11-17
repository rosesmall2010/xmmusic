<template>
  <div class="favorites-list">
    <h2>我的收藏</h2>

    <div class="toolbar">
      <span class="count">共 {{ favorites.length }} 首歌曲</span>
      <button @click="exportFavorites" class="btn-export">导出列表</button>
    </div>

    <div class="music-table">
      <div class="table-header">
        <div class="col-index">#</div>
        <div class="col-title">标题</div>
        <div class="col-artist">艺术家</div>
        <div class="col-album">专辑</div>
        <div class="col-duration">时长</div>
        <div class="col-actions">操作</div>
      </div>

      <div
        v-for="(item, index) in favorites"
        :key="item.id"
        class="table-row"
        @dblclick="playMusic(item)"
      >
        <div class="col-index">{{ index + 1 }}</div>
        <div class="col-title">{{ item.title }}</div>
        <div class="col-artist">{{ item.artist }}</div>
        <div class="col-album">{{ item.album || '-' }}</div>
        <div class="col-duration">{{ formatDuration(item.duration) }}</div>
        <div class="col-actions">
          <button @click="toggleFavorite(item.id)" class="btn-unfavorite">💔</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { MusicItem } from '@shared/types/music'

const playerStore = usePlayerStore()
const favorites = ref<MusicItem[]>([])

onMounted(async () => {
  await loadFavorites()
})

const loadFavorites = async () => {
  favorites.value = await window.electronAPI.getFavorites()
}

const playMusic = (music: MusicItem) => {
  playerStore.playMusic(music)
}

const toggleFavorite = async (id: number) => {
  await window.electronAPI.toggleFavorite(id)
  await loadFavorites()
}

const exportFavorites = () => {
  // TODO: 实现导出功能
  console.log('导出收藏列表')
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.favorites-list {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

h2 {
  color: var(--text-color);
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--sidebar-bg);
  border-radius: 4px;
}

.count {
  color: var(--text-color);
  font-size: 14px;
}

.btn-export {
  background: #ff4757;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-export:hover {
  background: #ff6b7a;
}

.music-table {
  flex: 1;
  overflow-y: auto;
}

.table-header,
.table-row {
  display: flex;
  align-items: center;
  padding: 12px;
}

.table-header {
  background: var(--sidebar-bg);
  font-weight: bold;
  color: var(--text-color);
  position: sticky;
  top: 0;
  z-index: 1;
}

.table-row {
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  color: var(--text-color);
}

.table-row:hover {
  background: var(--hover-bg);
}

.col-index {
  width: 50px;
  text-align: center;
}

.col-title {
  flex: 2;
}

.col-artist,
.col-album {
  flex: 1.5;
}

.col-duration {
  width: 80px;
  text-align: right;
}

.col-actions {
  width: 80px;
  text-align: center;
}

.btn-unfavorite {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}

.btn-unfavorite:hover {
  transform: scale(1.2);
}
</style>
