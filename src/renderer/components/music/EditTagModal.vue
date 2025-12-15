<template>
  <div v-if="show" class="dialog-overlay" @click.self="close">
    <div class="dialog edit-tag-dialog" :class="{ 'has-id3': rawID3Tags }">
      <h3>{{ $t('tagEditor.title') }}</h3>

      <div class="file-info">
        <p class="filename">{{ music?.fileName }}</p>
      </div>

      <div class="main-content">
        <!-- 左侧：表单编辑区域 -->
        <div class="form-section">
          <h4 class="section-title">{{ $t('tagEditor.editInfo') }}</h4>
          <div class="form-content">
            <div class="form-group">
              <label>{{ $t('tagEditor.artistLabel') }} <span class="hint">(Artist)</span></label>
              <input
                v-model="formData.artist"
                type="text"
                :placeholder="$t('tagEditor.artistPlaceholder')"
                :disabled="loading"
                @keyup.enter="save"
              />
            </div>

            <!-- Swap Button -->
            <div class="swap-button-container">
              <button @click="swapArtistAndTitle" class="btn-swap" :disabled="loading" type="button">
                <ArrowLeftRight :size="16" />
                <span>{{ $t('tagEditor.swapTitleArtist') }}</span>
              </button>
            </div>

            <div class="form-group">
              <label>{{ $t('tagEditor.titleLabel') }} <span class="hint">(Title)</span></label>
              <input
                v-model="formData.title"
                type="text"
                :placeholder="$t('tagEditor.titlePlaceholder')"
                :disabled="loading"
                @keyup.enter="save"
              />
            </div>

            <div class="form-group">
              <label>{{ $t('tagEditor.albumLabel') }} <span class="hint">(Album)</span></label>
              <input
                v-model="formData.album"
                type="text"
                :placeholder="$t('tagEditor.albumPlaceholder')"
                :disabled="loading"
                @keyup.enter="save"
              />
            </div>
          </div>
        </div>

        <!-- 分隔线 -->
        <div v-if="rawID3Tags || loadingMetadata" class="divider"></div>

        <!-- 右侧：ID3元数据信息区域 -->
        <div v-if="rawID3Tags || loadingMetadata" class="id3-section">
          <h4 class="section-title">{{ $t('tagEditor.id3Metadata') }}</h4>
          
          <div v-if="loadingMetadata" class="loading-metadata">
            {{ $t('tagEditor.loadingMetadata') }}
          </div>

          <div v-else-if="rawID3Tags" class="metadata-display">
            <!-- 原始元数据 -->
            <div class="metadata-group">
              <label>{{ $t('tagEditor.rawMetadata') }}</label>
              <div class="metadata-info">
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.artistLabel') }}:</span>
                  <span class="metadata-value">{{ rawID3Tags.artist || '-' }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.titleLabel') }}:</span>
                  <span class="metadata-value">{{ rawID3Tags.title || '-' }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.albumLabel') }}:</span>
                  <span class="metadata-value">{{ rawID3Tags.album || '-' }}</span>
                </div>
                <div v-if="rawID3Tags.year" class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.yearLabel') }}:</span>
                  <span class="metadata-value">{{ rawID3Tags.year }}</span>
                </div>
                <div v-if="rawID3Tags.genre" class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.genreLabel') }}:</span>
                  <span class="metadata-value">{{ rawID3Tags.genre }}</span>
                </div>
              </div>
            </div>

            <!-- 转换后的元数据显示 -->
            <div v-if="convertedTags" class="metadata-group converted-group">
              <label>{{ $t('tagEditor.convertedMetadata') }}</label>
              <div class="metadata-info converted-info">
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.artistLabel') }}:</span>
                  <span class="metadata-value converted">{{ convertedTags.artist || '-' }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.titleLabel') }}:</span>
                  <span class="metadata-value converted">{{ convertedTags.title || '-' }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">{{ $t('tagEditor.albumLabel') }}:</span>
                  <span class="metadata-value converted">{{ convertedTags.album || '-' }}</span>
                </div>
              </div>
            </div>

            <!-- 编码转换按钮 -->
            <div class="encoding-actions">
              <button @click="convertFromGB2312" class="btn-convert" :disabled="loading || !rawID3Tags">
                {{ $t('tagEditor.convertFromGB2312') }}
              </button>
              <button @click="convertFromGBK" class="btn-convert" :disabled="loading || !rawID3Tags">
                {{ $t('tagEditor.convertFromGBK') }}
              </button>
              <button
                v-if="convertedTags"
                @click="applyConvertedTags"
                class="btn-save-converted"
                :disabled="loading"
              >
                {{ $t('tagEditor.saveConverted') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>{{ $t('tagEditor.saving') }}</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button @click="save" class="btn-primary" :disabled="loading || !hasChanges">
          {{ $t('tagEditor.save') }}
        </button>
        <button @click="close" class="btn-secondary" :disabled="loading">{{ $t('tagEditor.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeftRight } from 'lucide-vue-next'
import type { MusicItem } from '@shared/types/music'
import { parseFilenameForTags } from '@/utils/parseFilename'

const { t } = useI18n()

interface Props {
  show: boolean
  music: MusicItem | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const formData = ref({
  artist: '',
  album: '',
  title: ''
})

const loading = ref(false)
const loadingMetadata = ref(false)
const rawID3Tags = ref<{ title: string; artist: string; album: string; year?: string; genre?: string } | null>(null)
const convertedTags = ref<{ title: string; artist: string; album: string } | null>(null)

const hasChanges = computed(() => {
  if (!props.music) return false

  return (
    formData.value.artist !== props.music.artist ||
    formData.value.album !== (props.music.album || '') ||
    formData.value.title !== props.music.title
  )
})

watch(() => props.show, (newVal) => {
  if (newVal && props.music) {
    loadMusicData(props.music)
    loadRawID3Tags()
  } else {
    // 关闭时重置
    rawID3Tags.value = null
    convertedTags.value = null
  }
})

const loadMusicData = (music: MusicItem) => {
  // 使用智能解析从文件名中提取信息
  const parsed = parseFilenameForTags(music.fileName, {
    artist: music.artist,
    title: music.title,
    album: music.album || ''
  })

  formData.value = {
    artist: parsed.artist || music.artist,
    album: parsed.artist || music.artist, // 用解析的歌手名填充专辑
    title: parsed.title || music.title
  }
}

const loadRawID3Tags = async () => {
  if (!props.music?.filePath) return

  try {
    loadingMetadata.value = true
    const tags = await window.electronAPI.readRawID3Tags(props.music.filePath)
    rawID3Tags.value = tags
    convertedTags.value = null // 重置转换后的标签
  } catch (error: any) {
    console.error('加载ID3标签失败:', error)
    rawID3Tags.value = null
  } finally {
    loadingMetadata.value = false
  }
}

const convertFromGB2312 = async () => {
  if (!rawID3Tags.value) return

  try {
    loading.value = true
    // 转换为纯对象，避免 IPC 序列化问题
    const tagsToConvert = {
      title: rawID3Tags.value.title || '',
      artist: rawID3Tags.value.artist || '',
      album: rawID3Tags.value.album || '',
      year: rawID3Tags.value.year,
      genre: rawID3Tags.value.genre
    }
    const converted = await window.electronAPI.convertID3TagsEncoding(tagsToConvert, 'gb2312')
    convertedTags.value = {
      title: converted.title,
      artist: converted.artist,
      album: converted.album
    }
  } catch (error: any) {
    console.error('GB2312转换失败:', error)
    alert(t('tagEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const convertFromGBK = async () => {
  if (!rawID3Tags.value) return

  try {
    loading.value = true
    // 转换为纯对象，避免 IPC 序列化问题
    const tagsToConvert = {
      title: rawID3Tags.value.title || '',
      artist: rawID3Tags.value.artist || '',
      album: rawID3Tags.value.album || '',
      year: rawID3Tags.value.year,
      genre: rawID3Tags.value.genre
    }
    const converted = await window.electronAPI.convertID3TagsEncoding(tagsToConvert, 'gbk')
    convertedTags.value = {
      title: converted.title,
      artist: converted.artist,
      album: converted.album
    }
  } catch (error: any) {
    console.error('GBK转换失败:', error)
    alert(t('tagEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const applyConvertedTags = () => {
  if (!convertedTags.value) return

  // 将转换后的标签应用到表单
  formData.value = {
    artist: convertedTags.value.artist || formData.value.artist,
    title: convertedTags.value.title || formData.value.title,
    album: convertedTags.value.album || formData.value.album
  }
}

const save = async () => {
  if (!hasChanges.value || !props.music) {
    return
  }

  try {
    loading.value = true

    const updates = {
      artist: formData.value.artist.trim(),
      album: formData.value.album.trim() || null,
      title: formData.value.title.trim()
    }

    const success = await window.electronAPI.updateMusicMetadata(props.music.id, updates)

    if (success) {
      // 创建更新后的音乐对象
      const updatedMusic = {
        ...props.music,
        ...updates
      }

      // 触发全局事件，传递更新后的音乐信息
      window.dispatchEvent(new CustomEvent('music-metadata-updated', {
        detail: updatedMusic
      }))

      emit('saved')
      // 短暂延迟后关闭对话框
      setTimeout(() => {
        loading.value = false
        close()
      }, 100)
    } else {
      alert(t('tagEditor.saveErrorRetry'))
      loading.value = false
    }
  } catch (error: any) {
    console.error('保存标签失败:', error)
    alert(t('tagEditor.saveError') + ': ' + error.message)
    loading.value = false
  }
}

const swapArtistAndTitle = () => {
  // 交换歌手和歌曲名
  const temp = formData.value.artist
  formData.value.artist = formData.value.title
  formData.value.title = temp
  // 专辑名和歌手名保持一致
  formData.value.album = formData.value.artist
}

const close = () => {
  if (!loading.value) {
    emit('close')
  }
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  animation: fadeIn 0.2s ease-out;
}

.dialog {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: var(--spacing-xl);
  position: relative;
  animation: scaleIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.edit-tag-dialog {
  width: 500px;
  max-width: 90%;
  transition: width 0.3s ease;
}

/* 当有ID3信息时，对话框变宽 */
.edit-tag-dialog.has-id3 {
  width: 850px;
}

.file-info {
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-lg);
}

.filename {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  word-break: break-all;
}

/* 主内容区域：左右两栏布局 */
.main-content {
  display: flex;
  gap: 0;
  align-items: stretch;
}

/* 左侧表单区域 */
.form-section {
  flex: 1;
  min-width: 0;
}

/* 分隔线 */
.divider {
  width: 1px;
  background: var(--border-color);
  margin: 0 var(--spacing-lg);
  align-self: stretch;
}

/* 右侧ID3信息区域 */
.id3-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 var(--spacing-md) 0;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-group label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-color);
}

.hint {
  font-size: var(--font-size-xs);
  font-weight: 400;
  color: var(--text-tertiary);
  margin-left: var(--spacing-xs);
}

.form-group input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-primary);
  color: var(--text-color);
  font-size: var(--font-size-base);
  transition: border-color var(--transition-fast);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.swap-button-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: calc(var(--spacing-sm) * -1) 0;
}

.btn-swap {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-base);
}

.btn-swap:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--color-primary);
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.btn-swap:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  z-index: 10;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  color: white;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  padding: var(--spacing-sm) var(--spacing-xl);
  border: none;
  border-radius: var(--radius-base);
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-size: var(--font-size-base);
  font-weight: 500;
  transition: all var(--transition-base);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-xl);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all var(--transition-base);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--hover-bg);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ID3元数据显示区域 */
.metadata-display {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  flex: 1;
}

.metadata-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.metadata-group label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.metadata-info {
  padding: var(--spacing-sm);
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  border: 1px solid var(--border-color);
}

.converted-group {
  margin-top: var(--spacing-sm);
}

.converted-info {
  background: var(--bg-primary);
  border-color: var(--color-primary);
  border-width: 1px;
  border-style: solid;
}

.metadata-item {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  font-size: var(--font-size-sm);
}

.metadata-item:not(:last-child) {
  border-bottom: 1px dashed var(--border-color);
}

.metadata-label {
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 50px;
  flex-shrink: 0;
}

.metadata-value {
  color: var(--text-color);
  word-break: break-all;
  flex: 1;
}

.metadata-value.converted {
  color: var(--color-primary);
  font-weight: 500;
}

/* 编码转换按钮 */
.encoding-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}

.btn-convert {
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-primary);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-base);
}

.btn-convert:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-convert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-save-converted {
  padding: var(--spacing-xs) var(--spacing-md);
  border: none;
  border-radius: var(--radius-base);
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: all var(--transition-base);
}

.btn-save-converted:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-save-converted:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-metadata {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

/* 响应式设计：小屏幕时恢复上下布局 */
@media (max-width: 768px) {
  .edit-tag-dialog.has-id3 {
    width: 90%;
  }
  
  .main-content {
    flex-direction: column;
    gap: var(--spacing-lg);
  }
  
  .divider {
    width: 100%;
    height: 1px;
    margin: var(--spacing-md) 0;
  }
}
</style>
