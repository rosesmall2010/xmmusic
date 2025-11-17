<template>
  <div class="play-queue-view">
    <div class="queue-header">
      <h2>播放队列</h2>
      <div class="queue-actions">
        <button @click="clearQueue" class="btn-clear" :disabled="queue.length === 0">
          清空队列
        </button>
        <button @click="shuffleQueue" class="btn-shuffle" :disabled="queue.length === 0">
          随机排序
        </button>
      </div>
    </div>

    <div class="queue-info">
      <span>共 {{ queue.length }} 首歌曲</span>
      <span v-if="currentIndex >= 0">当前播放: 第 {{ currentIndex + 1 }} 首</span>
    </div>

    <div class="queue-list">
      <div
        v-for="(item, index) in queue"
        :key="item.id"
        class="queue-item"
        :class="{ active: index === currentIndex, playing: index === currentIndex && isPlaying }"
        @click="playFromQueue(index)"
        @contextmenu.prevent="showContextMenu($event, item, index)"
      >
        <div class="item-index">{{ index + 1 }}</div>
        <div class="item-cover">
          <DefaultCover v-if="!item.coverPath" size="small" />
          <img v-else :src="item.coverPath" alt="封面" />
        </div>
        <div class="item-info">
          <div class="item-title">{{ item.title }}</div>
          <div class="item-artist">{{ item.artist }}</div>
        </div>
        <div class="item-duration">{{ formatDuration(item.duration) }}</div>
        <div class="item-actions">
          <button @click.stop="removeFromQueue(index)" class="btn-remove" title="移除">
            ✕
          </button>
        </div>
      </div>

      <div v-if="queue.length === 0" class="empty-queue">
        <p>播放队列为空</p>
        <p class="hint">从音乐列表添加歌曲到队列</p>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="playNowFromQueue">
        <span class="menu-icon">▶️</span>
        <span>立即播放</span>
      </div>
      <div class="menu-item" @click="removeFromQueueMenu">
        <span class="menu-icon">🗑️</span>
        <span>从队列移除</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="moveToTop">
        <span class="menu-icon">⬆️</span>
        <span>移到顶部</span>
      </div>
      <div class="menu-item" @click="moveToBottom">
        <span class="menu-icon">⬇️</span>
        <span>移到底部</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from './DefaultCover.vue'
import type { MusicItem } from '@shared/types/music'

const playerStore = usePlayerStore()
const { play } = usePlayer()

const queue = computed(() => playerStore.queue)
const currentIndex = computed(() => playerStore.currentQueueIndex)
const isPlaying = computed(() => playerStore.isPlaying)

const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  item: null as MusicItem | null,
  index: -1
})

const showContextMenu = (event: MouseEvent, item: MusicItem, index: number) => {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    item,
    index
  }
}

const hideContextMenu = () => {
  contextMenu.value.show = false
}

const playFromQueue = async (index: number) => {
  if (index >= 0 && index < queue.value.length) {
    playerStore.setCurrentQueueIndex(index)
    await play(queue.value[index])
  }
  hideContextMenu()
}

const playNowFromQueue = async () => {
  if (contextMenu.value.index >= 0) {
    await playFromQueue(contextMenu.value.index)
  }
}

const removeFromQueue = (index: number) => {
  playerStore.removeFromQueue(index)
  hideContextMenu()
}

const removeFromQueueMenu = () => {
  if (contextMenu.value.index >= 0) {
    removeFromQueue(contextMenu.value.index)
  }
}

const clearQueue = () => {
  if (confirm('确定要清空播放队列吗？')) {
    playerStore.clearQueue()
  }
}

const shuffleQueue = () => {
  playerStore.shuffleQueue()
}

const moveToTop = () => {
  if (contextMenu.value.index > 0) {
    playerStore.moveInQueue(contextMenu.value.index, 0)
  }
  hideContextMenu()
}

const moveToBottom = () => {
  if (contextMenu.value.index >= 0 && contextMenu.value.index < queue.value.length - 1) {
    playerStore.moveInQueue(contextMenu.value.index, queue.value.length - 1)
  }
  hideContextMenu()
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 点击外部关闭菜单
document.addEventListener('click', hideContextMenu)
</script>

<style scoped>
.play-queue-view {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.queue-header h2 {
  margin: 0;
  color: var(--text-color);
}

.queue-actions {
  display: flex;
  gap: 8px;
}

.btn-clear,
.btn-shuffle {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s;
}

.btn-clear {
  background: #ff4757;
  color: white;
}

.btn-clear:hover:not(:disabled) {
  background: #ff6b7a;
}

.btn-shuffle {
  background: var(--hover-bg);
  color: var(--text-color);
}

.btn-shuffle:hover:not(:disabled) {
  background: var(--sidebar-border);
}

.btn-clear:disabled,
.btn-shuffle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.queue-info {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--secondary-text-color);
}

.queue-list {
  flex: 1;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--sidebar-bg);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  gap: 12px;
}

.queue-item:hover {
  background: var(--hover-bg);
}

.queue-item.active {
  background: rgba(255, 71, 87, 0.1);
  border-left: 3px solid #ff4757;
}

.queue-item.playing {
  background: rgba(255, 71, 87, 0.2);
}

.item-index {
  width: 30px;
  text-align: center;
  color: var(--secondary-text-color);
  font-size: 13px;
}

.item-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-artist {
  font-size: 12px;
  color: var(--secondary-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-duration {
  width: 60px;
  text-align: right;
  font-size: 13px;
  color: var(--secondary-text-color);
}

.item-actions {
  display: flex;
  gap: 8px;
}

.btn-remove {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--secondary-text-color);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: rgba(255, 71, 87, 0.2);
  color: #ff4757;
}

.empty-queue {
  text-align: center;
  padding: 60px 20px;
  color: var(--secondary-text-color);
}

.empty-queue .hint {
  margin-top: 8px;
  font-size: 13px;
}

.context-menu {
  position: fixed;
  background: #ffffff !important;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  min-width: 200px;
  z-index: 1000;
}

.dark .context-menu {
  background: #2d2d2d !important;
  border-color: #444;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  color: #333 !important;
  transition: background-color 0.2s;
}

.dark .menu-item {
  color: #fff !important;
}

.menu-item:hover {
  background: #f5f5f5 !important;
}

.dark .menu-item:hover {
  background: #3d3d3d !important;
}

.menu-divider {
  height: 1px;
  background: #e0e0e0 !important;
  margin: 4px 0;
}

.dark .menu-divider {
  background: #444 !important;
}
</style>
