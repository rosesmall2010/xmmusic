<template>
  <div v-if="show" class="dialog-overlay" @click.self="close">
    <div class="dialog edit-tag-dialog">
      <h3>{{ $t('tagEditor.title') }}</h3>

      <div class="file-info">
        <p class="filename">{{ music?.fileName }}</p>
      </div>

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

        <div class="form-group">
          <label>{{ $t('tagEditor.genreLabel') }} <span class="hint">(Genre)</span></label>
          <div class="genre-field-wrapper">
            <input
              v-model="formData.genre"
              type="text"
              :placeholder="$t('tagEditor.genrePlaceholder')"
              :disabled="loading"
              @keyup.enter="save"
              class="genre-input"
            />
            <div v-if="originalGenre && isGenreCorrupted" class="encoding-convert-section">
              <div class="original-genre-display">
                <span class="label">{{ $t('tagEditor.originalGenre') }}:</span>
                <span class="value corrupted">{{ originalGenre }}</span>
              </div>
              <div class="convert-buttons">
                <button
                  v-for="encoding in ['GBK', 'GB2312', 'ANSI']"
                  :key="encoding"
                  @click="convertGenre(encoding)"
                  class="btn-convert"
                  :disabled="loading || converting"
                >
                  {{ $t('tagEditor.convertFrom', { encoding }) }}
                </button>
              </div>
              <div v-if="convertedGenre" class="converted-genre-display">
                <span class="label">{{ $t('tagEditor.convertedGenre') }}:</span>
                <span class="value converted">{{ convertedGenre }}</span>
                <button
                  @click="applyConvertedGenre"
                  class="btn-apply"
                  :disabled="loading"
                >
                  {{ $t('tagEditor.applyAndSave') }}
                </button>
              </div>
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
  title: '',
  genre: ''
})

const loading = ref(false)
const originalGenre = ref<string | null>(null)
const convertedGenre = ref<string | null>(null)
const converting = ref(false)

const hasChanges = computed(() => {
  if (!props.music) return false

  return (
    formData.value.artist !== props.music.artist ||
    formData.value.album !== (props.music.album || '') ||
    formData.value.title !== props.music.title ||
    formData.value.genre !== (props.music.genre || '')
  )
})

// 检测是否为乱码（简单检测：包含无效字符或看起来像乱码）
const isGenreCorrupted = computed(() => {
  if (!originalGenre.value) return false
  const genre = originalGenre.value
  
  // 检查是否包含替换字符（Unicode 替换字符）
  if (/[\uFFFD]/.test(genre)) return true
  
  // 检查是否包含控制字符（除了常见的空白字符）
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(genre)) return true
  
  // 检查是否看起来像乱码（包含很多非ASCII且非中文的字符）
  const nonAsciiNonChinese = genre.match(/[^\x20-\x7E\u4e00-\u9fa5]/g)
  if (nonAsciiNonChinese && nonAsciiNonChinese.length > genre.length * 0.3) {
    return true
  }
  
  return false
})

watch(() => props.show, (newVal) => {
  if (newVal && props.music) {
    loadMusicData(props.music)
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
    title: parsed.title || music.title,
    genre: music.genre || ''
  }
  
  // 保存原始 genre 用于编码转换
  originalGenre.value = music.genre || null
  convertedGenre.value = null
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
      title: formData.value.title.trim(),
      genre: formData.value.genre.trim() || null
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

const convertGenre = async (encoding: string) => {
  if (!originalGenre.value) return
  
  try {
    converting.value = true
    const result = await window.electronAPI.convertStringEncoding(originalGenre.value, encoding.toLowerCase())
    
    if (result.success) {
      convertedGenre.value = result.result
    } else {
      alert(t('tagEditor.convertFailed', { encoding, error: result.error || '' }))
    }
  } catch (error: any) {
    console.error('编码转换失败:', error)
    alert(t('tagEditor.convertError') + ': ' + error.message)
  } finally {
    converting.value = false
  }
}

const applyConvertedGenre = async () => {
  if (!convertedGenre.value) return
  
  formData.value.genre = convertedGenre.value
  convertedGenre.value = null
  
  // 自动保存
  await save()
}

const close = () => {
  if (!loading.value) {
    originalGenre.value = null
    convertedGenre.value = null
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

.genre-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.genre-input {
  width: 100%;
}

.encoding-convert-section {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  border: 1px solid var(--border-color);
}

.original-genre-display,
.converted-genre-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.original-genre-display .label,
.converted-genre-display .label {
  color: var(--text-secondary);
  font-weight: 500;
}

.original-genre-display .value.corrupted {
  color: var(--color-error, #ef4444);
  font-family: monospace;
}

.converted-genre-display .value.converted {
  color: var(--color-success, #10b981);
  font-weight: 500;
}

.convert-buttons {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-sm);
}

.btn-convert {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--font-size-xs);
  transition: all var(--transition-base);
}

.btn-convert:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-convert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-apply {
  padding: var(--spacing-xs) var(--spacing-md);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-weight: 500;
  transition: all var(--transition-base);
  margin-left: var(--spacing-sm);
}

.btn-apply:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
