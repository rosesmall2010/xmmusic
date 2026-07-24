import { ref, watch, toRaw } from 'vue'

// 10段均衡器的频率点（Hz）
const EQUALIZER_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

// 预设音效
export const EQUALIZER_PRESETS = {
  flat: {
    name: '平坦',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  pop: {
    name: '流行',
    gains: [-1, 0, 2, 3, 1, -1, -1, 0, 1, 1]
  },
  rock: {
    name: '摇滚',
    gains: [4, 3, -3, -2, 2, 3, 4, 3, 2, 2]
  },
  jazz: {
    name: '爵士',
    gains: [2, 1, -1, 1, 2, 2, 1, 1, 2, 3]
  },
  classical: {
    name: '古典',
    gains: [3, 2, 0, 0, 0, 0, 0, 2, 3, 4]
  },
  bass: {
    name: '重低音',
    gains: [6, 5, 3, 1, -1, -2, -2, -1, 0, 1]
  },
  treble: {
    name: '高音增强',
    gains: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
  },
  vocal: {
    name: '人声增强',
    gains: [-1, -1, 0, 2, 3, 3, 2, 1, -1, -1]
  }
}

export interface EqualizerPreset {
  name: string
  gains: number[]
}

/**
 * ⚠️ 重要：HTMLMediaElement 只能创建一次 MediaElementSourceNode
 * 在开发模式（HMR 热更新）或多处重复初始化时，如果重新执行 createMediaElementSource，
 * 会抛出：InvalidStateError: HTMLMediaElement already connected previously...
 *
 * 这里把音频上下文与节点缓存到 window 上，保证热更新后也能复用同一个 SourceNode。
 */
type EqualizerRuntime = {
  audioContext: AudioContext | null
  sourceNode: MediaElementAudioSourceNode | null
  gainNode: GainNode | null
  filters: BiquadFilterNode[]
  analyserNode: AnalyserNode | null
  timeAnalyserNode: AnalyserNode | null
  audioElement: HTMLAudioElement | null
  isInitialized: boolean
}

const getRuntime = (): EqualizerRuntime | null => {
  if (typeof window === 'undefined') return null
  const w = window as any
  if (!w.__XMMUSIC_EQUALIZER_RUNTIME__) {
    w.__XMMUSIC_EQUALIZER_RUNTIME__ = {
      audioContext: null,
      sourceNode: null,
      gainNode: null,
      filters: [],
      analyserNode: null,
      timeAnalyserNode: null,
      audioElement: null,
      isInitialized: false
    } satisfies EqualizerRuntime
  }
  return w.__XMMUSIC_EQUALIZER_RUNTIME__ as EqualizerRuntime
}

const runtime = getRuntime()

let audioContext: AudioContext | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let gainNode: GainNode | null = null
let filters: BiquadFilterNode[] = []
let analyserNode: AnalyserNode | null = null
let timeAnalyserNode: AnalyserNode | null = null
let audioElement: HTMLAudioElement | null = null
let isInitialized = false

// 从全局缓存恢复（开发模式热更新友好）
if (runtime) {
  audioContext = runtime.audioContext
  sourceNode = runtime.sourceNode
  gainNode = runtime.gainNode
  filters = runtime.filters
  analyserNode = runtime.analyserNode
  timeAnalyserNode = runtime.timeAnalyserNode
  audioElement = runtime.audioElement
  isInitialized = runtime.isInitialized
}

const syncRuntime = () => {
  if (!runtime) return
  runtime.audioContext = audioContext
  runtime.sourceNode = sourceNode
  runtime.gainNode = gainNode
  runtime.filters = filters
  runtime.analyserNode = analyserNode
  runtime.timeAnalyserNode = timeAnalyserNode
  runtime.audioElement = audioElement
  runtime.isInitialized = isInitialized
}

// 全局状态（单例模式）
const enabled = ref(false)
const gains = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const customPresets = ref<EqualizerPreset[]>([])

// 持久化定时器（滑块拖动防抖；退出前必须 flush）
let saveTimer: ReturnType<typeof setTimeout> | null = null
let settingsLoaded = false
let loadSettingsPromise: Promise<void> | null = null
let didBindLoadApply = false

const EQ_LOCAL_KEY = 'xmmusic-equalizer'

const buildPlainEqualizer = () => ({
  enabled: !!enabled.value,
  gains: Array.isArray(gains.value) ? [...toRaw(gains.value)] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  customPresets: Array.isArray(customPresets.value)
    ? toRaw(customPresets.value).map((p: any) => ({
        name: String(p?.name ?? ''),
        gains: Array.isArray(p?.gains) ? [...p.gains] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      }))
    : []
})

const mirrorEqualizerToLocal = (plain: ReturnType<typeof buildPlainEqualizer>) => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(EQ_LOCAL_KEY, JSON.stringify(plain))
    }
  } catch {
    // 忽略配额等错误
  }
}

