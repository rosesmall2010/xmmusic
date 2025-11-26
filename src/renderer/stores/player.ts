import { defineStore } from 'pinia'
import { ref, watch, toRaw } from 'vue'
import type { MusicItem } from '@shared/types/music'

const LOCAL_STORAGE_KEY = 'xmmusic_player_state'

export const usePlayerStore = defineStore('player', () => {
  const currentMusic = ref<MusicItem | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(80)
  // 播放模式：sequential(列表顺序), random(列表随机), repeat(列表循环), single(单曲循环)
  const playMode = ref<'sequential' | 'random' | 'repeat' | 'single'>('sequential')

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

  // 切换播放模式
  function togglePlayMode() {
    const modes: Array<'sequential' | 'random' | 'repeat' | 'single'> = ['sequential', 'random', 'repeat', 'single']
    const currentIndex = modes.indexOf(playMode.value)
    const nextIndex = (currentIndex + 1) % modes.length
    playMode.value = modes[nextIndex]
  }

  // 获取下一首
  function getNext(): MusicItem | null {
    if (queue.value.length === 0) return null

    if (playMode.value === 'single') {
      // 单曲循环：返回当前歌曲
      return currentMusic.value
    } else if (playMode.value === 'random') {
      // 列表随机：随机选择一首
      const randomIndex = Math.floor(Math.random() * queue.value.length)
      return queue.value[randomIndex]
    } else if (playMode.value === 'repeat') {
      // 列表循环：播放完最后一首后回到第一首
      const nextIndex = currentQueueIndex.value + 1
      if (nextIndex < queue.value.length) {
        return queue.value[nextIndex]
      } else {
        return queue.value[0] // 循环到第一首
      }
    } else {
      // sequential: 列表顺序播放
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

    if (playMode.value === 'single') {
      // 单曲循环：返回当前歌曲
      return currentMusic.value
    } else if (playMode.value === 'random') {
      // 列表随机：随机选择一首
      const randomIndex = Math.floor(Math.random() * queue.value.length)
      return queue.value[randomIndex]
    } else if (playMode.value === 'repeat') {
      // 列表循环：从第一首往前时跳到最后一首
      const prevIndex = currentQueueIndex.value - 1
      if (prevIndex >= 0) {
        return queue.value[prevIndex]
      } else {
        return queue.value[queue.value.length - 1] // 循环到最后一首
      }
    } else {
      // sequential: 列表顺序播放
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

      // 恢复歌曲时长（从音乐数据中）
      if (currentMusic.value?.duration) {
        duration.value = currentMusic.value.duration
      }
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
          try {
            const parsed = JSON.parse(local)
            applyState(parsed)
          } catch (parseError) {
            console.warn('解析本地播放状态失败，清除无效数据:', parseError)
            // 清除无效的 localStorage 数据
            window.localStorage.removeItem(LOCAL_STORAGE_KEY)
          }
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

  // Optimize: Don't deep clone if not necessary. Pinia state is already reactive objects.
  // If we need to strip reactivity, we can use toRaw from vue.


  const toPlainQueue = () =>
    queue.value.map(item => toRaw(item))

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
      // Throttle IPC calls: only save to disk if enough time has passed or important state changed
      // For now, we keep it simple but rely on the debounce in schedulePersist
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
    // Increase debounce time to 1 second to reduce IPC frequency
    persistTimer = window.setTimeout(() => {
      void persistState()
    }, 1000)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
      }
      void persistState()
    })

    // 监听元数据更新事件
    window.addEventListener('music-metadata-updated', (event: Event) => {
      const customEvent = event as CustomEvent
      const updatedMusic = customEvent.detail

      // 更新队列中的歌曲
      const queueIndex = queue.value.findIndex(m => m.id === updatedMusic.id)
      if (queueIndex !== -1) {
        queue.value[queueIndex] = { ...queue.value[queueIndex], ...updatedMusic }
      }

      // 更新当前播放的歌曲
      if (currentMusic.value && currentMusic.value.id === updatedMusic.id) {
        currentMusic.value = { ...currentMusic.value, ...updatedMusic }
      }
    })
  }

  watch(queue, schedulePersist, { deep: true })

  // Watch important state changes immediately
  watch(
    [currentQueueIndex, playMode, volume, isPlaying],
    schedulePersist
  )

  // Throttle currentTime updates significantly (e.g. only save every 5 seconds if only time changes)
  // Actually, we can just exclude currentTime from the main watcher and have a separate throttled watcher
  // But for simplicity, let's just rely on the increased debounce of 1000ms for now,
  // and maybe exclude currentTime from triggering the watcher if possible?
  // If we include currentTime in the watcher with 1000ms debounce, it means we save every 1s during playback.
  // That might still be too much for IPC.
  // Let's remove currentTime from the watcher and only save it on pause/stop or via a separate very slow interval.

  // Separate watcher for current time to save less frequently (e.g. every 10s)
  let timeSaveTimer: number | null = null
  watch(currentTime, () => {
    if (!timeSaveTimer) {
      timeSaveTimer = window.setTimeout(() => {
        schedulePersist()
        timeSaveTimer = null
      }, 5000)
    }
  })

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
    togglePlayMode,
    initialize,
    resumePosition,
    shouldAutoResume,
    saveState: persistState
  }
})
