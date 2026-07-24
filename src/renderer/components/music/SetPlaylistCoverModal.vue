<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ $t('playlist.setCover') }}</h3>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <div class="option-row">
          <button class="btn-primary" @click="pickImage" :disabled="saving">
            {{ $t('playlist.coverFromImage') }}
          </button>
          <button class="btn-secondary" @click="resetDefault" :disabled="saving">
            {{ $t('playlist.coverDefault') }}
          </button>
        </div>

        <div class="section-title">{{ $t('playlist.coverFromSong') }}</div>

        <div v-if="loadingCandidates" class="empty-hint">{{ $t('common.loading') }}</div>
        <div v-else-if="candidates.length === 0" class="empty-hint">
          {{ $t('playlist.coverNoSongCovers') }}
        </div>
        <div v-else class="candidate-grid">
          <button
            v-for="item in candidates"
            :key="item.musicId + '-' + item.coverPath"
            class="candidate-item"
            :disabled="saving"
            @click="pickSongCover(item)"
          >
            <img :src="toLocalFileUrl(item.coverPath)" :alt="item.title" />
            <div class="candidate-meta">
              <div class="title">{{ item.title }}</div>
              <div class="artist">{{ item.artist }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toLocalFileUrl } from '@/utils/media'

const props = defineProps<{
  show: boolean
  playlistId: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', coverPath: string | null): void
}>()

const { t } = useI18n()
const saving = ref(false)
const loadingCandidates = ref(false)
const candidates = ref<Array<{ musicId: number; title: string; artist: string; coverPath: string }>>([])

watch(() => props.show, async (visible) => {
  if (visible) {
    await loadCandidates()
  }
})

const loadCandidates = async () => {
  loadingCandidates.value = true
  try {
    candidates.value = await window.electronAPI.getPlaylistCoverCandidates(props.playlistId)
  } catch (error) {
    console.error('加载歌单封面候选失败:', error)
    candidates.value = []
  } finally {
    loadingCandidates.value = false
  }
}

const close = () => {
  if (saving.value) return
  emit('close')
}

const pickImage = async () => {
  try {
    const filePath = await window.electronAPI.selectImageFile()
    if (!filePath) return
    saving.value = true
    const coverPath = await window.electronAPI.setPlaylistCover(props.playlistId, {
      type: 'file',
      filePath
    })
    emit('updated', coverPath)
    emit('close')
  } catch (error: any) {
    console.error('设置歌单封面失败:', error)
    alert(t('playlist.coverSetError') + ': ' + (error?.message || error))
  } finally {
    saving.value = false
  }
}

const pickSongCover = async (item: { musicId: number; coverPath: string }) => {
  try {
    saving.value = true
    // 直接带上候选封面路径，避免主进程二次查库时路径不一致
    const coverPath = await window.electronAPI.setPlaylistCover(props.playlistId, {
      type: 'music',
      musicId: item.musicId,
      filePath: item.coverPath
    })
    emit('updated', coverPath)
    emit('close')
  } catch (error: any) {
    console.error('使用歌曲封面失败:', error)
    alert(t('playlist.coverSetError') + ': ' + (error?.message || error))
  } finally {
    saving.value = false
  }
}

const resetDefault = async () => {
  try {
    saving.value = true
    await window.electronAPI.setPlaylistCover(props.playlistId, { type: 'default' })
    emit('updated', null)
    emit('close')
  } catch (error: any) {
    console.error('恢复默认封面失败:', error)
    alert(t('playlist.coverSetError') + ': ' + (error?.message || error))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  width: min(560px, 92vw);
  max-height: 80vh;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
}

.modal-body {
  padding: var(--spacing-lg);
  overflow: auto;
}

.option-row {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.btn-primary,
.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-base);
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.candidate-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.section-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
}

.empty-hint {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  padding: var(--spacing-md) 0;
}

.candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--spacing-md);
}

.candidate-item {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
}

.candidate-item:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.candidate-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.candidate-meta {
  padding: var(--spacing-sm);
}

.candidate-meta .title {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.candidate-meta .artist {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
