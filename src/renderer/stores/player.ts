import { defineStore } from 'pinia'
import { ref, watch, toRaw } from 'vue'
import type { MusicItem } from '@shared/types/music'

const LOCAL_STORAGE_KEY = 'xmmusic_player_state'
// 播放队列单独存一个 key：队列可能有上万条，不能和音量/模式等偏好混在一起频繁写盘。
// 播放进度不再持久化：重启后从曲首开始，避免播放中高频写 SQLite。
const LOCAL_STORAGE_QUEUE_KEY = 'xmmusic_player_queue'

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
  /** @deprecated 进度不再持久化，始终为 0；保留字段避免外部引用报错 */
  const resumePosition = ref(0)
  /** @deprecated 不再根据上次是否在播自动续播 */
  const shouldAutoResume = ref(false)
  const isInitialized = ref(false)
  let positionPersistTimer: number | null = null
  let queuePersistTimer: number | null = null

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

  /** 解析当前队列下标：索引无效时按 currentMusic.id 回退，避免切歌偏离模式 */
  function resolveCurrentIndex(): number {
    const len = queue.value.length
    if (len === 0) return -1
    const idx = currentQueueIndex.value
    if (idx >= 0 && idx < len) return idx
    if (currentMusic.value) {
      return queue.value.findIndex(m => m.id === currentMusic.value!.id)
    }
    return -1
  }

  /** 随机一首（队列 > 1 时避开当前下标） */
  function pickRandomIndex(excludeIndex: number): number {
    const len = queue.value.length
    if (len <= 1) return 0
    if (excludeIndex < 0 || excludeIndex >= len) {
      return Math.floor(Math.random() * len)
    }
    const r = Math.floor(Math.random() * (len - 1))
    return r >= excludeIndex ? r + 1 : r
  }

  /**
   * 按播放模式取下一首（含队列下标，避免同 id 多条时 findIndex 找错）
   * - sequential：顺序，末尾不再前进
   * - random：随机（避开当前）
   * - repeat：顺序循环，末尾回到第一首
   * - single：始终当前曲（手动/自动一致，重新播本曲）
   */
  function getNext(): { music: MusicItem; index: number } | null {
    const len = queue.value.length
    if (len === 0) return null

    const currentIndex = resolveCurrentIndex()
    const mode = playMode.value

    if (mode === 'single') {
      if (currentIndex >= 0) return { music: queue.value[currentIndex], index: currentIndex }
      // 当前曲不在队列：不伪造 index:0，否则调用方 setCurrentQueueIndex(0) 会误切到队首
      return currentMusic.value ? { music: currentMusic.value, index: -1 } : null
    }

    if (mode === 'random') {
      const nextIndex = pickRandomIndex(currentIndex)
      return { music: queue.value[nextIndex], index: nextIndex }
    }

    if (mode === 'repeat') {
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % len
      return { music: queue.value[nextIndex], index: nextIndex }
    }

    // sequential：到末尾不切换
    if (currentIndex < 0) return { music: queue.value[0], index: 0 }
    const nextIndex = currentIndex + 1
    if (nextIndex >= len) return null
    return { music: queue.value[nextIndex], index: nextIndex }
  }

  /**
   * 按播放模式取上一首
   * - sequential：顺序，开头不再后退
   * - random：随机（避开当前）
   * - repeat：顺序循环，开头跳到最后一首
   * - single：始终当前曲
   */
  function getPrevious(): { music: MusicItem; index: number } | null {
    const len = queue.value.length
    if (len === 0) return null

    const currentIndex = resolveCurrentIndex()
    const mode = playMode.value

    if (mode === 'single') {
      if (currentIndex >= 0) return { music: queue.value[currentIndex], index: currentIndex }
      // 当前曲不在队列：不伪造 index:0，否则调用方 setCurrentQueueIndex(0) 会误切到队首
      return currentMusic.value ? { music: currentMusic.value, index: -1 } : null
    }

    if (mode === 'random') {
      const prevIndex = pickRandomIndex(currentIndex)
      return { music: queue.value[prevIndex], index: prevIndex }
    }

    if (mode === 'repeat') {
      const prevIndex = currentIndex <= 0 ? len - 1 : currentIndex - 1
      return { music: queue.value[prevIndex], index: prevIndex }
    }

    // sequential：到开头不切换
    if (currentIndex <= 0) return null
    const prevIndex = currentIndex - 1
    return { music: queue.value[prevIndex], index: prevIndex }
  }

  /**
   * 播放失败时跳过当前曲（避免单曲循环/仅一首损坏时死循环重试）
   * 队列仅 1 首则停止；随机避开当前；其余按列表往后跳并绕回
   */
  function getNextSkippingCurrent(): { music: MusicItem; index: number } | null {
    const len = queue.value.length
    if (len <= 1) return null

    const currentIndex = resolveCurrentIndex()
    if (playMode.value === 'random') {
      const nextIndex = pickRandomIndex(currentIndex)
      return { music: queue.value[nextIndex], index: nextIndex }
    }

    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % len
    return { music: queue.value[nextIndex], index: nextIndex }
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
    // 不再恢复 playPosition / wasPlaying：重启后从曲首开始，不自动续播到上次进度
    resumePosition.value = 0
    shouldAutoResume.value = false
  }

  async function initialize(settings?: any) {
    if (typeof window !== 'undefined') {
      // 一次性迁移：旧版本把队列和位置状态混在同一个 LOCAL_STORAGE_KEY 里，
      // 现在位置状态会直接覆盖这个 key，升级后第一次这样的覆盖会把旧队列数据冲掉，
      // 所以先把旧 blob 里残留的 playQueue 挪到新 key，再往下走正常的读取流程
      try {
        if (!window.localStorage.getItem(LOCAL_STORAGE_QUEUE_KEY)) {
          const legacy = window.localStorage.getItem(LOCAL_STORAGE_KEY)
          if (legacy) {
            const parsedLegacy = JSON.parse(legacy)
            if (Array.isArray(parsedLegacy.playQueue) && parsedLegacy.playQueue.length > 0) {
              window.localStorage.setItem(LOCAL_STORAGE_QUEUE_KEY, JSON.stringify({ playQueue: parsedLegacy.playQueue }))
            }
          }
        }
      } catch (error) {
        console.warn('迁移旧版本本地播放队列失败:', error)
      }

      // 先恢复队列，再恢复位置：applyState 里 currentQueueIndex 的校验依赖 queue 已经有内容
      try {
        const localQueue = window.localStorage.getItem(LOCAL_STORAGE_QUEUE_KEY)
        if (localQueue) {
          try {
            applyState(JSON.parse(localQueue))
          } catch (parseError) {
            console.warn('解析本地播放队列失败，清除无效数据:', parseError)
            window.localStorage.removeItem(LOCAL_STORAGE_QUEUE_KEY)
          }
        }
      } catch (error) {
        console.warn('读取本地播放队列失败:', error)
      }

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
    await pruneMissingFromQueue()
    isInitialized.value = true
  }

  // 播放队列持久化在 localStorage，跟 SQLite 里的曲库生命周期完全独立：
  // 如果两次启动之间某首歌被从库里删除（比如移除扫描目录时勾了"删除已扫描记录"），
  // 队列里会留一条死引用，播放时 record-play 会因外键约束直接报错、无限跳歌。
  // 启动时校验一遍，把已经不在库里的曲目摘掉。
  async function pruneMissingFromQueue() {
    if (typeof window === 'undefined' || !window.electronAPI?.getExistingMusicIds) return
    if (queue.value.length === 0) return
    try {
      const ids = queue.value.map(m => m.id)
      const existing = new Set(await window.electronAPI.getExistingMusicIds(ids))
      if (existing.size === ids.length) return

      const currentId = currentMusic.value?.id
      queue.value = queue.value.filter(m => existing.has(m.id))

      if (currentId !== undefined && existing.has(currentId)) {
        currentQueueIndex.value = queue.value.findIndex(m => m.id === currentId)
      } else {
        currentQueueIndex.value = queue.value.length > 0 ? 0 : -1
        currentMusic.value = queue.value[0] ?? null
        shouldAutoResume.value = false
      }
    } catch (error) {
      console.warn('校验播放队列曲目是否仍存在于曲库失败，跳过清理:', error)
    }
  }

  // Optimize: Don't deep clone if not necessary. Pinia state is already reactive objects.
  // If we need to strip reactivity, we can use toRaw from vue.


  const toPlainQueue = () =>
    queue.value.map(item => toRaw(item))

  // 播放偏好：队列下标 / 模式 / 音量（不含播放进度，避免播放中高频写库）
  const buildPlaybackPrefsSnapshot = () => ({
    currentQueueIndex: currentQueueIndex.value,
    playMode: playMode.value,
    volume: volume.value
  })

  const persistPlaybackPrefs = async () => {
    if (!isInitialized.value) return
    const snapshot = buildPlaybackPrefsSnapshot()

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

  // 队列状态：可能是上万条歌曲，只在队列真正发生结构变化时才保存
  const persistQueue = async () => {
    if (!isInitialized.value) return
    const snapshot = { playQueue: toPlainQueue() }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_QUEUE_KEY, JSON.stringify(snapshot))
      } catch (error) {
        console.warn('写入本地播放队列失败:', error)
      }
    }

    try {
      await window.electronAPI.saveSettings(snapshot)
    } catch (error) {
      console.warn('保存播放队列到数据库失败:', error)
    }
  }

  const persistState = async () => {
    await Promise.all([persistPlaybackPrefs(), persistQueue()])
  }

  const schedulePlaybackPrefsPersist = () => {
    if (!isInitialized.value) return
    if (positionPersistTimer) {
      clearTimeout(positionPersistTimer)
    }
    positionPersistTimer = window.setTimeout(() => {
      void persistPlaybackPrefs()
    }, 1000)
  }

  const scheduleQueuePersist = () => {
    if (!isInitialized.value) return
    if (queuePersistTimer) {
      clearTimeout(queuePersistTimer)
    }
    queuePersistTimer = window.setTimeout(() => {
      void persistQueue()
    }, 1000)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (positionPersistTimer) {
        clearTimeout(positionPersistTimer)
      }
      if (queuePersistTimer) {
        clearTimeout(queuePersistTimer)
      }
      void persistState()
    })

    // 监听元数据更新事件
    window.addEventListener('music-metadata-updated', (event: Event) => {
      const customEvent = event as CustomEvent
      const updatedMusic = customEvent.detail
      if (!updatedMusic || !updatedMusic.id) return

      // 更新队列中的歌曲
      const queueIndex = queue.value.findIndex(m => m.id === updatedMusic.id)
      if (queueIndex !== -1) {
        // 重新赋值整个数组以触发响应式更新
        const updatedQueue = [...queue.value]
        updatedQueue[queueIndex] = { ...updatedQueue[queueIndex], ...updatedMusic }
        queue.value = updatedQueue
      }

      // 更新当前播放的歌曲
      if (currentMusic.value && currentMusic.value.id === updatedMusic.id) {
        currentMusic.value = { ...currentMusic.value, ...updatedMusic }
      }
    })
  }

  // 队列结构变化（播放全部/增删/清空/拖拽排序/元数据更新）才需要保存整条队列
  watch(queue, scheduleQueuePersist, { deep: true })

  // 仅在队列下标 / 模式 / 音量变化时保存偏好（不跟播放进度、isPlaying）
  watch(
    [currentQueueIndex, playMode, volume],
    schedulePlaybackPrefsPersist
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
    getNextSkippingCurrent,
    togglePlayMode,
    initialize,
    resumePosition,
    shouldAutoResume,
    saveState: persistState
  }
})
