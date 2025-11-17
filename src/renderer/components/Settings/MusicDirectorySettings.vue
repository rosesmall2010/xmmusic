<template>
  <div class="directory-settings">
    <h2>音乐目录管理</h2>

    <div class="directory-list">
      <div v-for="dir in directories" :key="dir.id" class="directory-item">
        <div class="directory-info">
          <div class="directory-path">
            <span class="path-icon">📁</span>
            <span class="path-text">{{ dir.path }}</span>
          </div>
          <div class="directory-stats">
            <span>{{ dir.songCount }} 首歌曲</span>
            <span v-if="dir.lastScannedAt">最后扫描: {{ formatDate(dir.lastScannedAt) }}</span>
          </div>
        </div>

        <div class="directory-actions">
          <button @click="scanDirectory(dir)" class="btn-scan" :disabled="scanning === dir.id">
            {{ scanning === dir.id ? '扫描中...' : '扫描' }}
          </button>
          <button @click="editDirectory(dir)" class="btn-edit">编辑</button>
          <button @click="removeDirectory(dir.id)" class="btn-remove">删除</button>
        </div>
      </div>
    </div>

    <button @click="addDirectory" class="btn-add" :disabled="directories.length >= 10">
      ➕ 添加目录 ({{ directories.length }}/10)
    </button>

    <!-- 编辑对话框 -->
    <div v-if="showEditDialog" class="dialog-overlay" @click.self="showEditDialog = false">
      <div class="dialog">
        <h3>{{ editingDirectory.id ? '编辑目录' : '添加目录' }}</h3>

        <div class="form-group">
          <label>目录路径</label>
          <div class="path-input">
            <input v-model="editingDirectory.path" readonly />
            <button @click="selectPath">选择</button>
          </div>
        </div>

        <div class="form-group">
          <label>目录名称（可选）</label>
          <input v-model="editingDirectory.name" placeholder="如：我的音乐" />
        </div>

        <div class="form-group checkbox">
          <label>
            <input type="checkbox" v-model="editingDirectory.enabled" />
            启用此目录
          </label>
        </div>

        <div class="form-group checkbox">
          <label>
            <input type="checkbox" v-model="editingDirectory.autoScan" />
            自动监控文件变化
          </label>
        </div>

        <div class="form-group">
          <label>扫描深度</label>
          <select v-model="editingDirectory.scanDepth">
            <option value="current">仅当前目录</option>
            <option value="recursive">包含子目录</option>
          </select>
        </div>

        <div class="dialog-actions">
          <button @click="saveDirectory" class="btn-primary">保存</button>
          <button @click="showEditDialog = false" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MusicDirectory } from '@shared/types/music'

const directories = ref<MusicDirectory[]>([])
const scanning = ref<string | null>(null)
const showEditDialog = ref(false)
const editingDirectory = ref<Partial<MusicDirectory>>({
  path: '',
  name: '',
  enabled: true,
  autoScan: true,
  scanDepth: 'recursive',
  fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
  excludePaths: [],
  priority: 0
})

onMounted(async () => {
  await loadDirectories()
})

const loadDirectories = async () => {
  directories.value = await window.electronAPI.getMusicDirectories()
}

const addDirectory = () => {
  editingDirectory.value = {
    path: '',
    name: '',
    enabled: true,
    autoScan: true,
    scanDepth: 'recursive',
    fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
    excludePaths: [],
    priority: 0
  }
  showEditDialog.value = true
}

const editDirectory = (dir: MusicDirectory) => {
  editingDirectory.value = { ...dir }
  showEditDialog.value = true
}

const selectPath = async () => {
  const folders = await window.electronAPI.selectMusicFolder()
  if (folders.length > 0) {
    editingDirectory.value.path = folders[0]
  }
}

const saveDirectory = async () => {
  if (!editingDirectory.value.path) {
    alert('请选择目录路径')
    return
  }

  if (editingDirectory.value.id) {
    await window.electronAPI.updateMusicDirectory(editingDirectory.value.id, editingDirectory.value)
  } else {
    await window.electronAPI.addMusicDirectory(editingDirectory.value)
  }

  await loadDirectories()
  showEditDialog.value = false
}

const removeDirectory = async (id: string) => {
  if (confirm('确定要删除此目录吗？这不会删除实际文件。')) {
    await window.electronAPI.deleteMusicDirectory(id)
    await loadDirectories()
  }
}

const scanDirectory = async (dir: MusicDirectory) => {
  scanning.value = dir.id
  try {
    await window.electronAPI.scanMusicFolder(dir.path)
    await loadDirectories()
  } finally {
    scanning.value = null
  }
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}
</script>

<style scoped>
.directory-settings {
  padding: 20px;
}

h2 {
  margin-bottom: 20px;
  color: var(--text-color);
}

.directory-list {
  margin-bottom: 20px;
}

.directory-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  margin-bottom: 10px;
  background: var(--sidebar-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.directory-info {
  flex: 1;
}

.directory-path {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
}

.path-icon {
  margin-right: 8px;
}

.path-text {
  color: var(--text-color);
}

.directory-stats {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: var(--secondary-text-color);
}

.directory-actions {
  display: flex;
  gap: 10px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-scan {
  background: #4CAF50;
  color: white;
}

.btn-scan:hover:not(:disabled) {
  background: #45a049;
}

.btn-edit {
  background: #2196F3;
  color: white;
}

.btn-edit:hover {
  background: #0b7dda;
}

.btn-remove {
  background: #f44336;
  color: white;
}

.btn-remove:hover {
  background: #da190b;
}

.btn-add {
  background: #ff4757;
  color: white;
  padding: 12px 24px;
  font-size: 16px;
}

.btn-add:hover:not(:disabled) {
  background: #ff6b7a;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  background: var(--bg-color);
  padding: 24px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
}

.dialog h3 {
  margin-bottom: 20px;
  color: var(--text-color);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-color);
  font-weight: 500;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
}

.path-input {
  display: flex;
  gap: 10px;
}

.path-input input {
  flex: 1;
}

.path-input button {
  padding: 8px 16px;
  background: var(--active-bg);
  color: white;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  font-weight: normal;
}

.form-group.checkbox input {
  margin-right: 8px;
  width: auto;
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
}

.btn-primary:hover {
  background: #ff6b7a;
}

.btn-secondary {
  background: var(--hover-bg);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--sidebar-border);
}
</style>
