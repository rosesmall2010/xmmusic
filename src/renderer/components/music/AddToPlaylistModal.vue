<template>
  <div v-if="modelValue" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>添加到歌单</h3>
        <button class="close-btn" @click="close"><X :size="24" /></button>
      </div>

      <div class="modal-body">
        <div class="playlist-list" v-if="playlists.length > 0">
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
import { ref, onMounted, watch } from 'vue'
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
  emit('update:modelValue', false)
}

const selectPlaylist = async (playlist: any) => {
  if (!props.musicToAd && !props.musicListToAd) return

  try {
    if (props.musicListToAd && props.musicListToAd.length > 0) {
      // 批量添加
      const filePaths = props.musicListToAd.map(m => m.filePath)
      const result = await window.electronAPI.batchAddToPlaylist(playlist.id, filePaths)
      console.log(`Batch added ${result.added} songs`)
    } else if (props.musicToAd) {
      // 单个添加
      await window.electronAPI.addToPlaylist(playlist.id, props.musicToAd.filePath)
    }

    // 触发全局事件通知歌单更新
    window.dispatchEvent(new CustomEvent('song-added-to-playlist'))
    emit('added')
    close()
  } catch (error) {
    console.error('Failed to add music to playlist:', error)
    alert('添加失败，可能歌曲已存在于该歌单')
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
</style>
