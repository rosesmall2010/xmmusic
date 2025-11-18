<template>
  <div class="play-history">
    <h2>最近播放</h2>

    <div class="toolbar">
      <span class="count">最近 {{ history.length }} 首</span>
      <button @click="clearHistory" class="btn-clear">清空历史</button>
    </div>

    <div class="music-table">
      <div class="table-header">
        <div class="col-index">#</div>
        <div class="col-title">标题</div>
        <div class="col-artist">艺术家</div>
        <div class="col-album">专辑</div>
        <div class="col-duration">时长</div>
        <div class="col-played">播放次数</div>
      </div>

      <div class="table-body">
        <div
          v-for="(item, index) in history"
          :key="item.id"
          class="table-row"
          @dblclick="playMusic(item)"
        >
          <div class="col-index">{{ index + 1 }}</div>
          <div class="col-title">{{ item.title }}</div>
          <div class="col-artist">{{ item.artist }}</div>
          <div class="col-album">{{ item.album || '-' }}</div>
          <div class="col-duration">{{ formatDuration(item.duration) }}</div>
          <div class="col-played">{{ item.playCount }}</div>
        </div>
        <div v-if="history.length === 0" class="empty-state">暂无最近播放记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { MusicItem } from '@shared/types/music'

const playerStore = usePlayerStore()
const history = ref<MusicItem[]>([])

onMounted(async () => {
  await loadHistory()
})

const loadHistory = async () => {
  history.value = await window.electronAPI.getPlayHistory()
}

const playMusic = (music: MusicItem) => {
  playerStore.playMusic(music)
}

const clearHistory = async () => {
  if (confirm('确定要清空播放历史吗？')) {
    await window.electronAPI.clearPlayHistory()
    await loadHistory()
  }
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.play-history {
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

.btn-clear {
  background: #f44336;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-clear:hover {
  background: #da190b;
  opacity: 0.9;
}

.music-table {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
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
}

.table-body {
  flex: 1;
  overflow-y: auto;
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

.col-duration,
.col-played {
  width: 80px;
  text-align: right;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: var(--secondary-text-color);
}
</style>
