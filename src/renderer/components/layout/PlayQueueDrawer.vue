<template>
  <Transition name="slide-right">
    <div v-if="visible" class="play-queue-drawer">
      <div class="drawer-header">
        <div class="header-title">
          <h3>{{ $t('queue.title') }}</h3>
          <span class="count">({{ queue.length }})</span>
        </div>
        <div class="header-actions">
          <button class="action-btn" @click="clearQueue" :title="$t('queue.clear')">
            <Trash2 :size="18" />
          </button>
          <button class="close-btn" @click="close" :title="$t('common.close')">
            <X :size="24" />
          </button>
        </div>
      </div>

      <div class="queue-list" ref="listRef">
        <div
          v-for="(music, index) in queue"
          :key="music.id"
          class="queue-item"
          :class="{ active: currentQueueIndex === index }"
          @dblclick="playItem(index)"
        >
          <div class="item-status">
            <Volume2 v-if="currentQueueIndex === index" :size="14" class="playing-icon" />
            <span v-else class="index">{{ index + 1 }}</span>
          </div>
          <div class="item-info">
            <div class="item-title" :title="music.title">{{ music.title }}</div>
            <div class="item-meta">
              <span class="item-artist" :title="music.artist">{{ music.artist }}</span>
              <span class="item-separator">·</span>
              <span class="item-filename" :title="music.fileName">{{ music.fileName }}</span>
            </div>
          </div>
          <div class="item-duration">{{ formatDuration(music.duration) }}</div>
          <button class="remove-btn" @click.stop="removeItem(index)" :title="$t('queue.remove')">
            <span>×</span>
          </button>
        </div>

        <div v-if="queue.length === 0" class="empty-state">
          <p>{{ $t('queue.empty') }}</p>
        </div>
      </div>
    </div>
  </Transition>

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import { Volume2, Trash2, X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()
const { play } = usePlayer()
const listRef = ref<HTMLElement | null>(null)

const queue = computed(() => playerStore.queue)
const currentQueueIndex = computed(() => playerStore.currentQueueIndex)

const close = () => {
  emit('update:visible', false)
  emit('close')
}

const playItem = async (index: number) => {
  playerStore.setCurrentQueueIndex(index)
  await play(queue.value[index])
}

const removeItem = (index: number) => {
  playerStore.removeFromQueue(index)
}

const clearQueue = () => {
  if (confirm(t('queue.clearConfirm'))) {
    playerStore.clearQueue()
  }
}

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Scroll to current item when drawer opens or song changes
watch([() => props.visible, currentQueueIndex], async ([isVisible, index]) => {
  if (isVisible && index >= 0) {
    await nextTick()
    scrollToCurrent()
  }
})

const scrollToCurrent = () => {
  if (!listRef.value) return
  const activeItem = listRef.value.querySelector('.queue-item.active')
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

onMounted(() => {
  // 监听元数据更新事件
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
})

const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail
  if (!updatedMusic || !updatedMusic.id) return

  // 这个更新逻辑已经在 playerStore 中处理了，这里不需要重复处理
  // 但如果需要，也可以在这里处理，不过为了避免重复更新，最好只在 store 中处理
}
</script>

<style scoped>
.play-queue-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: var(--footer-height); /* Above player bar */
  width: 350px;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-2xl);
  z-index: var(--z-drawer);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
}



.drawer-header {
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 50px;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.header-title h3 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
}

.count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.action-btn,
.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.action-btn:hover,
.close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.close-btn {
  font-size: var(--font-size-xl);
  line-height: 1;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs) 0;
}

.queue-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-lg);
  gap: var(--spacing-md);
  cursor: default;
  transition: background var(--transition-fast);
}

.queue-item:hover {
  background: var(--hover-bg);
}

.queue-item.active {
  background: var(--active-bg);
}

.queue-item.active .item-title,
.queue-item.active .playing-icon {
  color: var(--color-primary);
}

.item-status {
  width: 20px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  overflow: hidden;
}

.item-artist {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

.item-separator {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.item-filename {
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 2;
}

.item-duration {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  width: 40px;
  text-align: right;
}

.remove-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  transition: all var(--transition-fast);
}

.queue-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  color: var(--text-color);
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* Transitions */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