const readEqualizerFromLocal = (): ReturnType<typeof buildPlainEqualizer> | null => {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(EQ_LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      enabled: !!parsed.enabled,
      gains: Array.isArray(parsed.gains) ? [...parsed.gains] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      customPresets: Array.isArray(parsed.customPresets) ? parsed.customPresets : []
    }
  } catch {
    return null
  }
}

const applyEqualizerState = (eq: {
  enabled?: boolean
  gains?: number[]
  customPresets?: EqualizerPreset[]
}) => {
  enabled.value = eq.enabled ?? false
  if (eq.gains && Array.isArray(eq.gains) && eq.gains.length > 0) {
    gains.value = [...eq.gains]
  }
  if (eq.customPresets && Array.isArray(eq.customPresets)) {
    customPresets.value = eq.customPresets
  }
}

/** 立即写入磁盘（取消未完成的防抖）；同时同步写 localStorage 作退出兜底 */
const flushSaveSettings = async (): Promise<void> => {
  if (typeof window === 'undefined') return

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  const plainEqualizer = buildPlainEqualizer()
  // 同步镜像：进程被立刻杀掉时 IPC 可能来不及完成，localStorage 仍可恢复
  mirrorEqualizerToLocal(plainEqualizer)

  if (!window.electronAPI) {
    console.warn('⚠️ 无法保存均衡器设置到数据库：window.electronAPI 不可用（已写入 localStorage）')
    return
  }

  try {
    await window.electronAPI.saveSettings({
      equalizer: plainEqualizer
    })
    console.log('✅ 均衡器设置已保存')
  } catch (error) {
    console.error('❌ 保存均衡器设置失败:', error)
  }
}

/**
 * 保存设置
 * @param immediate true=立刻落盘（开关/预设/退出）；false=短防抖（拖动滑块）
 */
const saveSettings = (immediate = false) => {
  if (typeof window === 'undefined') return

  if (immediate) {
    void flushSaveSettings()
    return
  }

  if (saveTimer) clearTimeout(saveTimer)
  // 滑块拖动：300ms 防抖；退出时由 flush / beforeunload 兜底
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushSaveSettings()
  }, 300)
}

// 加载设置：优先数据库，缺失时回退 localStorage
const loadSettings = async () => {
  if (typeof window === 'undefined') return
  try {
    let loadedFromDb = false
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings()
      if (settings.equalizer) {
        applyEqualizerState(settings.equalizer)
        mirrorEqualizerToLocal(buildPlainEqualizer())
        loadedFromDb = true
      }
    }
    if (!loadedFromDb) {
      const local = readEqualizerFromLocal()
      if (local) {
        applyEqualizerState(local)
        // 回写数据库，修复此前仅落在 local / 未完成 IPC 的情况
        if (window.electronAPI) {
          try {
            await window.electronAPI.saveSettings({ equalizer: local })
          } catch {
            // 忽略
          }
        }
      }
    }
  } catch (error) {
    console.warn('加载均衡器设置失败:', error)
    const local = readEqualizerFromLocal()
    if (local) applyEqualizerState(local)
  } finally {
    settingsLoaded = true
  }
}

loadSettingsPromise = loadSettings()

// 退出 / 隐藏页面前强制落盘，避免防抖未完成导致设置丢失
if (typeof window !== 'undefined') {
  const flushOnExit = () => {
    void flushSaveSettings()
  }
  window.addEventListener('beforeunload', flushOnExit)
  window.addEventListener('pagehide', flushOnExit)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushSaveSettings()
    }
  })
}

