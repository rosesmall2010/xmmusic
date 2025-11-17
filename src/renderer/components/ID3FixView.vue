<template>
  <div class="id3-fix-view">
    <h2>ID3标签修复</h2>

    <div class="toolbar">
      <div class="file-selector">
        <label>选择音乐文件：</label>
        <input
          type="text"
          v-model="selectedFilePath"
          placeholder="点击选择文件或输入文件路径"
          readonly
        />
        <button @click="selectFile" class="btn-select">选择文件</button>
      </div>
    </div>

    <div v-if="selectedFilePath" class="fix-panel">
      <!-- 编码检测 -->
      <div class="section">
        <h3>1. 检测编码</h3>
        <button @click="detectEncoding" :disabled="detecting" class="btn-detect">
          {{ detecting ? '检测中...' : '自动检测编码' }}
        </button>

        <div v-if="encodingResults.length > 0" class="encoding-results">
          <h4>检测结果（按置信度排序）：</h4>
          <div
            v-for="(result, index) in encodingResults"
            :key="index"
            class="encoding-item"
            :class="{ selected: selectedEncoding === result.encoding }"
            @click="selectEncoding(result.encoding)"
          >
            <div class="encoding-info">
              <strong>{{ result.encoding.toUpperCase() }}</strong>
              <span class="confidence">置信度: {{ (result.confidence * 100).toFixed(1) }}%</span>
            </div>
            <div class="encoding-preview">
              <div><strong>标题:</strong> {{ result.preview.title || '-' }}</div>
              <div><strong>艺术家:</strong> {{ result.preview.artist || '-' }}</div>
              <div><strong>专辑:</strong> {{ result.preview.album || '-' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 手动选择编码 -->
      <div class="section">
        <h3>2. 手动选择编码（如果自动检测失败）</h3>
        <select v-model="manualEncoding" class="encoding-select">
          <option value="">请选择编码</option>
          <option value="utf8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="gb2312">GB2312</option>
          <option value="big5">Big5</option>
          <option value="utf16le">UTF-16LE</option>
          <option value="latin1">Latin1</option>
        </select>
      </div>

      <!-- 选择修复字段 -->
      <div class="section">
        <h3>3. 选择要修复的字段</h3>
        <div class="field-checkboxes">
          <label>
            <input type="checkbox" v-model="fieldsToFix.title" />
            标题
          </label>
          <label>
            <input type="checkbox" v-model="fieldsToFix.artist" />
            艺术家
          </label>
          <label>
            <input type="checkbox" v-model="fieldsToFix.album" />
            专辑
          </label>
        </div>
      </div>

      <!-- 修复操作 -->
      <div class="section">
        <h3>4. 执行修复</h3>
        <button
          @click="fixID3Tags"
          :disabled="!canFix || fixing"
          class="btn-fix"
        >
          {{ fixing ? '修复中...' : '开始修复' }}
        </button>
        <div v-if="fixResult" class="fix-result" :class="{ success: fixResult.success, error: !fixResult.success }">
          <p>{{ fixResult.message }}</p>
          <p v-if="fixResult.backupPath" class="backup-info">
            原文件已备份到: {{ fixResult.backupPath }}
          </p>
          <div v-if="fixResult.fixedTags" class="fixed-tags">
            <h4>修复后的标签：</h4>
            <div v-if="fixResult.fixedTags.title">标题: {{ fixResult.fixedTags.title }}</div>
            <div v-if="fixResult.fixedTags.artist">艺术家: {{ fixResult.fixedTags.artist }}</div>
            <div v-if="fixResult.fixedTags.album">专辑: {{ fixResult.fixedTags.album }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量修复 -->
    <div class="batch-section">
      <h3>批量修复</h3>
      <div class="batch-controls">
        <button @click="selectMultipleFiles" class="btn-select">选择多个文件</button>
        <span v-if="selectedFiles.length > 0">已选择 {{ selectedFiles.length }} 个文件</span>
      </div>
      <div v-if="selectedFiles.length > 0" class="batch-fix">
        <select v-model="batchEncoding" class="encoding-select">
          <option value="">请选择编码</option>
          <option value="utf8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="gb2312">GB2312</option>
          <option value="big5">Big5</option>
        </select>
        <button
          @click="fixID3TagsBatch"
          :disabled="!batchEncoding || batchFixing"
          class="btn-fix"
        >
          {{ batchFixing ? `修复中... ${batchProgress.current}/${batchProgress.total}` : '批量修复' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const selectedFilePath = ref('')
const detecting = ref(false)
const encodingResults = ref<any[]>([])
const selectedEncoding = ref('')
const manualEncoding = ref('')
const fieldsToFix = ref({
  title: true,
  artist: true,
  album: true
})
const fixing = ref(false)
const fixResult = ref<any>(null)

const selectedFiles = ref<string[]>([])
const batchEncoding = ref('')
const batchFixing = ref(false)
const batchProgress = ref({ current: 0, total: 0 })

const canFix = computed(() => {
  return (selectedEncoding.value || manualEncoding.value) &&
         (fieldsToFix.value.title || fieldsToFix.value.artist || fieldsToFix.value.album)
})

const selectFile = async () => {
  try {
    const result = await window.electronAPI.selectMusicFile()
    if (result) {
      selectedFilePath.value = result
    }
  } catch (error) {
    console.error('选择文件失败:', error)
  }
}

const detectEncoding = async () => {
  if (!selectedFilePath.value) {
    alert('请先选择文件')
    return
  }

  detecting.value = true
  encodingResults.value = []
  selectedEncoding.value = ''

  try {
    const results = await window.electronAPI.detectID3Encoding(selectedFilePath.value)
    encodingResults.value = results

    if (results.length > 0) {
      // 自动选择置信度最高的
      selectedEncoding.value = results[0].encoding
    } else {
      alert('未检测到有效的编码，请手动选择')
    }
  } catch (error: any) {
    console.error('检测失败:', error)
    alert(`检测失败: ${error.message}`)
  } finally {
    detecting.value = false
  }
}

const selectEncoding = (encoding: string) => {
  selectedEncoding.value = encoding
  manualEncoding.value = encoding
}

const fixID3Tags = async () => {
  if (!canFix.value) {
    alert('请选择编码和要修复的字段')
    return
  }

  const encoding = selectedEncoding.value || manualEncoding.value
  if (!encoding) {
    alert('请选择编码')
    return
  }

  if (!confirm('确定要修复ID3标签吗？原文件将被备份。')) {
    return
  }

  fixing.value = true
  fixResult.value = null

  try {
    const result = await window.electronAPI.fixID3Tags(
      selectedFilePath.value,
      encoding,
      fieldsToFix.value
    )
    fixResult.value = result

    if (result.success) {
      alert('修复成功！')
    } else {
      alert(`修复失败: ${result.message}`)
    }
  } catch (error: any) {
    console.error('修复失败:', error)
    fixResult.value = {
      success: false,
      message: error.message || '修复失败'
    }
    alert(`修复失败: ${error.message}`)
  } finally {
    fixing.value = false
  }
}

const selectMultipleFiles = async () => {
  try {
    const result = await window.electronAPI.selectMusicFiles()
    if (result && result.length > 0) {
      selectedFiles.value = result
    }
  } catch (error) {
    console.error('选择文件失败:', error)
  }
}

const fixID3TagsBatch = async () => {
  if (!batchEncoding.value || selectedFiles.value.length === 0) {
    alert('请选择编码和文件')
    return
  }

  if (!confirm(`确定要批量修复 ${selectedFiles.value.length} 个文件的ID3标签吗？原文件将被备份。`)) {
    return
  }

  batchFixing.value = true
  batchProgress.value = { current: 0, total: selectedFiles.value.length }

  // 监听进度
  window.electronAPI.onID3FixProgress((progress: { current: number; total: number }) => {
    batchProgress.value = progress
  })

  try {
    const result = await window.electronAPI.fixID3TagsBatch(
      selectedFiles.value,
      batchEncoding.value,
      fieldsToFix.value
    )

    window.electronAPI.removeID3FixProgress()

    alert(`批量修复完成！\n成功: ${result.success}\n失败: ${result.failed}`)

    // 清空选择
    selectedFiles.value = []
    batchEncoding.value = ''
  } catch (error: any) {
    window.electronAPI.removeID3FixProgress()
    console.error('批量修复失败:', error)
    alert(`批量修复失败: ${error.message}`)
  } finally {
    batchFixing.value = false
  }
}
</script>

<style scoped>
.id3-fix-view {
  padding: 20px;
  color: var(--text-color);
}

h2 {
  margin-bottom: 20px;
  color: var(--text-color);
}

.toolbar {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--sidebar-bg);
  border-radius: 8px;
}

.file-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-selector label {
  font-weight: 500;
}

.file-selector input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
}

.btn-select,
.btn-detect,
.btn-fix {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-select {
  background: #4CAF50;
  color: white;
}

.btn-select:hover {
  background: #45a049;
}

.btn-detect {
  background: #2196F3;
  color: white;
}

.btn-detect:hover {
  background: #0b7dda;
}

.btn-detect:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-fix {
  background: #ff4757;
  color: white;
}

.btn-fix:hover:not(:disabled) {
  background: #ff6b7a;
}

.btn-fix:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.fix-panel {
  margin-top: 20px;
}

.section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--sidebar-bg);
  border-radius: 8px;
}

.section h3 {
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--text-color);
}

.encoding-results {
  margin-top: 16px;
}

.encoding-results h4 {
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--secondary-text-color);
}

.encoding-item {
  margin-bottom: 12px;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.encoding-item:hover {
  border-color: #2196F3;
  background: rgba(33, 150, 243, 0.1);
}

.encoding-item.selected {
  border-color: #ff4757;
  background: rgba(255, 71, 87, 0.1);
}

.encoding-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.confidence {
  color: var(--secondary-text-color);
  font-size: 12px;
}

.encoding-preview {
  font-size: 13px;
  color: var(--secondary-text-color);
}

.encoding-preview div {
  margin-bottom: 4px;
}

.encoding-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  min-width: 200px;
}

.field-checkboxes {
  display: flex;
  gap: 20px;
}

.field-checkboxes label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.fix-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
}

.fix-result.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.fix-result.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.backup-info {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.8;
}

.fixed-tags {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.fixed-tags h4 {
  margin-bottom: 8px;
  font-size: 14px;
}

.fixed-tags div {
  margin-bottom: 4px;
  font-size: 13px;
}

.batch-section {
  margin-top: 32px;
  padding: 16px;
  background: var(--sidebar-bg);
  border-radius: 8px;
}

.batch-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.batch-fix {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
