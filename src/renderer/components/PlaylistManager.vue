<template>
  <div class="playlist-manager">
    <div class="header">
      <h2>我的歌单</h2>
      <div class="header-actions">
        <button @click="createPlaylist" class="btn-create">+ 创建歌单</button>
        <button @click="importPlaylist" class="btn-secondary">导入 JSON</button>
      </div>
    </div>

    <div class="playlist-grid">
      <div
        v-for="playlist in playlists"
        :key="playlist.id"
        class="playlist-card"
        @click="openPlaylist(playlist)"
      >
        <div class="playlist-cover">
          <img
            v-if="playlist.coverPath"
            :src="playlist.coverPath"
            alt="封面"
            @error="(e: any) => e.target.style.display = 'none'"
          />
          <DefaultCover v-else size="large" mode="fill" />
          <div class="playlist-overlay">
            <button @click.stop="playPlaylist(playlist)" class="btn-play">▶</button>
          </div>
        </div>
        <div class="playlist-info">
          <h3>{{ playlist.name }}</h3>
          <p>{{ playlist.songCount }} 首歌曲</p>
        </div>
        <div class="playlist-actions">
          <button @click.stop="editPlaylist(playlist)">✏️</button>
          <button @click.stop="deletePlaylist(playlist.id)">🗑️</button>
          <button @click.stop="exportPlaylist(playlist)">⬇️</button>
        </div>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <div v-if="showDialog" class="dialog-overlay" @click.self="showDialog = false">
      <div class="dialog">
        <h3>{{ editingPlaylist.id ? '编辑歌单' : '创建歌单' }}</h3>

        <div class="form-group">
          <label>歌单名称</label>
          <input v-model="editingPlaylist.name" placeholder="输入歌单名称" />
        </div>

        <div class="form-group">
          <label>描述（可选）</label>
          <textarea v-model="editingPlaylist.description" placeholder="描述这个歌单" rows="3"></textarea>
        </div>

        <div class="dialog-actions">
          <button @click="savePlaylist" class="btn-primary">保存</button>
          <button @click="showDialog = false" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Playlist } from '@shared/types/music'
import DefaultCover from './DefaultCover.vue'
import { useMusicStore } from '@/stores/music'

const playlists = ref<Playlist[]>([])
const musicStore = useMusicStore()
const showDialog = ref(false)
const editingPlaylist = ref<Partial<Playlist>>({
  name: '',
  description: ''
})

onMounted(async () => {
  await loadPlaylists()
})

const loadPlaylists = async () => {
  playlists.value = await window.electronAPI.getPlaylists()
  musicStore.loadPlaylists()
}

const createPlaylist = () => {
  editingPlaylist.value = { name: '', description: '' }
  showDialog.value = true
}

const editPlaylist = (playlist: Playlist) => {
  editingPlaylist.value = { ...playlist }
  showDialog.value = true
}

const savePlaylist = async () => {
  if (!editingPlaylist.value.name) {
    alert('请输入歌单名称')
    return
  }

  if (editingPlaylist.value.id) {
    await window.electronAPI.updatePlaylist(editingPlaylist.value.id, editingPlaylist.value)
  } else {
    await window.electronAPI.createPlaylist(editingPlaylist.value.name, editingPlaylist.value.description)
  }

  await loadPlaylists()
  showDialog.value = false
}

const deletePlaylist = async (id: number) => {
  if (confirm('确定要删除这个歌单吗？')) {
    await window.electronAPI.deletePlaylist(id)
    await loadPlaylists()
  }
}

const exportPlaylist = async (playlist: Playlist) => {
  try {
    const filePath = await window.electronAPI.exportPlaylistJSON(playlist.id)
    if (filePath) {
      alert(`已导出到：\n${filePath}`)
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    alert(`导出失败：${error.message || error}`)
  }
}

const importPlaylist = async () => {
  try {
    const result = await window.electronAPI.importPlaylistJSON()
    if (result) {
      await loadPlaylists()
      musicStore.loadPlaylists()
      const missing = result.missing?.length || 0
      alert(`导入完成，新增 ${result.added} 首，未匹配到 ${missing} 首。`)
    }
  } catch (error: any) {
    console.error('导入失败:', error)
    alert(`导入失败：${error.message || error}`)
  }
}

const openPlaylist = (playlist: Playlist) => {
  // TODO: 打开歌单详情
  console.log('打开歌单:', playlist)
}

const playPlaylist = (playlist: Playlist) => {
  // TODO: 播放歌单
  console.log('播放歌单:', playlist)
}
</script>

<style scoped>
.playlist-manager {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.header h2 {
  color: var(--text-color);
}

.btn-create {
  background: #ff4757;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-create:hover {
  background: #ff6b7a;
}

.btn-secondary {
  background: var(--hover-bg);
  color: var(--text-color);
  border: 1px solid var(--sidebar-border);
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover {
  background: var(--sidebar-border);
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.playlist-card {
  background: var(--sidebar-bg);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
}

.playlist-card:hover {
  transform: translateY(-4px);
}

.playlist-cover {
  position: relative;
  padding-top: 100%;
  background: #ddd;
  overflow: hidden;
}

.playlist-cover img,
.playlist-cover > div {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.playlist-cover img {
  object-fit: cover;
}

.playlist-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.playlist-card:hover .playlist-overlay {
  opacity: 1;
}

.btn-play {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: #ff4757;
  color: white;
  font-size: 20px;
  cursor: pointer;
}

.playlist-info {
  padding: 12px;
}

.playlist-info h3 {
  font-size: 14px;
  margin-bottom: 4px;
  color: var(--text-color);
}

.playlist-info p {
  font-size: 12px;
  color: var(--secondary-text-color);
}

.playlist-actions {
  display: flex;
  gap: 10px;
  padding: 0 12px 12px;
}

.playlist-actions button {
  padding: 6px 12px;
  border: none;
  background: var(--hover-bg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.playlist-actions button:hover {
  background: var(--active-bg);
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #ffffff !important;
  color: #1f1f1f !important;
  padding: 24px;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  border: 1px solid #e0e0e0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dark .dialog {
  background: #2d2d2d !important;
  color: #f5f5f5 !important;
  border-color: #444444;
}

.dialog * {
  color: inherit !important;
}

.dialog h3 {
  margin-bottom: 20px;
  color: inherit !important;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: inherit !important;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #ffffff;
  color: #1f1f1f;
  resize: vertical;
}

.dark .form-group input,
.dark .form-group textarea {
  background: #3a3a3a;
  color: #f5f5f5;
  border-color: #555555;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.btn-primary {
  background: #ff4757;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #ff6b7a;
}

.btn-secondary {
  background: var(--hover-bg);
  color: var(--text-color);
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--sidebar-border);
}
</style>
