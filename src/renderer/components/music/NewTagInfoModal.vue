<template>
  <!-- 三栏标签对比编辑，禁止点遮罩关闭，避免误触丢失未保存内容 -->
  <div v-if="show" class="dialog-overlay">
    <div class="dialog new-tag-dialog">
      <h3>{{ $t('tagInfoEditor.title') }}</h3>

      <div class="file-info">
        <p class="filename">{{ music?.fileName }}</p>
      </div>

      <div v-if="loadingMetadata" class="loading-metadata">
        {{ $t('tagEditor.loadingMetadata') }}
      </div>

      <template v-else>
        <div class="batch-toolbar">
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.batchGb2312')"
            @click="batchApply('gb2312')"
          >
            <Binary :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.batchGbk')"
            @click="batchApply('gbk')"
          >
            <Languages :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.batchCopyId3')"
            @click="batchApply('id3')"
          >
            <ClipboardCopy :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.batchCopyDb')"
            @click="batchApply('db')"
          >
            <Database :size="16" />
          </button>
          <span class="toolbar-divider"></span>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.swapArtistTitle')"
            @click="swapArtistTitle"
          >
            <ArrowLeftRight :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.guessFromFilename')"
            @click="guessFromFilename"
          >
            <Wand2 :size="16" />
          </button>
          <span class="toolbar-divider"></span>
          <button
            type="button"
            class="icon-btn"
            :disabled="loading"
            :data-tip="$t('tagInfoEditor.reset')"
            @click="resetEdited"
          >
            <RotateCcw :size="16" />
          </button>
        </div>

        <p v-if="!id3Snapshot" class="field-hint">{{ $t('tagInfoEditor.noId3Data') }}</p>
        <p v-if="!isMp3" class="field-hint">{{ $t('tagInfoEditor.nonMp3Hint') }}</p>

        <table class="tag-table">
          <thead>
            <tr>
              <th class="col-label"></th>
              <th>{{ $t('tagInfoEditor.columnDb') }}</th>
              <th>{{ $t('tagInfoEditor.columnId3') }}</th>
              <th>{{ $t('tagInfoEditor.columnEdited') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in FIELDS" :key="field">
              <td class="col-label">{{ fieldLabel(field) }}</td>
              <td class="col-value col-db">
                <span class="value-text">{{ display(dbSnapshot[field]) }}</span>
                <div class="field-actions">
                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="loading"
                    :data-tip="$t('tagInfoEditor.copyFromDb')"
                    @click="applyFromDb(field)"
                  >
                    <Database :size="14" />
                  </button>
                </div>
              </td>
              <td class="col-value col-id3">
                <span class="value-text">{{ display(id3Snapshot?.[field]) }}</span>
                <div class="field-actions" v-if="hasRawValue(field)">
                  <button
                    v-if="isEncodable(field)"
                    type="button"
                    class="icon-btn"
                    :disabled="loading"
                    :data-tip="$t('tagInfoEditor.convertGb2312')"
                    @click="applyFromId3(field, 'gb2312')"
                  >
                    <Binary :size="14" />
                  </button>
                  <button
                    v-if="isEncodable(field)"
                    type="button"
                    class="icon-btn"
                    :disabled="loading"
                    :data-tip="$t('tagInfoEditor.convertGbk')"
                    @click="applyFromId3(field, 'gbk')"
                  >
                    <Languages :size="14" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="loading"
                    :data-tip="$t('tagInfoEditor.copyFromId3')"
                    @click="applyFromId3(field)"
                  >
                    <ClipboardCopy :size="14" />
                  </button>
                </div>
              </td>
              <td class="col-value col-edited">
                <input v-model="editedData[field]" type="text" :disabled="loading" @keyup.enter="save" />
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <div v-if="loading" class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
        </div>
      </div>

      <div class="dialog-actions">
        <button @click="save" class="btn-primary" :disabled="loading || !hasChanges">
          {{ $t('tagInfoEditor.save') }}
        </button>
        <button @click="close" class="btn-secondary" :disabled="loading">{{ $t('tagInfoEditor.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeftRight, Wand2, RotateCcw, Database, ClipboardCopy, Binary, Languages } from 'lucide-vue-next'
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

const FIELDS: TagField[] = ['artist', 'title', 'album', 'year', 'genre']
const ENCODABLE_FIELDS: TagField[] = ['artist', 'title', 'album', 'genre']

const loading = ref(false)
const loadingMetadata = ref(false)
// shallowRef：readRawID3Tags 返回的对象会原样传给 convertID3TagsEncoding 走 IPC，
// 若用 ref() 会被 Vue 自动包一层 reactive Proxy，结构化克隆时报 "object could not be cloned"
const id3Snapshot = shallowRef<TagSnapshot | null>(null)
const dbSnapshot = ref<Record<TagField, string>>({ artist: '', title: '', album: '', year: '', genre: '' })
const editedData = reactive<Record<TagField, string>>({ artist: '', title: '', album: '', year: '', genre: '' })

const isMp3 = computed(() => !!props.music?.filePath && /\.mp3$/i.test(props.music.filePath))
const hasChanges = computed(() => FIELDS.some((f) => editedData[f] !== dbSnapshot.value[f]))

watch(
  () => props.show,
  (newVal) => {
    if (newVal && props.music) {
      loadData(props.music)
    } else {
      id3Snapshot.value = null
    }
  }
)

const buildDbSnapshot = (music: MusicItem): Record<TagField, string> => ({
  artist: music.artist || '',
  title: music.title || '',
  album: music.album || '',
  year: music.year != null ? String(music.year) : '',
  genre: music.genre || ''
})

const loadData = async (music: MusicItem) => {
  dbSnapshot.value = buildDbSnapshot(music)
  Object.assign(editedData, dbSnapshot.value)
  id3Snapshot.value = null

  try {
    loadingMetadata.value = true
    const tags = await window.electronAPI.readRawID3Tags(music.filePath)
    if (tags && (tags.title || tags.artist || tags.album || tags.genre || tags.year)) {
      id3Snapshot.value = tags
    }
  } catch (error: any) {
    console.error('加载ID3标签失败:', error)
  } finally {
    loadingMetadata.value = false
  }
}

const fieldLabel = (field: TagField) => {
  const map: Record<TagField, string> = {
    artist: t('tagInfoEditor.artistLabel'),
    title: t('tagInfoEditor.titleLabel'),
    album: t('tagInfoEditor.albumLabel'),
    year: t('tagInfoEditor.yearLabel'),
    genre: t('tagInfoEditor.genreLabel')
  }
  return map[field]
}

const isEncodable = (field: TagField) => (ENCODABLE_FIELDS as string[]).includes(field)

const display = (v: string | undefined | null) => (v && String(v).trim() ? v : '-')

const hasRawValue = (field: TagField) => {
  const v = id3Snapshot.value?.[field]
  return !!(v && String(v).trim())
}

const applyFromId3 = async (field: TagField, encoding?: EncodingName) => {
  if (!id3Snapshot.value || !hasRawValue(field)) return

  if (!encoding) {
    editedData[field] = String(id3Snapshot.value[field] || '')
    return
  }

  try {
    loading.value = true
    const converted = await window.electronAPI.convertID3TagsEncoding(id3Snapshot.value, encoding)
    const value = converted[field]
    if (value != null && String(value).trim()) {
      editedData[field] = String(value)
    }
  } catch (error: any) {
    console.error(`字段 ${field} ${encoding} 转换失败:`, error)
    alert(t('tagInfoEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const applyFromDb = (field: TagField) => {
  editedData[field] = dbSnapshot.value[field]
}

const batchApply = async (source: 'gb2312' | 'gbk' | 'id3' | 'db') => {
  if (source === 'db') {
    FIELDS.forEach((f) => (editedData[f] = dbSnapshot.value[f]))
    return
  }

  if (source === 'id3') {
    if (!id3Snapshot.value) return
    FIELDS.forEach((f) => {
      if (hasRawValue(f)) editedData[f] = String(id3Snapshot.value![f] || '')
    })
    return
  }

  if (!id3Snapshot.value) return

  try {
    loading.value = true
    const converted = await window.electronAPI.convertID3TagsEncoding(id3Snapshot.value, source)
    ENCODABLE_FIELDS.forEach((f) => {
      const value = converted[f]
      if (value != null && String(value).trim()) editedData[f] = String(value)
    })
  } catch (error: any) {
    console.error(`整体 ${source} 转换失败:`, error)
    alert(t('tagInfoEditor.saveError') + ': ' + error.message)
  } finally {
    loading.value = false
  }
}

const swapArtistTitle = () => {
  const temp = editedData.artist
  editedData.artist = editedData.title
  editedData.title = temp
}

const guessFromFilename = () => {
  if (!props.music) return
  const fileName = props.music.fileName || props.music.filePath.split(/[/\\]/).pop() || ''
  const parsed = parseFilenameForTags(fileName)
  editedData.artist = parsed.artist
  editedData.title = parsed.title
}

const resetEdited = () => {
  Object.assign(editedData, dbSnapshot.value)
}

const parseYearForSave = (): number | null => {
  const raw = editedData.year.trim()
  if (!raw) return null
  const year = parseInt(raw, 10)
  return Number.isNaN(year) ? null : year
}

const buildUpdates = () => ({
  artist: editedData.artist.trim(),
  album: editedData.album.trim() || null,
  title: editedData.title.trim(),
  year: parseYearForSave(),
  genre: editedData.genre.trim() || null
})

const save = async () => {
  if (!hasChanges.value || !props.music) return

  try {
    loading.value = true
    const updates = buildUpdates()
    let updatedMusic: MusicItem | null = null

    if (isMp3.value) {
      const success = await window.electronAPI.updateMusicMetadata(props.music.id, updates)
      if (success) {
        updatedMusic = {
          ...props.music,
          ...updates,
          album: updates.album || undefined,
          genre: updates.genre || undefined,
          year: updates.year ?? undefined
        } as MusicItem
      }
    } else {
      updatedMusic = await window.electronAPI.syncMusicMetadataToDb(props.music.id, updates)
    }

    if (!updatedMusic) {
      alert(t('tagInfoEditor.saveError'))
      loading.value = false
      return
    }

    window.dispatchEvent(new CustomEvent('music-metadata-updated', { detail: updatedMusic }))
    emit('saved')
    setTimeout(() => {
      loading.value = false
      close()
    }, 100)
  } catch (error: any) {
    console.error('保存标签失败:', error)
    alert(t('tagInfoEditor.saveError') + ': ' + (error?.message || error))
    loading.value = false
  }
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
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.new-tag-dialog {
  width: 640px;
  max-width: 92%;
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

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
}

.field-hint {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.tag-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.tag-table th {
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.tag-table td {
  padding: var(--spacing-sm);
  border-bottom: 1px dashed var(--border-color);
  vertical-align: top;
}

.col-label {
  width: 60px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-value {
  width: 150px;
}

.col-db {
  width: 110px;
}

.col-id3 {
  width: 150px;
}

.col-edited {
  width: auto;
}

.value-text {
  display: block;
  color: var(--text-color);
  word-break: break-all;
  margin-bottom: 4px;
  min-height: 1.4em;
}

.field-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.col-value input {
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-primary);
  color: var(--text-color);
  font-size: var(--font-size-sm);
}

.col-value input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.col-value input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  position: relative;
}

.icon-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--hover-bg);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
  z-index: 30;
}

.icon-btn:hover::after {
  opacity: 1;
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
  align-items: center;
  justify-content: center;
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
  to { transform: rotate(360deg); }
}

.loading-metadata {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
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

@media (max-width: 768px) {
  .new-tag-dialog {
    width: 95%;
  }

  .col-value {
    width: auto;
  }
}
</style>
