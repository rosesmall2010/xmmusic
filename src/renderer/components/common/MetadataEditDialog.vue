<template>
  <div v-if="show" class="dialog-overlay" @click.self="close">
    <div class="dialog metadata-dialog">
      <h3>{{ isBatch ? $t('metadataEdit.batchEdit') : $t('metadataEdit.edit') }}</h3>

      <div v-if="isBatch" class="batch-info">
        <p>{{ $t('metadataEdit.selected', { count: musicIds.length }) }}</p>
      </div>

      <div class="form-content">
        <div class="form-group">
          <label>{{ $t('metadataEdit.title') }}</label>
          <div class="field-with-convert">
            <input
              v-model="formData.title"
              type="text"
              :placeholder="$t('metadataEdit.leaveEmpty')"
              :disabled="loading"
            />
            <EncodingConvertField
              v-if="originalData.title && isFieldCorrupted(originalData.title)"
              :original-value="originalData.title"
              :current-value="formData.title"
              @converted="(value) => formData.title = value"
              :disabled="loading"
            />
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('metadataEdit.artist') }}</label>
          <div class="field-with-convert">
            <input
              v-model="formData.artist"
              type="text"
              :placeholder="$t('metadataEdit.leaveEmpty')"
              :disabled="loading"
            />
            <EncodingConvertField
              v-if="originalData.artist && isFieldCorrupted(originalData.artist)"
              :original-value="originalData.artist"
              :current-value="formData.artist"
              @converted="(value) => formData.artist = value"
              :disabled="loading"
            />
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('metadataEdit.album') }}</label>
          <div class="field-with-convert">
            <input
              v-model="formData.album"
              type="text"
              :placeholder="$t('metadataEdit.leaveEmpty')"
              :disabled="loading"
            />
            <EncodingConvertField
              v-if="originalData.album && isFieldCorrupted(originalData.album)"
              :original-value="originalData.album"
              :current-value="formData.album"
              @converted="(value) => formData.album = value"
              :disabled="loading"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>{{ $t('metadataEdit.year') }}</label>
            <input
              v-model.number="formData.year"
              type="number"
              :placeholder="$t('metadataEdit.leaveEmpty')"
              min="1900"
              max="2100"
              :disabled="loading"
            />
          </div>

          <div class="form-group">
            <label>{{ $t('metadataEdit.genre') }}</label>
            <div class="field-with-convert">
              <input
                v-model="formData.genre"
                type="text"
                :placeholder="$t('metadataEdit.leaveEmpty')"
                :disabled="loading"
              />
              <EncodingConvertField
                v-if="originalData.genre && isFieldCorrupted(originalData.genre)"
                :original-value="originalData.genre"
                :current-value="formData.genre"
                @converted="(value) => formData.genre = value"
                :disabled="loading"
              />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('metadataEdit.cover') }}</label>
          <div class="cover-section">
            <div v-if="coverPreview" class="cover-preview">
              <img :src="coverPreview" :alt="$t('metadataEdit.coverPreview')" />
              <button @click="removeCover" class="btn-remove-cover" :disabled="loading">{{ $t('metadataEdit.remove') }}</button>
            </div>
            <div v-else class="cover-placeholder">
              <span>{{ $t('metadataEdit.noCover') }}</span>
            </div>
            <div class="cover-actions">
              <button @click="selectCover" class="btn-select-cover" :disabled="loading">
                {{ coverPath ? $t('metadataEdit.replaceCover') : $t('metadataEdit.selectCover') }}
              </button>
              <button
                v-if="!isBatch && currentMusic"
                @click="extractCover"
                class="btn-extract-cover"
                :disabled="loading"
              >
                {{ $t('metadataEdit.extractFromFile') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>{{ loadingText }}</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button @click="save" class="btn-primary" :disabled="loading || !hasChanges">
            {{ $t('metadataEdit.save') }}
        </button>
        <button @click="close" class="btn-secondary" :disabled="loading">{{ $t('metadataEdit.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MusicItem } from '@shared/types/music'
import EncodingConvertField from './EncodingConvertField.vue'

interface Props {
  show: boolean
  music?: MusicItem | null
  musicIds?: number[]
}

const { t } = useI18n()

const props = withDefaults(defineProps<Props>(), {
  music: null,
  musicIds: () => []
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const isBatch = computed(() => props.musicIds.length > 0)
const currentMusic = computed(() => props.music)

const formData = ref({
  title: '',
  artist: '',
  album: '',
  year: undefined as number | undefined,
  genre: '',
  coverPath: null as string | null
})

const coverPreview = ref<string | null>(null)
const coverPath = ref<string | null>(null)
const loading = ref(false)
const loadingText = ref('')

const originalData = ref({
  title: '',
  artist: '',
  album: '',
  genre: ''
})

// 检测字段是否为乱码
const isFieldCorrupted = (value: string): boolean => {
  if (!value) return false

  // 检查是否包含替换字符（Unicode 替换字符）
  if (/[\uFFFD]/.test(value)) return true

  // 检查是否包含控制字符（除了常见的空白字符）
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(value)) return true

  // 检查是否看起来像乱码（包含很多非ASCII且非中文的字符）
  const nonAsciiNonChinese = value.match(/[^\x20-\x7E\u4e00-\u9fa5]/g)
  if (nonAsciiNonChinese && nonAsciiNonChinese.length > value.length * 0.3) {
    return true
  }

  return false
}

const hasChanges = computed(() => {
  return !!(
    formData.value.title ||
    formData.value.artist ||
    formData.value.album ||
    formData.value.year ||
    formData.value.genre ||
    formData.value.coverPath !== null
  )
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    resetForm()
    if (currentMusic.value && !isBatch.value) {
      loadMusicData(currentMusic.value)
    }
  }
})

watch(() => coverPath.value, (newPath) => {
  if (newPath) {
    // 创建预览 URL
    coverPreview.value = `local-file://${encodeURIComponent(newPath)}`
  } else {
    coverPreview.value = null
  }
})

const resetForm = () => {
  formData.value = {
    title: '',
    artist: '',
    album: '',
    year: undefined,
    genre: '',
    coverPath: null
  }
  coverPath.value = null
  coverPreview.value = null
  originalData.value = {
    title: '',
    artist: '',
    album: '',
    genre: ''
  }
}

const loadMusicData = (music: MusicItem) => {
  formData.value = {
    title: music.title,
    artist: music.artist,
    album: music.album || '',
    year: music.year || undefined,
    genre: music.genre || '',
    coverPath: music.coverPath || null
  }
  coverPath.value = music.coverPath || null

  // 保存原始数据用于编码转换
  originalData.value = {
    title: music.title,
    artist: music.artist,
    album: music.album || '',
    genre: music.genre || ''
  }
}

const selectCover = async () => {
  try {
    const file = await window.electronAPI.selectImageFile()
    if (file) {
      coverPath.value = file
      formData.value.coverPath = file
    }
  } catch (error: any) {
    console.error('选择封面失败:', error)
    alert(t('metadataEdit.selectCoverError') + ': ' + error.message)
  }
}

const removeCover = () => {
  coverPath.value = null
  formData.value.coverPath = null
}

const extractCover = async () => {
  if (!currentMusic.value) return

  try {
    loading.value = true
    loadingText.value = t('metadataEdit.extractingCover')

    // 选择保存位置
    const savePath = await window.electronAPI.showSaveDialog({
      title: t('metadataEdit.saveCoverImage'),
      defaultPath: `${currentMusic.value.title}_cover.jpg`,
      filters: [
        { name: t('metadataEdit.imageFiles'), extensions: ['jpg', 'jpeg', 'png'] }
      ]
    })

    if (savePath) {
      await window.electronAPI.extractMusicCover(currentMusic.value.id, savePath)
      coverPath.value = savePath
      formData.value.coverPath = savePath
      alert(t('metadataEdit.extractSuccess'))
    }
  } catch (error: any) {
    console.error('提取封面失败:', error)
    alert(t('metadataEdit.extractError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (!hasChanges.value) {
    alert(t('metadataEdit.atLeastOneField'))
    return
  }

  try {
    loading.value = true

    // 构建更新对象（只包含有值的字段）
    const updates: any = {}
    if (formData.value.title) updates.title = formData.value.title
    if (formData.value.artist) updates.artist = formData.value.artist
    if (formData.value.album) updates.album = formData.value.album
    if (formData.value.year) updates.year = formData.value.year
    if (formData.value.genre) updates.genre = formData.value.genre
    if (formData.value.coverPath !== null) {
      updates.coverPath = formData.value.coverPath
    }

    if (isBatch.value) {
      // 批量更新
      loadingText.value = t('metadataEdit.updating', { count: props.musicIds.length })
      const result = await window.electronAPI.batchUpdateMusicMetadata(props.musicIds, updates)

      if (result.failed > 0) {
        alert(t('metadataEdit.batchUpdateResult', { success: result.success, failed: result.failed, errors: result.errors.map(e => `- ${e.file}: ${e.error}`).join('\n') }))
      } else {
        alert(t('metadataEdit.batchUpdateSuccess', { count: result.success }))
      }
    } else {
      // 单个更新
      if (!currentMusic.value) return
      loadingText.value = t('metadataEdit.saving')
      await window.electronAPI.updateMusicMetadata(currentMusic.value.id, updates)
      alert(t('metadataEdit.updateSuccess'))
    }

    emit('saved')
    close()
  } catch (error: any) {
    console.error('保存失败:', error)
    alert(t('metadataEdit.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
    loadingText.value = ''
  }
}

const close = () => {
  if (!loading.value) {
    resetForm()
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

.metadata-dialog {
  width: 600px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.batch-info {
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 4px;
  margin-bottom: 16px;
}

.batch-info p {
  margin: 0;
  color: var(--text-color);
  font-size: 14px;
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.form-group input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.field-with-convert {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.cover-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-preview {
  position: relative;
  width: 200px;
  height: 200px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-color);
}

.cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.btn-remove-cover {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.cover-placeholder {
  width: 200px;
  height: 200px;
  border: 2px dashed var(--border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary-text-color);
  font-size: 14px;
}

.cover-actions {
  display: flex;
  gap: 8px;
}

.btn-select-cover,
.btn-extract-cover {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
}

.btn-select-cover:hover:not(:disabled),
.btn-extract-cover:hover:not(:disabled) {
  background: var(--hover-bg);
}

.btn-select-cover:disabled,
.btn-extract-cover:disabled {
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
  border-radius: 8px;
  z-index: 10;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
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
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #ff4757;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary:hover:not(:disabled) {
  background: #ff6b7a;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--hover-bg);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
