<template>
  <div v-if="modelValue" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>添加到歌单</h3>
        <button class="close-btn" @click="close"><X :size="24" /></button>
      </div>

      <div class="modal-body">
        <!-- 进度显示 -->
        <div v-if="isProcessing" class="progress-container">
          <div class="progress-text">批量添加中...</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div class="progress-info">
            {{ progress.current }} / {{ progress.total }} (成功{{ progress.added }}，跳过{{ progress.skipped }})
          </div>
        </div>

        <!-- 歌单列表 -->
        <div v-else-if="playlists.length > 0" class="playlist-list">
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="playlist-item"
            @click="selectPlaylist(playlist)"
          >
            <div class="playlist-icon"><ListMusic :size="20" /></div>
            <div class="playlist-info">
              <div class="playlist-name">{{ playlist.name }}</div>
              <div class="playlist-count">{{ playlist.songCount }} 首歌曲</div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <p>还没有创建歌单</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-create" @click="showCreateModal = true">
          + 新建歌单
        </button>
      </div>
    </div>

    <CreatePlaylistModal
      v-model="showCreateModal"
      @confirm="handleCreatePlaylist"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, ListMusic } from 'lucide-vue-next'
import CreatePlaylistModal from '@/components/music/CreatePlaylistModal.vue'
import type { MusicItem } from '@shared/types/music'

const props = defineProps<{
  modelValue: boolean
  musicToAd?: MusicItem | null
  musicListToAd?: MusicItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'added'): void
}>()

const playlists = ref<any[]>([])
const showCreateModal = ref(false)

const loadPlaylists = async () => {
  try {
    playlists.value = await window.electronAPI.getPlaylists()
  } catch (error) {
    console.error('Failed to load playlists:', error)
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadPlaylists()
  }
})

const close = () => {
  // 如果正在处理，不允许关闭
  if (isProcessing.value) return
  emit('update:modelValue', false)
}

const isProcessing = ref(false)
const progress = ref({ current: 0, total: 0, added: 0, skipped: 0 })
const progressPercent = computed(() => {
  if (progress.value.total === 0) return 0
  return Math.round((progress.value.current / progress.value.total) * 100)
})

const selectPlaylist = async (playlist: any) => {
  if (!props.musicToAd && !props.musicListToAd) return
  if (isProcessing.value) return // 防止重复点击

  try {
    isProcessing.value = true

    if (props.musicListToAd && props.musicListToAd.length > 0) {
      // 批量添加 - 显示进度（v1.0.6 使用 music_id）
      const musicIds = props.musicListToAd.map(m => m.id).filter((id): id is number => id !== undefined)
      progress.value = { current: 0, total: musicIds.length, added: 0, skipped: 0 }

      // 监听进度更新
      const handleProgress = (_event: any, data: any) => {
        progress.value = data
      }
      window.electronAPI.onBatchAddProgress(handleProgress)

      const result = await window.electronAPI.batchAddToPlaylist(playlist.id, musicIds)

      // 移除进度监听
      window.electronAPI.offBatchAddProgress(handleProgress)

      console.log(`批量添加完成: ${result.added} 个，跳过 ${result.skipped} 个`)

      // 显示结果提示
      if (result.added > 0) {
        const message = result.skipped > 0
          ? `成功添加 ${result.added} 首歌曲，${result.skipped} 首已存在`
          : `成功添加 ${result.added} 首歌曲`
        alert(message)
      } else if (result.skipped > 0) {
        alert(`所有歌曲已存在于该歌单中`)
      }
    } else if (props.musicToAd) {
      // 单个添加（v1.0.6 使用 music_id）
      try {
        await window.electronAPI.addToPlaylist(playlist.id, props.musicToAd.id)
        // 显示成功提示
        alert(`已添加到歌单 "${playlist.name}"`)
      } catch (error: any) {
        // 检查是否是重复添加的错误
        if (error?.message?.includes('UNIQUE constraint') || error?.message?.includes('已存在')) {
          alert(`该歌曲已存在于歌单 "${playlist.name}" 中`)
        } else {
          throw error // 重新抛出其他错误
        }
      }
    }

    // 触发全局事件通知歌单更新
    window.dispatchEvent(new CustomEvent('song-added-to-playlist'))
    emit('added')
    close()
  } catch (error) {
    console.error('添加到歌单失败:', error)
    alert('添加失败，请重试')
  } finally {
    isProcessing.value = false
    progress.value = { current: 0, total: 0, added: 0, skipped: 0 }
  }
}

const handleCreatePlaylist = async (name: string) => {
  try {
    await window.electronAPI.createPlaylist(name)
    await loadPlaylists()
    window.dispatchEvent(new CustomEvent('playlist-updated'))
  } catch (error) {
    console.error('Failed to create playlist:', error)
  }
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
  z-index: var(--z-modal);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-color);
}

.modal-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: var(--font-size-xl);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-color);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-base);
  cursor: pointer;
  transition: background var(--transition-base);
}

.playlist-item:hover {
  background: var(--hover-bg);
}

.playlist-icon {
  width: 40px;
  height: 40px;
  background: var(--bg-color);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.playlist-info {
  flex: 1;
  min-width: 0;
}

.playlist-name {
  font-size: var(--font-size-base);
  color: var(--text-color);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-count {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.empty-state {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-tertiary);
}

.modal-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.btn-create {
  width: 100%;
  padding: var(--spacing-md);
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-create:hover {
  background: var(--hover-bg);
  color: var(--text-color);
  border-color: var(--text-secondary);
}

/* 进度显示样式 */
.progress-container {
  padding: var(--spacing-xl);
  text-align: center;
}

.progress-text {
  font-size: var(--font-size-base);
  color: var(--text-color);
  margin-bottom: var(--spacing-md);
  font-weight: 500;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-color);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #31c48d, #0e9f6e);
  transition: width 0.3s ease;
}

.progress-info {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
```
