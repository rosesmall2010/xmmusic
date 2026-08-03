import { ref, watch, toRaw } from 'vue'
import { useSettingsStore } from '@/stores/settings'

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
  limiterNode: DynamicsCompressorNode | null
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
      limiterNode: null,
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
let limiterNode: DynamicsCompressorNode | null = null
let filters: BiquadFilterNode[] = []
let analyserNode: AnalyserNode | null = null
let timeAnalyserNode: AnalyserNode | null = null
let audioElement: HTMLAudioElement | null = null
let isInitialized = false
// 仅用于跳过 initAudioContext 快速路径里多余的 routeAudioGraph 重连；HMR 后重置一次无副作用
let lastRoutedEnabled: boolean | null = null

// 从全局缓存恢复（开发模式热更新友好）
if (runtime) {
  audioContext = runtime.audioContext
  sourceNode = runtime.sourceNode
  gainNode = runtime.gainNode
  limiterNode = runtime.limiterNode
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
  runtime.limiterNode = limiterNode
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

const safeDisconnect = (node: AudioNode | null | undefined) => {
  if (!node) return
  try {
    node.disconnect()
  } catch {
    // 忽略未连接等情况
  }
}

/** 同步拆掉整张音频图并关闭 Context（元素切换 / 挂接纠错共用） */
const teardownAudioGraph = () => {
  safeDisconnect(sourceNode)
  filters.forEach(safeDisconnect)
  safeDisconnect(gainNode)
  safeDisconnect(limiterNode)
  safeDisconnect(analyserNode)
  safeDisconnect(timeAnalyserNode)

  try {
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close()
    }
  } catch {
    // ignore
  }

  audioContext = null
  sourceNode = null
  gainNode = null
  limiterNode = null
  filters = []
  analyserNode = null
  timeAnalyserNode = null
  audioElement = null
  isInitialized = false
  lastRoutedEnabled = null
  syncRuntime()
}

/** 请求重建原生 Audio；若正在 restore 中则排队，避免事件被 isRestoringNative 静默丢弃 */
const requestRestoreNativeAudio = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('xmmusic:restore-native-audio'))
}

