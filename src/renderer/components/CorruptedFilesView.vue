<template>
  <div class="corrupted-files-view">
    <h2>损坏文件管理</h2>

    <div class="toolbar">
      <span class="info">共 {{ corruptedFiles.length }} 个损坏文件</span>
      <button @click="clearAll" class="btn-clear" :disabled="corruptedFiles.length === 0">
        清空列表
      </button>
    </div>

    <div class="file-list">
      <div v-for="file in corruptedFiles" :key="file.id" class="file-item">
        <div class="file-info">
          <div class="file-path">{{ file.filePath }}</div>
          <div class="file-reason">原因: {{ file.reason }}</div>
          <div class="file-date">检测时间: {{ formatDate(file.detectedAt) }}</div>
        </div>
        <div class="file-actions">
          <button @click="resolveFile(file.id)" class="btn-resolve">标记已解决</button>
          <button @click="deleteFile(file.id)" class="btn-delete">删除记录</button>
        </div>
      </div>

      <div v-if="corruptedFiles.length === 0" class="empty-state">
        <p>暂无损坏文件</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface CorruptedFile {
  id: number
  filePath: string
  reason: string
  detectedAt: string
  resolved: boolean
}

const corruptedFiles = ref<CorruptedFile[]>([])

onMounted(async () => {
  await loadCorruptedFiles()
})

const loadCorruptedFiles = async () => {
  // TODO: 从数据库加载损坏文件列表
  console.log('加载损坏文件列表')
}

const resolveFile = async (id: number) => {
  // TODO: 标记为已解决
  console.log('标记已解决:', id)
}

const deleteFile = async (id: number) => {
  if (confirm('确定要删除这条记录吗？')) {
    // TODO: 删除记录
    console.log('删除记录:', id)
  }
}

const clearAll = async () => {
  if (confirm('确定要清空所有损坏文件记录吗？')) {
    // TODO: 清空所有记录
    console.log('清空所有记录')
  }
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}
</script>

<style scoped>
.corrupted-files-view {
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

.info {
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
}

.btn-clear:hover:not(:disabled) {
  background: #da190b;
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--sidebar-bg);
  border-radius: 8px;
}

.file-info {
  flex: 1;
}

.file-path {
  color: var(--text-color);
  font-size: 14px;
  margin-bottom: 8px;
}

.file-reason {
  color: #f44336;
  font-size: 13px;
  margin-bottom: 4px;
}

.file-date {
  color: var(--secondary-text-color);
  font-size: 12px;
}

.file-actions {
  display: flex;
  gap: 10px;
}

.btn-resolve,
.btn-delete {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn-resolve {
  background: #4CAF50;
  color: white;
}

.btn-resolve:hover {
  background: #45a049;
}

.btn-delete {
  background: #f44336;
  color: white;
}

.btn-delete:hover {
  background: #da190b;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--secondary-text-color);
}
</style>
