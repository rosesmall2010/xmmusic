<template>
  <div v-if="show" class="dialog-overlay" @click.self="close">
    <div class="dialog edit-tag-dialog" :class="{ 'has-id3': rawID3Tags }">
      <h3>{{ $t('tagEditor.title') }}</h3>

      <div class="file-info">
        <p class="filename">{{ music?.fileName }}</p>
      </div>

      <div class="main-content">
        <!-- 左侧：表单编辑区域（各字段均可手动编辑） -->
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

            <div class="form-row">
              <div class="form-group">
                <label>{{ $t('tagEditor.yearLabel') }} <span class="hint">(Year)</span></label>
                <input
                  v-model="formData.year"
                  type="text"
                  inputmode="numeric"
                  :placeholder="$t('tagEditor.yearPlaceholder')"
                  :disabled="loading"
                  @keyup.enter="save"
                />
              </div>
              <div class="form-group">
                <label>{{ $t('tagEditor.genreLabel') }} <span class="hint">(Genre)</span></label>
                <input
                  v-model="formData.genre"
                  type="text"
                  :placeholder="$t('tagEditor.genrePlaceholder')"
                  :disabled="loading"
                  @keyup.enter="save"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-if="rawID3Tags || loadingMetadata" class="divider"></div>

        <!-- 右侧：ID3 元数据 + 整包/单字段编码转换 -->
        <div v-if="rawID3Tags || loadingMetadata" class="id3-section">
          <h4 class="section-title">{{ $t('tagEditor.id3Metadata') }}</h4>

          <div v-if="loadingMetadata" class="loading-metadata">
            {{ $t('tagEditor.loadingMetadata') }}
          </div>

          <div v-else-if="rawID3Tags" class="metadata-display">
            <div class="metadata-group">
              <label>{{ $t('tagEditor.rawMetadata') }}</label>
              <p class="field-hint">{{ $t('tagEditor.perFieldConvertHint') }}</p>
              <div class="metadata-info">
                <div
                  v-for="field in tagFields"
                  :key="'raw-' + field"
                  class="metadata-item with-actions"
                >
                  <span class="metadata-label">{{ fieldLabel(field) }}:</span>
                  <span class="metadata-value">{{ displayRaw(field) }}</span>
                  <div class="field-actions" v-if="hasRawValue(field)">
                    <button
                      type="button"
                      class="btn-field"
                      :disabled="loading"
                      :title="$t('tagEditor.convertFieldGB2312')"
                      @click="convertSingleField(field, 'gb2312')"
                    >
                      GB2312
                    </button>
                    <button
                      type="button"
                      class="btn-field"
                      :disabled="loading"
                      :title="$t('tagEditor.convertFieldGBK')"
                      @click="convertSingleField(field, 'gbk')"
                    >
                      GBK
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="convertedTags" class="metadata-group converted-group">
              <label>{{ $t('tagEditor.convertedMetadata') }}</label>
              <div class="metadata-info converted-info">
                <div
                  v-for="field in tagFields"
                  :key="'converted-' + field"
                  class="metadata-item with-actions"
                >
                  <span class="metadata-label">{{ fieldLabel(field) }}:</span>
                  <span class="metadata-value converted">{{ displayConverted(field) }}</span>
                  <div class="field-actions" v-if="hasConvertedValue(field)">
                    <button
                      type="button"
                      class="btn-field btn-field-apply"
                      :disabled="loading"
                      @click="applyConvertedField(field)"
                    >
                      {{ $t('tagEditor.applyThisField') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="encoding-actions">
              <button @click="convertAll('gb2312')" class="btn-convert" :disabled="loading || !rawID3Tags">
                {{ $t('tagEditor.convertFromGB2312') }}
              </button>
              <button @click="convertAll('gbk')" class="btn-convert" :disabled="loading || !rawID3Tags">
                {{ $t('tagEditor.convertFromGBK') }}
              </button>
              <button
                v-if="convertedTags"
                @click="applyAllConvertedTags"
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
          <p>{{ loadingMessage }}</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button
          @click="syncToDatabase"
          class="btn-sync"
          :disabled="loading || !canSync"
          :title="$t('tagEditor.syncToDatabaseHint')"
        >
          {{ $t('tagEditor.syncToDatabase') }}
        </button>
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

type TagField = 'artist' | 'title' | 'album' | 'year' | 'genre'
type EncodingName = 'gb2312' | 'gbk'

interface TagSnapshot {
  title: string
  artist: string
  album: string
  year?: string
  genre?: string
}

interface Props {
  show: boolean
  music: MusicItem | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const tagFields: TagField[] = ['artist', 'title', 'album', 'year', 'genre']

const formData = ref({
  artist: '',
  album: '',
  title: '',
  year: '',
  genre: ''
})

const loading = ref(false)
const loadingMessage = ref('')
const loadingMetadata = ref(false)
const rawID3Tags = ref<TagSnapshot | null>(null)
const convertedTags = ref<TagSnapshot | null>(null)

const musicYearText = computed(() =>
  props.music?.year != null && props.music.year !== undefined ? String(props.music.year) : ''
)

const hasChanges = computed(() => {
  if (!props.music) return false
  return (
    formData.value.artist !== props.music.artist ||
    formData.value.album !== (props.music.album || '') ||
    formData.value.title !== props.music.title ||
    formData.value.year !== musicYearText.value ||
    formData.value.genre !== (props.music.genre || '')
  )
})

const canSync = computed(() => {
  return (
    !!props.music &&
    formData.value.title.trim().length > 0 &&
    formData.value.artist.trim().length > 0
  )
})

watch(() => props.show, (newVal) => {
  if (newVal && props.music) {
    loadMusicData(props.music)
    loadRawID3Tags()
  } else {
    rawID3Tags.value = null
    convertedTags.value = null
  }
})

const fieldLabel = (field: TagField) => {
  const map: Record<TagField, string> = {
    artist: t('tagEditor.artistLabel'),
    title: t('tagEditor.titleLabel'),
    album: t('tagEditor.albumLabel'),
    year: t('tagEditor.yearLabel'),
    genre: t('tagEditor.genreLabel')
  }
  return map[field]
}

const displayRaw = (field: TagField) => {
  const v = rawID3Tags.value?.[field]
  return v && String(v).trim() ? v : '-'
}

const displayConverted = (field: TagField) => {
  const v = convertedTags.value?.[field]
  return v && String(v).trim() ? v : '-'
}

const hasRawValue = (field: TagField) => {
  const v = rawID3Tags.value?.[field]
  return !!(v && String(v).trim())
}

const hasConvertedValue = (field: TagField) => {
  const v = convertedTags.value?.[field]
  return !!(v && String(v).trim())
}

const loadMusicData = (music: MusicItem) => {
  const fileName = music.fileName || music.filePath.split(/[/\\]/).pop() || ''
  const parsed = parseFilenameForTags(fileName, {
    artist: music.artist,
    title: music.title,
    album: music.album || ''
  })

  formData.value = {
    artist: parsed.artist || music.artist,
    // 专辑优先用解析/库内专辑，不用歌手名污染
    album: parsed.album || music.album || '',
    title: parsed.title || music.title,
    year: music.year != null ? String(music.year) : '',
    genre: music.genre || ''
  }
}

const buildFallbackRaw = (music: MusicItem): TagSnapshot => ({
  title: music.title || '',
  artist: music.artist || '',
  album: music.album || '',
  year: music.year != null ? String(music.year) : undefined,
  genre: music.genre || undefined
})

const loadRawID3Tags = async () => {
  if (!props.music?.filePath) return

  try {
    loadingMetadata.value = true
    const tags = await window.electronAPI.readRawID3Tags(props.music.filePath)

    if (!tags || (!tags.title && !tags.artist && !tags.album && !tags.genre && !tags.year)) {
      rawID3Tags.value = buildFallbackRaw(props.music)
    } else {
      rawID3Tags.value = tags
      // 原始 ID3 有年份/流派且表单仍空时，预填便于手动改
      if (!formData.value.year && tags.year) formData.value.year = tags.year
      if (!formData.value.genre && tags.genre) formData.value.genre = tags.genre
    }
    convertedTags.value = null
  } catch (error: any) {
    console.error('加载ID3标签失败:', error)
    if (props.music) {
      rawID3Tags.value = buildFallbackRaw(props.music)
    } else {
      rawID3Tags.value = null
    }
  } finally {
    loadingMetadata.value = false
  }
}

const snapshotFromRaw = (): TagSnapshot => ({
  title: rawID3Tags.value?.title || '',
  artist: rawID3Tags.value?.artist || '',
  album: rawID3Tags.value?.album || '',
  year: rawID3Tags.value?.year,
  genre: rawID3Tags.value?.genre
})

const convertAll = async (encoding: EncodingName) => {
  if (!rawID3Tags.value) return

  try {
    loading.value = true
    const converted = await window.electronAPI.convertID3TagsEncoding(snapshotFromRaw(), encoding)
    convertedTags.value = {
      title: converted.title,
      artist: converted.artist,
      album: converted.album,
      year: converted.year,
      genre: converted.genre
    }
  } catch (error: any) {
    console.error(`${encoding} 整包转换失败:`, error)
    alert(t('tagEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

/** 单字段编码转换：直接写入左侧对应表单项，便于单独修复流派/年份等 */
const convertSingleField = async (field: TagField, encoding: EncodingName) => {
  if (!rawID3Tags.value || !hasRawValue(field)) return

  try {
    loading.value = true
    const converted = await window.electronAPI.convertID3TagsEncoding(snapshotFromRaw(), encoding)
    const value = converted[field]
    if (value != null && String(value).trim()) {
      formData.value[field] = String(value)
      // 同步刷新该字段的转换预览
      convertedTags.value = {
        ...(convertedTags.value || snapshotFromRaw()),
        [field]: String(value)
      }
    }
  } catch (error: any) {
    console.error(`单字段 ${field} ${encoding} 转换失败:`, error)
    alert(t('tagEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const applyConvertedField = (field: TagField) => {
  if (!convertedTags.value || !hasConvertedValue(field)) return
  formData.value[field] = String(convertedTags.value[field] || '')
}

const applyAllConvertedTags = () => {
  if (!convertedTags.value) return
  formData.value = {
    artist: convertedTags.value.artist || formData.value.artist,
    title: convertedTags.value.title || formData.value.title,
    album: convertedTags.value.album || formData.value.album,
    year: convertedTags.value.year || formData.value.year,
    genre: convertedTags.value.genre || formData.value.genre
  }
}

const parseYearForSave = (): number | null => {
  const raw = formData.value.year.trim()
  if (!raw) return null
  const year = parseInt(raw, 10)
  return Number.isNaN(year) ? null : year
}

const buildUpdates = () => ({
  artist: formData.value.artist.trim(),
  album: formData.value.album.trim() || null,
  title: formData.value.title.trim(),
  year: parseYearForSave(),
  genre: formData.value.genre.trim() || null
})

const syncToDatabase = async () => {
  if (!canSync.value || !props.music) return

  try {
    loading.value = true
    loadingMessage.value = t('tagEditor.syncing')
    const updatedMusic = await window.electronAPI.syncMusicMetadataToDb(props.music.id, buildUpdates())
    window.dispatchEvent(new CustomEvent('music-metadata-updated', {
      detail: updatedMusic
    }))
    emit('saved')
    setTimeout(() => {
      loading.value = false
      close()
    }, 300)
  } catch (error: any) {
    console.error('同步到数据库失败:', error)
    alert(t('tagEditor.syncError') + ': ' + (error?.message || error))
    loading.value = false
  }
}

const save = async () => {
  if (!hasChanges.value || !props.music) {
    return
  }

  try {
    loading.value = true
    loadingMessage.value = t('tagEditor.saving')

    const updates = buildUpdates()
    const success = await window.electronAPI.updateMusicMetadata(props.music.id, updates)

    if (success) {
      const updatedMusic = {
        ...props.music,
        ...updates,
        album: updates.album || undefined,
        genre: updates.genre || undefined,
        year: updates.year ?? undefined
      }

      window.dispatchEvent(new CustomEvent('music-metadata-updated', {
        detail: updatedMusic
      }))

      emit('saved')
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
  const temp = formData.value.artist
  formData.value.artist = formData.value.title
  formData.value.title = temp
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

.edit-tag-dialog.has-id3 {
  width: 920px;
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

.main-content {
  display: flex;
  gap: 0;
  align-items: stretch;
}

.form-section {
  flex: 1;
  min-width: 0;
}

.divider {
  width: 1px;
  background: var(--border-color);
  margin: 0 var(--spacing-lg);
  align-self: stretch;
}

.id3-section {
  flex: 1.15;
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

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
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

.btn-sync {
  padding: var(--spacing-sm) var(--spacing-xl);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: var(--font-size-base);
  font-weight: 500;
  transition: all var(--transition-base);
  margin-right: auto;
}

.btn-sync:hover:not(:disabled) {
  background: var(--color-primary-alpha-10, rgba(49, 194, 124, 0.1));
}

.btn-sync:disabled {
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

.field-hint {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
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
  align-items: flex-start;
}

.metadata-item.with-actions {
  align-items: center;
}

.metadata-item:not(:last-child) {
  border-bottom: 1px dashed var(--border-color);
}

.metadata-label {
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 42px;
  flex-shrink: 0;
}

.metadata-value {
  color: var(--text-color);
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.metadata-value.converted {
  color: var(--color-primary);
  font-weight: 500;
}

.field-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-field {
  padding: 2px 6px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.btn-field:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-field-apply {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
