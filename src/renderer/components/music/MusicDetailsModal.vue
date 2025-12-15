<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('music.details') }}</h2>
        <button class="close-btn" @click="close">
          <X :size="20" />
        </button>
      </div>

      <div v-if="music" class="modal-body">
        <!-- 歌曲信息 -->
        <div class="info-section">
          <h3 class="section-title">{{ $t('music.songInfo') }}</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ $t('music.title') }}:</span>
              <span class="info-value">{{ music.title }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.artist') }}:</span>
              <span class="info-value">{{ music.artist }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.album') }}:</span>
              <span class="info-value">{{ music.album || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.duration') }}:</span>
              <span class="info-value">{{ formatDuration(music.duration) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.hasLyrics') }}:</span>
              <span class="info-value">{{ music.lyricsPath ? $t('common.yes') : $t('common.no') }}</span>
            </div>
          </div>
        </div>

        <!-- 文件信息 -->
        <div class="info-section">
          <h3 class="section-title">{{ $t('music.fileInfo') }}</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ $t('music.fileType') }}:</span>
              <span class="info-value">{{ music.fileExtension.toUpperCase().replace('.', '') }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.fileName') }}:</span>
              <span class="info-value">{{ music.fileName }}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">{{ $t('music.fullPath') }}:</span>
              <span class="info-value path">{{ music.filePath }}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">{{ $t('music.fileHash') }}:</span>
              <span class="info-value mono">{{ music.fileHash }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.fileSize') }}:</span>
              <span class="info-value">{{ formatFileSize(music.fileSize) }} ({{ music.fileSize.toLocaleString() }} {{ $t('music.bytes') }})</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="close">{{ $t('common.close') }}</button>
        <button class="btn-primary" @click="copyDetails">
          <Copy :size="16" />
          {{ $t('music.copyDetails') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X, Copy } from 'lucide-vue-next'
import type { MusicItem } from '@shared/types/music'

const props = defineProps<{
  show: boolean
  music: MusicItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const close = () => {
  emit('close')
}

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const copyDetails = () => {
  if (!props.music) return

  const details = `歌曲详细信息

【歌曲信息】
标题: ${props.music.title}
歌手: ${props.music.artist}
专辑: ${props.music.album || '-'}
时长: ${formatDuration(props.music.duration)}
是否有歌词: ${props.music.lyricsPath ? '是' : '否'}

【文件信息】
文件类型: ${props.music.fileExtension.toUpperCase().replace('.', '')}
文件名: ${props.music.fileName}
完整路径: ${props.music.filePath}
文件路径MD5: ${props.music.fileHash}
文件大小: ${formatFileSize(props.music.fileSize)} (${props.music.fileSize.toLocaleString()} 字节)`

  navigator.clipboard.writeText(details).then(() => {
    console.log('详细信息已复制到剪贴板')
    // TODO: 显示提示消息
  }).catch(err => {
    console.error('复制失败:', err)
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

.info-section {
  margin-bottom: var(--spacing-xl);
}

.info-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 var(--spacing-md) 0;
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px solid var(--color-primary);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.info-value {
  font-size: var(--font-size-base);
  color: var(--text-color);
  word-break: break-word;
}

.info-value.path {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: var(--font-size-sm);
  background: var(--bg-secondary);
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.info-value.mono {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.btn-primary,
.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  border: none;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}
</style>
