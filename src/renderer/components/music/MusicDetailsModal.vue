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

        <!-- 音频信息 -->
        <div class="info-section">
          <h3 class="section-title">{{ $t('music.audioInfo') }}</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ $t('music.bitrate') }}:</span>
              <span class="info-value">{{ formatBitrate(audioInfo?.bitrate ?? music.bitrate, audioInfo?.isVBR) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.sampleRate') }}:</span>
              <span class="info-value">{{ formatSampleRate(audioInfo?.sampleRate ?? music.sampleRate) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.channels') }}:</span>
              <span class="info-value">{{ formatChannels(audioInfo?.channels ?? music.channels) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('music.codec') }}:</span>
              <span class="info-value">{{ music.fileExtension.toUpperCase().replace('.', '') }}</span>
            </div>
            <div v-if="audioInfo?.isVBR || audioInfo?.codecProfile" class="info-item">
              <span class="info-label">{{ $t('music.bitrateMode') }}:</span>
              <span class="info-value">
                {{ audioInfo?.isVBR ? $t('music.vbr') : $t('music.cbr') }}
                <span v-if="audioInfo?.codecProfile" class="codec-profile">({{ audioInfo.codecProfile }})</span>
              </span>
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
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Copy } from 'lucide-vue-next'
import type { MusicItem } from '@shared/types/music'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  music: MusicItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const audioInfo = ref<{
  bitrate: number
  sampleRate: number
  channels: number
  isVBR: boolean
  codecProfile: string | null
} | null>(null)

const close = () => {
  emit('close')
}

// 当显示对话框且音乐信息存在时，获取详细的音频信息（包括 VBR）
watch([() => props.show, () => props.music], async ([show, music]) => {
  if (show && music) {
    try {
      const info = await window.electronAPI.getMusicAudioInfo(music.id)
      audioInfo.value = info
    } catch (error) {
      console.error('获取音频信息失败:', error)
      // 使用数据库中的基本信息
      audioInfo.value = {
        bitrate: music.bitrate,
        sampleRate: music.sampleRate,
        channels: music.channels,
        isVBR: false,
        codecProfile: null
      }
    }
  } else {
    audioInfo.value = null
  }
}, { immediate: true })

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

const formatBitrate = (bitrate: number, isVBR?: boolean) => {
  if (bitrate === 0) return '-'
  const vbrLabel = isVBR ? ` (${t('music.vbr')})` : ''
  return `${bitrate} ${t('music.kbps')}${vbrLabel}`
}

const formatSampleRate = (sampleRate: number) => {
  if (sampleRate === 0) return '-'
  return `${sampleRate} ${t('music.hz')}`
}

const formatChannels = (channels: number) => {
  if (channels === 0) return '-'
  if (channels === 1) return t('music.mono')
  if (channels === 2) return t('music.stereo')
  return `${channels} ${t('music.channels')}`
}

const copyDetails = () => {
  if (!props.music) return

  const details = `${t('music.details')}

【${t('music.songInfo')}】
${t('music.title')}: ${props.music.title}
${t('music.artist')}: ${props.music.artist}
${t('music.album')}: ${props.music.album || '-'}
${t('music.duration')}: ${formatDuration(props.music.duration)}
${t('music.hasLyrics')}: ${props.music.lyricsPath ? t('common.yes') : t('common.no')}

【${t('music.audioInfo')}】
${t('music.bitrate')}: ${formatBitrate(audioInfo?.bitrate ?? props.music.bitrate, audioInfo?.isVBR)}
${t('music.sampleRate')}: ${formatSampleRate(audioInfo?.sampleRate ?? props.music.sampleRate)}
${t('music.channels')}: ${formatChannels(audioInfo?.channels ?? props.music.channels)}
${t('music.codec')}: ${props.music.fileExtension.toUpperCase().replace('.', '')}
${audioInfo?.isVBR ? `${t('music.bitrateMode')}: ${t('music.vbr')}` : ''}
${audioInfo?.codecProfile ? `${t('music.codecProfile')}: ${audioInfo.codecProfile}` : ''}

【${t('music.fileInfo')}】
${t('music.fileType')}: ${props.music.fileExtension.toUpperCase().replace('.', '')}
${t('music.fileName')}: ${props.music.fileName}
${t('music.fullPath')}: ${props.music.filePath}
${t('music.fileHash')}: ${props.music.fileHash}
${t('music.fileSize')}: ${formatFileSize(props.music.fileSize)} (${props.music.fileSize.toLocaleString()} ${t('music.bytes')})`

  navigator.clipboard.writeText(details).then(() => {
    console.log(t('music.copySuccess'))
    // TODO: 显示提示消息
  }).catch(err => {
    console.error(t('music.copyError'), err)
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

.codec-profile {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-left: var(--spacing-xs);
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
