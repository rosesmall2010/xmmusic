<template>
  <div class="duplicate-music-view">
    <h2>重复音乐检测</h2>

    <div class="toolbar">
      <button @click="scanDuplicates" :disabled="scanning" class="btn-scan">
        {{ scanning ? '扫描中...' : '扫描重复音乐' }}
      </button>
      <span class="info">找到 {{ duplicateGroups.length }} 组重复音乐</span>
    </div>

    <div class="duplicate-groups">
      <div v-for="group in duplicateGroups" :key="group.fileHash" class="duplicate-group">
        <div class="group-header">
          <h3>{{ group.representativeTitle }} - {{ group.representativeArtist }}</h3>
          <span class="count">共 {{ group.count }} 个重复</span>
        </div>

        <div class="group-files">
          <div v-for="file in group.files" :key="file.id" class="file-item">
            <div class="file-info">
              <div>{{ file.filePath }}</div>
              <div class="file-meta">
                大小: {{ formatSize(file.fileSize) }} | 播放: {{ file.playCount }} 次
              </div>
            </div>
            <button @click="deleteFile(file.id)" class="btn-delete">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface DuplicateGroup {
  fileHash: string
  count: number
  representativeTitle: string
  representativeArtist: string
  files: any[]
}

const duplicateGroups = ref<DuplicateGroup[]>([])
const scanning = ref(false)

const scanDuplicates = async () => {
  scanning.value = true
  try {
    const groups = await window.electronAPI.getDuplicateGroups()
    // 处理数据，添加代表信息
    duplicateGroups.value = groups.map((group: any) => ({
      ...group,
      representativeTitle: group.files[0]?.title || '未知',
      representativeArtist: group.files[0]?.artist || '未知'
    }))
  } catch (error) {
    console.error('扫描失败:', error)
    alert('扫描重复音乐失败')
  } finally {
    scanning.value = false
  }
}

const deleteFile = async (musicId: number) => {
  if (!confirm('确定要删除这个文件吗？此操作不可恢复！')) {
    return
  }

  try {
    await window.electronAPI.deleteMusicFile(musicId)
    // 重新扫描
    await scanDuplicates()
    alert('删除成功')
  } catch (error: any) {
    console.error('删除失败:', error)
    alert(`删除失败: ${error.message}`)
  }
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// 初始化时扫描
onMounted(() => {
  scanDuplicates()
})
</script>

<style scoped>
.duplicate-music-view {
  padding: 20px;
}

h2 {
  color: var(--text-color);
  margin-bottom: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--sidebar-bg);
  border-radius: 4px;
}

.btn-scan {
  background: #ff4757;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-scan:hover:not(:disabled) {
  background: #ff6b7a;
}

.btn-scan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.info {
  color: var(--text-color);
  font-size: 14px;
}

.duplicate-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.duplicate-group {
  background: var(--sidebar-bg);
  border-radius: 8px;
  padding: 16px;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.group-header h3 {
  color: var(--text-color);
  font-size: 16px;
}

.count {
  color: #ff4757;
  font-weight: bold;
}

.group-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 4px;
}

.file-info {
  flex: 1;
  color: var(--text-color);
  font-size: 13px;
}

.file-meta {
  color: var(--secondary-text-color);
  font-size: 11px;
  margin-top: 4px;
}

.btn-delete {
  background: #f44336;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-delete:hover {
  background: #da190b;
}
</style>
