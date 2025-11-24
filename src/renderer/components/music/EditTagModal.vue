<template>
  <div v-if="show" class="dialog-overlay" @click.self="close">
    <div class="dialog edit-tag-dialog">
      <h3>编辑标签</h3>

      <div class="file-info">
        <p class="filename">{{ music?.fileName }}</p>
      </div>

      <div class="form-content">
        <div class="form-group">
          <label>歌手 <span class="hint">(Artist)</span></label>
          <input
            v-model="formData.artist"
            type="text"
            placeholder="输入歌手名"
            :disabled="loading"
            @keyup.enter="save"
          />
        </div>

        <!-- Swap Button -->
        <div class="swap-button-container">
          <button @click="swapArtistAndTitle" class="btn-swap" :disabled="loading" type="button">
            <ArrowLeftRight :size="16" />
            <span>对调</span>
          </button>
        </div>

        <div class="form-group">
          <label>歌曲名 <span class="hint">(Title)</span></label>
          <input
            v-model="formData.title"
            type="text"
            placeholder="输入歌曲名"
            :disabled="loading"
            @keyup.enter="save"
          />
        </div>

        <div class="form-group">
          <label>专辑 <span class="hint">(Album)</span></label>
          <input
            v-model="formData.album"
            type="text"
            placeholder="输入专辑名"
            :disabled="loading"
            @keyup.enter="save"
          />
        </div>
      </div>

      <div v-if="loading" class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>正在保存...</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button @click="save" class="btn-primary" :disabled="loading || !hasChanges">
          保存
        </button>
        <button @click="close" class="btn-secondary" :disabled="loading">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeftRight } from 'lucide-vue-next'
import type { MusicItem } from '@shared/types/music'
import { parseFilenameForTags } from '@/utils/parseFilename'

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
      // 触发刷新事件
      window.dispatchEvent(new CustomEvent('music-metadata-updated'))
      emit('saved')
      // 短暂延迟后关闭对话框，确保刷新完成
      setTimeout(() => {
        loading.value = false
        close()
      }, 100)
    } else {
      alert('保存失败，请重试')
      loading.value = false
    }
  } catch (error: any) {
    console.error('保存标签失败:', error)
    alert(`保存失败: ${error.message}`)
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
</style>