export function useEqualizer() {
  /**
   * 路由音频图：
   * - 音效关闭：source → destination（直通，尽量保真；分析器仅并联旁听）
   * - 音效开启：source → 10 段 peaking → gain（余量）→ limiter（防削波）→ destination
   *
   * 注意：一旦 createMediaElementSource，当前这个媒体元素实例就只能经 AudioContext 出声，
   * 无法原地切回「原生直出」——但可以调用 releaseCapture() 关闭 AudioContext，
   * 再由调用方丢弃旧元素、新建一个 <audio> 重新播放，从应用层面等效于"退出" Web Audio 图
   * （NowPlayingView 关闭特效开关、且 EQ 未单独开启时就是这么做的，避免均衡器/分析器空转吃 CPU）。
   * PlayerBar 里 EQ 本身的接管仍然只在用户打开音效时触发；
   * 但频谱/火焰/闪电可视化组件会主动调用 initAudioContext 以拿到真实频谱，不再等用户先打开音效开关。
   */
  const routeAudioGraph = () => {
    if (!audioContext || !sourceNode || !gainNode || !limiterNode || !analyserNode || !timeAnalyserNode) {
      return
    }

    lastRoutedEnabled = enabled.value
    safeDisconnect(sourceNode)
    filters.forEach(safeDisconnect)
    safeDisconnect(gainNode)
    safeDisconnect(limiterNode)
    // Analyser 是叶子节点，一般无需 disconnect；重新从 tap 点连接即可

    if (!enabled.value) {
      // 直通：不经滤波器，减少相位/量化染色与潜在削波
      sourceNode.connect(audioContext.destination)
      sourceNode.connect(analyserNode)
      sourceNode.connect(timeAnalyserNode)
      gainNode.gain.value = 1
      filters.forEach((filter) => {
        filter.gain.value = 0
      })
      return
    }

    let currentNode: AudioNode = sourceNode
    filters.forEach((filter) => {
      currentNode.connect(filter)
      currentNode = filter
    })
    currentNode.connect(gainNode)
    gainNode.connect(limiterNode)
    limiterNode.connect(audioContext.destination)
    gainNode.connect(analyserNode)
    gainNode.connect(timeAnalyserNode)

    applyGains()
  }

  // 初始化音频上下文：EQ 打开时由 PlayerBar 调用；频谱/火焰/闪电可视化组件也会
  // 主动调用它来拿真实频谱（不再要求 EQ 开关先打开，见上方 routeAudioGraph 的注意事项）
  const initAudioContext = (element: HTMLAudioElement) => {
    // 如果已经为同一个元素初始化过，跳过（仅在开关状态变化时才重新校正路由，避免每次播放都重连整张图）
    if (isInitialized && audioElement === element && audioContext && sourceNode) {
      if (audioContext.state === 'suspended') {
        void audioContext.resume()
      }
      if (lastRoutedEnabled !== enabled.value) {
        routeAudioGraph()
      }
      return
    }

    // 如果元素变化：旧 MediaElementSource 无法迁移，必须关掉 Context 再挂新元素
    if (audioElement && audioElement !== element) {
      teardownAudioGraph()
    }

    if (isInitialized) {
      return
    }

    try {
      // MediaElementSource 需要 CORS；若尚未设置则补上并重载当前源
      if (element.crossOrigin !== 'anonymous') {
        const resumeAt = element.currentTime
        const wasPlaying = !element.paused
        const src = element.currentSrc || element.src
        element.crossOrigin = 'anonymous'
        if (src) {
          element.src = src
          const onMeta = () => {
            element.removeEventListener('loadedmetadata', onMeta)
            try {
              element.currentTime = resumeAt
            } catch {
              // ignore
            }
            if (wasPlaying) void element.play().catch(() => {})
          }
          element.addEventListener('loadedmetadata', onMeta)
        }
      }

      // 创建或恢复音频上下文（playback 偏向缓冲与音质，而非超低延迟）
      if (!audioContext || audioContext.state === 'closed') {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        audioContext = new Ctx({ latencyHint: 'playback' })
      }

      if (audioContext.state === 'suspended') {
        void audioContext.resume()
      }

      // ⚠️ 同一个 element 只能 createMediaElementSource 一次（Context 关闭后也一样，必须换新元素）
      sourceNode = audioContext.createMediaElementSource(element)
      gainNode = audioContext.createGain()
      gainNode.gain.value = 1

      // 尾部限幅器：EQ 正增益超 0dBFS 时避免硬削波（数字失真是音质发糊的主因）
      limiterNode = audioContext.createDynamicsCompressor()
      limiterNode.threshold.value = -1
      limiterNode.knee.value = 0
      limiterNode.ratio.value = 20
      limiterNode.attack.value = 0.002
      limiterNode.release.value = 0.1

      filters = EQUALIZER_FREQUENCIES.map((freq, index) => {
        const filter = audioContext!.createBiquadFilter()
        // 专业图示 EQ 惯例：最低段用低搁架、最高段用高搁架，中间用 peaking。
        // 31Hz peaking 在普通音箱上听不见却白白吃掉动态余量；
        // 16kHz peaking 靠近奈奎斯特频率会因频率弯折变形，搁架更平滑自然
        if (index === 0) {
          filter.type = 'lowshelf'
        } else if (index === EQUALIZER_FREQUENCIES.length - 1) {
          filter.type = 'highshelf'
        } else {
          filter.type = 'peaking'
          // 倍频程间隔的 10 段 EQ 标准带宽为 1 个倍频程，对应 Q≈1.41；
          // Q 过小（如 0.7）会让相邻频段大面积叠加，低频预设实际提升远超面板数值，导致发糊
          filter.Q.value = 1.414
        }
        filter.frequency.value = freq
        filter.gain.value = 0
        return filter
      })

      analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 512
      // 0.8 的时间平滑会让频谱数据滞后音乐节拍，可视化「跟不上」；
      // 0.5 更跟手，画面层再做上升/回落不对称平滑即可保持顺滑
      analyserNode.smoothingTimeConstant = 0.5

      timeAnalyserNode = audioContext.createAnalyser()
      timeAnalyserNode.fftSize = 1024
      timeAnalyserNode.smoothingTimeConstant = 0.6

      audioElement = element
      isInitialized = true
      console.log('✅ 均衡器音频上下文初始化成功')

      routeAudioGraph()
      syncRuntime()
    } catch (error) {
      console.error('❌ 均衡器初始化失败:', error)
      isInitialized = false
      sourceNode = null
      syncRuntime()
      // 元素曾被占用时只能换新 <audio>；由播放器排队 restore，避免 isRestoringNative 期间事件被丢弃
      const msg = error instanceof Error ? error.message : String(error)
      if (/already connected|InvalidStateError/i.test(msg)) {
        requestRestoreNativeAudio()
      }
    }
  }

  /** 平滑设置 AudioParam，避免直接赋值产生「拉链」爆音 */
  const smoothSet = (param: AudioParam, value: number) => {
    if (audioContext) {
      param.setTargetAtTime(value, audioContext.currentTime, 0.02)
    } else {
      param.value = value
    }
  }

  /** 按最大正向增益留一点主音量余量，减轻削波发糊 */
  const applyMasterHeadroom = () => {
    if (!gainNode) return
    if (!enabled.value) {
      smoothSet(gainNode.gain, 1)
      return
    }
    const maxBoost = Math.max(0, ...gains.value)
    // 约抵消一半最大提升（dB→线性），剩余峰值交给尾部 limiter 兜底
    const headroomDb = maxBoost * 0.5
    smoothSet(gainNode.gain, Math.pow(10, -headroomDb / 20))
  }

  // 应用均衡器增益
  const applyGains = () => {
    if (!enabled.value || filters.length === 0) {
      filters.forEach((filter) => {
        smoothSet(filter.gain, 0)
      })
      if (gainNode) smoothSet(gainNode.gain, 1)
      return
    }

    gains.value.forEach((gain, index) => {
      if (filters[index]) {
        smoothSet(filters[index].gain, gain)
      }
    })
    applyMasterHeadroom()
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
    if (enabled.value) ensureCapturedForEq()
    else applyGains()
    saveSettings(true)
  }

  // 重置为平坦
  const reset = () => {
    gains.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    applyGains()
    saveSettings(true)
  }

  /** 是否已被 MediaElementSource 接管（一旦接管只能经 AudioContext 出声） */
  const isCaptured = () => isInitialized && !!sourceNode

  /**
   * 释放 Web Audio 捕获：关闭 AudioContext 并清空节点。
   * 注意：旧的 HTMLAudioElement 无法恢复直出，调用方必须丢弃并重建元素。
   */
  const releaseCapture = async () => {
    if (!isInitialized && !audioContext) return
    teardownAudioGraph()
    console.log('✅ 已释放 Web Audio 音频捕获')
  }

  // 启用/禁用均衡器：
  // - 开启：挂到当前播放元素并走滤波路由
  // - 关闭：若全屏特效仍需频谱，只切旁路（避免销毁重建导致元素「永久污染」/听感失效）；
  //         特效也不需要时才真正 release + 重建原生直出
  const toggle = (value: boolean) => {
    enabled.value = value
    if (value) {
      ensureCapturedForEq()
    } else if (isCaptured()) {
      // 全屏特效仍需频谱时只切旁路，避免销毁重建把元素「永久污染」
      let needSpectrum = false
      try {
        needSpectrum = useSettingsStore().shouldCaptureNowPlayingAudio()
      } catch {
        needSpectrum = false
      }

      if (needSpectrum) {
        routeAudioGraph()
      } else {
        void releaseCapture().then(() => {
          requestRestoreNativeAudio()
        })
      }
    } else {
      applyGains()
    }
    saveSettings(true)
  }

  /** 音效开启时确保已挂到「当前 DOM 中的」播放元素并强制走滤波路由 */
  const ensureCapturedForEq = () => {
    if (typeof document === 'undefined') {
      applyGains()
      return
    }
    const domEl = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
    // 模块里缓存的元素若已脱离 DOM，不能再用（否则滤波挂在死节点上，扬声器仍是干声）
    const liveCached =
      audioElement && document.contains(audioElement) ? audioElement : null
    // 优先 DOM 中带 id 的播放器（与 usePlayer 实际出声节点对齐）
    const el = domEl || liveCached
    if (!el) {
      console.warn('⚠️ 音效开启但找不到播放元素，稍后播放时会自动挂接')
      applyGains()
      return
    }
    // 缓存指向其它节点时，完整拆掉旧 Context 再挂到 DOM 播放器（勿只 disconnect）
    if (liveCached && domEl && liveCached !== domEl) {
      teardownAudioGraph()
    } else if (audioElement && !document.contains(audioElement)) {
      // 缓存已脱离 DOM：同样需要关 Context，避免半残图
      teardownAudioGraph()
    }
    initAudioContext(el)
    if (audioContext?.state === 'suspended') {
      void audioContext.resume().catch(() => {})
    }
    if (isInitialized) {
      // 强制重路由，避免 lastRoutedEnabled 误判导致仍停在旁路
      lastRoutedEnabled = null
      routeAudioGraph()
      console.log('✅ 音效滤波链路已激活', {
        gains: [...gains.value],
        contextState: audioContext?.state
      })
    } else {
      console.warn('⚠️ 音效挂接失败，滤波未激活')
      applyGains()
    }
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

  // 设置加载完成后，若音频图已初始化则按开关重路由（仅绑定一次）
  if (!didBindLoadApply) {
    didBindLoadApply = true
    void loadSettingsPromise?.then(() => {
      if (settingsLoaded && isInitialized) {
        routeAudioGraph()
      }
    })
  }

  // 监听增益变化（用于拖动滑块时的实时应用，但不频繁保存，保存由 setGain 触发）
  watch(gains, () => {
    if (enabled.value) applyGains()
  }, { deep: true })

  // 监听启用状态：开启时若尚未接管则主动挂图；已接管则重路由
  watch(enabled, (on) => {
    if (!on) return
    ensureCapturedForEq()
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
    ensureCapturedForEq,
    isCaptured,
    releaseCapture,
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
