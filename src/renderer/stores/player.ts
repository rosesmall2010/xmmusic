import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { MusicItem } from '@shared/types/music'

const LOCAL_STORAGE_KEY = 'xmmusic_player_state'

export const usePlayerStore = defineStore('player', () => {
  const currentMusic = ref<MusicItem | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(80)
  const playMode = ref<'sequential' | 'random' | 'repeat'>('sequential')

  // 播放队列
  const queue = ref<MusicItem[]>([])
  const currentQueueIndex = ref(-1)
  const resumePosition = ref(0)
  const shouldAutoResume = ref(false)
  const isInitialized = ref(false)
  let persistTimer: number | null = null

  // 添加到队列
  function addToQueue(music: MusicItem, position?: number) {
    if (position !== undefined) {
      queue.value.splice(position, 0, music)
    } else {
      queue.value.push(music)
    }
  }

  // 从队列移除
  function removeFromQueue(index: number) {
    if (index >= 0 && index < queue.value.length) {
      queue.value.splice(index, 1)
      // 调整当前索引
      if (currentQueueIndex.value === index) {
        currentQueueIndex.value = -1
      } else if (currentQueueIndex.value > index) {
        currentQueueIndex.value--
      }
    }
  }

  // 清空队列
  function clearQueue() {
    queue.value = []
    currentQueueIndex.value = -1
  }

  // 随机排序队列
  function shuffleQueue() {
    for (let i = queue.value.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.value[i], queue.value[j]] = [queue.value[j], queue.value[i]]
    }
    // 重置当前索引
    currentQueueIndex.value = -1
  }

  // 移动队列中的项目
  function moveInQueue(fromIndex: number, toIndex: number) {
    if (fromIndex >= 0 && fromIndex < queue.value.length &&
        toIndex >= 0 && toIndex < queue.value.length) {
      const [item] = queue.value.splice(fromIndex, 1)
      queue.value.splice(toIndex, 0, item)

      // 更新当前索引
      if (currentQueueIndex.value === fromIndex) {
        currentQueueIndex.value = toIndex
      } else if (currentQueueIndex.value === toIndex && fromIndex < toIndex) {
        currentQueueIndex.value++
      } else if (currentQueueIndex.value === toIndex && fromIndex > toIndex) {
        currentQueueIndex.value--
      } else if (currentQueueIndex.value > fromIndex && currentQueueIndex.value <= toIndex) {
        currentQueueIndex.value--
      } else if (currentQueueIndex.value < fromIndex && currentQueueIndex.value >= toIndex) {
        currentQueueIndex.value++
      }
    }
  }

  // 设置当前队列索引
  function setCurrentQueueIndex(index: number) {
    if (index >= 0 && index < queue.value.length) {
      currentQueueIndex.value = index
      currentMusic.value = queue.value[index]
    }
  }

  // 获取下一首
  function getNext(): MusicItem | null {
    if (queue.value.length === 0) return null

    if (playMode.value === 'random') {
      const randomIndex = Math.floor(Math.random() * queue.value.length)
      return queue.value[randomIndex]
    } else if (playMode.value === 'repeat') {
      return currentMusic.value || queue.value[0]
    } else {
      // sequential
      const nextIndex = currentQueueIndex.value + 1
      if (nextIndex < queue.value.length) {
        return queue.value[nextIndex]
      }
      return null
    }
  }

  // 获取上一首
  function getPrevious(): MusicItem | null {
    if (queue.value.length === 0) return null

    if (playMode.value === 'random') {
      const randomIndex = Math.floor(Math.random() * queue.value.length)
      return queue.value[randomIndex]
    } else if (playMode.value === 'repeat') {
      return currentMusic.value || queue.value[0]
    } else {
      // sequential
      const prevIndex = currentQueueIndex.value - 1
      if (prevIndex >= 0) {
        return queue.value[prevIndex]
      }
      return null
    }
  }

  const applyState = (state?: any) => {
    if (!state) return
    if (Array.isArray(state.playQueue) && state.playQueue.length > 0) {
      queue.value = state.playQueue
    }
    if (typeof state.currentQueueIndex === 'number' && queue.value.length > 0) {
      const idx = Math.min(Math.max(state.currentQueueIndex, 0), queue.value.length - 1)
      currentQueueIndex.value = idx
      currentMusic.value = queue.value[idx]
    }
    if (state.playMode) {
      playMode.value = state.playMode
    }
    if (typeof state.volume === 'number') {
      volume.value = state.volume
    }
    if (typeof state.playPosition === 'number') {
      resumePosition.value = state.playPosition
    }
    if (typeof state.wasPlaying === 'boolean') {
      shouldAutoResume.value = state.wasPlaying && !!currentMusic.value
    }
  }

  async function initialize(settings?: any) {
    if (typeof window !== 'undefined') {
      try {
        const local = window.localStorage.getItem(LOCAL_STORAGE_KEY)
        if (local) {
          applyState(JSON.parse(local))
        }
      } catch (error) {
        console.warn('读取本地播放状态失败:', error)
      }
    }

    let loadedSettings = settings
    if (!loadedSettings) {
      try {
        loadedSettings = await window.electronAPI.getSettings()
      } catch (error) {
        console.warn('获取设置失败，使用本地状态:', error)
      }
    }

    applyState(loadedSettings)
    isInitialized.value = true
  }

  const toPlainQueue = () =>
    queue.value.map(item => JSON.parse(JSON.stringify(item)))

  const persistState = async () => {
    if (!isInitialized.value) return

    const snapshot = {
      playQueue: toPlainQueue(),
      currentQueueIndex: currentQueueIndex.value,
      playMode: playMode.value,
      volume: volume.value,
      playPosition: currentTime.value,
      wasPlaying: isPlaying.value
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot))
      } catch (error) {
        console.warn('写入本地播放状态失败:', error)
      }
    }

    try {
      await window.electronAPI.saveSettings(snapshot)
    } catch (error) {
      console.warn('保存播放状态到数据库失败:', error)
    }
  }

  const schedulePersist = () => {
    if (!isInitialized.value) return
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistTimer = window.setTimeout(() => {
      void persistState()
    }, 200)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
      }
      void persistState()
    })
  }

  watch(queue, schedulePersist, { deep: true })
  watch(
    [currentQueueIndex, playMode, volume, currentTime, isPlaying],
    schedulePersist
  )

  return {
    currentMusic,
    isPlaying,
    currentTime,
    duration,
    volume,
    playMode,
    queue,
    currentQueueIndex,
    addToQueue,
    removeFromQueue,
    clearQueue,
    shuffleQueue,
    moveInQueue,
    setCurrentQueueIndex,
    getNext,
    getPrevious,
    initialize,
    resumePosition,
    shouldAutoResume
  }
})