export function useEqualizer() {
  // 初始化音频上下文
  const initAudioContext = (element: HTMLAudioElement) => {
    // ... (保持原有逻辑)
    // 如果已经为同一个元素初始化过，跳过
    if (isInitialized && audioElement === element && audioContext && sourceNode) {
      return
    }

    // 如果元素变化，需要重新初始化
    if (audioElement && audioElement !== element) {
      // 断开旧的连接
      if (sourceNode) {
        try {
          sourceNode.disconnect()
        } catch (e) {
          // 忽略断开错误
        }
      }
      filters.forEach(filter => {
        try {
          filter.disconnect()
        } catch (e) {
          // 忽略断开错误
        }
      })
      if (gainNode) {
        try {
          gainNode.disconnect()
        } catch (e) {
          // 忽略断开错误
        }
      }
      if (analyserNode) {
        try {
          analyserNode.disconnect()
        } catch (e) {
          // 忽略断开错误
        }
      }
      if (timeAnalyserNode) {
        try {
          timeAnalyserNode.disconnect()
        } catch (e) {
          // 忽略断开错误
        }
      }
      isInitialized = false
      syncRuntime()
    }

    if (isInitialized) {
      return
    }

    try {
      // 创建或恢复音频上下文
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      // 如果上下文被暂停，恢复它
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      // ⚠️ 同一个 element 只能 createMediaElementSource 一次
      // 如果开发模式热更新导致状态丢失，这里会抛 InvalidStateError
      sourceNode = audioContext.createMediaElementSource(element)
      gainNode = audioContext.createGain()

      // 创建10个滤波器
      filters = EQUALIZER_FREQUENCIES.map(freq => {
        const filter = audioContext!.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = freq
        filter.Q.value = 1
        filter.gain.value = 0
        return filter
      })

      // 连接节点：source -> filters -> gain -> destination
      let currentNode: AudioNode = sourceNode
      filters.forEach(filter => {
        currentNode.connect(filter)
        currentNode = filter
      })
      currentNode.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // 频谱分析：从最终输出（含均衡器增益）并联到 AnalyserNode
      analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 512
      analyserNode.smoothingTimeConstant = 0.8
      try {
        gainNode.connect(analyserNode)
      } catch (e) {
        // 忽略重复连接等异常
      }

      // 波形分析：给“振幅/RMS”使用，单独节点便于不同参数调优
      timeAnalyserNode = audioContext.createAnalyser()
      timeAnalyserNode.fftSize = 1024
      timeAnalyserNode.smoothingTimeConstant = 0.6
      try {
        gainNode.connect(timeAnalyserNode)
      } catch (e) {
        // 忽略重复连接等异常
      }

      audioElement = element
      isInitialized = true
      console.log('✅ 均衡器音频上下文初始化成功')

      // 初始化完成后应用当前的增益设置
      applyGains()
      syncRuntime()
    } catch (error) {
      console.error('❌ 均衡器初始化失败:', error)
      isInitialized = false
      syncRuntime()
    }
  }

  // 应用均衡器增益
  const applyGains = () => {
    if (!enabled.value || filters.length === 0) {
      // 如果禁用，将所有增益设为0
      filters.forEach(filter => {
        filter.gain.value = 0
      })
      return
    }

    gains.value.forEach((gain, index) => {
      if (filters[index]) {
        filters[index].gain.value = gain
      }
    })
  }

  // 设置单个频段的增益
  const setGain = (index: number, gain: number) => {
    if (index >= 0 && index < gains.value.length) {
      gains.value[index] = Math.max(-12, Math.min(12, gain))
      applyGains()
      saveSettings(false) // 拖动防抖
    }
  }

  // 应用预设
  const applyPreset = (preset: EqualizerPreset) => {
    gains.value = [...preset.gains]
    applyGains()
    saveSettings(true)
  }

  // 重置为平坦
  const reset = () => {
    gains.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    applyGains()
    saveSettings(true)
  }

  // 启用/禁用均衡器
  const toggle = (value: boolean) => {
    enabled.value = value
    applyGains()
    saveSettings(true)
  }

  // 保存自定义预设
  const savePreset = (name: string) => {
    const preset: EqualizerPreset = {
      name,
      gains: [...gains.value]
    }
    customPresets.value.push(preset)
    saveSettings(true)
    return preset
  }

  // 删除自定义预设
  const deletePreset = (index: number) => {
    if (index >= 0 && index < customPresets.value.length) {
      customPresets.value.splice(index, 1)
      saveSettings(true)
    }
  }

  // 设置加载完成后，若音频图已初始化则再应用一次增益（仅绑定一次）
  if (!didBindLoadApply) {
    didBindLoadApply = true
    void loadSettingsPromise?.then(() => {
      if (settingsLoaded && isInitialized) {
        applyGains()
      }
    })
  }

  // 监听增益变化（用于拖动滑块时的实时应用，但不频繁保存，保存由 setGain 触发）
  watch(gains, () => {
    applyGains()
  }, { deep: true })

  // 监听启用状态
  watch(enabled, () => {
    applyGains()
  })

  /**
   * 获取频谱数据（0-255），用于可视化特效
   * - 传入 buffer 可复用数组，减少 GC
   * - 返回值为实际使用的 Uint8Array（可能与传入 buffer 不同）
   */
  const getFrequencyData = (buffer?: Uint8Array): Uint8Array | null => {
    if (!analyserNode) return null
    const size = analyserNode.frequencyBinCount
    const target = buffer && buffer.length === size ? buffer : new Uint8Array(size)
    analyserNode.getByteFrequencyData(target)
    return target
  }

  /**
   * 获取波形数据（0-255），用于计算音量振幅/RMS 等
   * - 传入 buffer 可复用数组，减少 GC
   * - 返回值为实际使用的 Uint8Array（可能与传入 buffer 不同）
   */
  const getTimeDomainData = (buffer?: Uint8Array): Uint8Array | null => {
    if (!timeAnalyserNode) return null
    const size = timeAnalyserNode.fftSize
    const target = buffer && buffer.length === size ? buffer : new Uint8Array(size)
    timeAnalyserNode.getByteTimeDomainData(target)
    return target
  }

  return {
    enabled,
    gains,
    customPresets,
    EQUALIZER_FREQUENCIES,
    EQUALIZER_PRESETS,
    initAudioContext,
    getFrequencyData,
    getTimeDomainData,
    setGain,
    applyPreset,
    reset,
    toggle,
    savePreset,
    deletePreset,
    /** 关闭面板 / 退出前调用，确保防抖中的设置落盘 */
    flushSaveSettings
  }
}
