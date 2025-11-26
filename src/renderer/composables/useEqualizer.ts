import { ref, watch } from 'vue'

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

let audioContext: AudioContext | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let gainNode: GainNode | null = null
let filters: BiquadFilterNode[] = []
let audioElement: HTMLAudioElement | null = null
let isInitialized = false

// 全局状态（单例模式）
const enabled = ref(false)
const gains = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const customPresets = ref<EqualizerPreset[]>([])

// 持久化定时器
let saveTimer: number | null = null

// 加载设置
const loadSettings = async () => {
  if (typeof window === 'undefined' || !window.electronAPI) return
  try {
    const settings = await window.electronAPI.getSettings()
    if (settings.equalizer) {
      enabled.value = settings.equalizer.enabled ?? false
      if (settings.equalizer.gains && Array.isArray(settings.equalizer.gains)) {
        gains.value = settings.equalizer.gains
      }
      if (settings.equalizer.customPresets && Array.isArray(settings.equalizer.customPresets)) {
        customPresets.value = settings.equalizer.customPresets
      }
    }
  } catch (error) {
    console.warn('加载均衡器设置失败:', error)
  }
}

// 保存设置
const saveSettings = () => {
  if (typeof window === 'undefined' || !window.electronAPI) return

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    window.electronAPI.saveSettings({
      equalizer: {
        enabled: enabled.value,
        gains: gains.value,
        customPresets: customPresets.value
      }
    })
  }, 1000) // 1秒防抖
}

// 初始化加载
loadSettings()

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
      isInitialized = false
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

      audioElement = element
      isInitialized = true
      console.log('✅ 均衡器音频上下文初始化成功')

      // 初始化完成后应用当前的增益设置
      applyGains()
    } catch (error) {
      console.error('❌ 均衡器初始化失败:', error)
      isInitialized = false
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
      saveSettings()
    }
  }

  // 应用预设
  const applyPreset = (preset: EqualizerPreset) => {
    gains.value = [...preset.gains]
    applyGains()
    saveSettings()
  }

  // 重置为平坦
  const reset = () => {
    gains.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    applyGains()
    saveSettings()
  }

  // 启用/禁用均衡器
  const toggle = (value: boolean) => {
    enabled.value = value
    applyGains()
    saveSettings()
  }

  // 保存自定义预设
  const savePreset = (name: string) => {
    const preset: EqualizerPreset = {
      name,
      gains: [...gains.value]
    }
    customPresets.value.push(preset)
    saveSettings()
    return preset
  }

  // 删除自定义预设
  const deletePreset = (index: number) => {
    if (index >= 0 && index < customPresets.value.length) {
      customPresets.value.splice(index, 1)
      saveSettings()
    }
  }

  // 监听增益变化（用于拖动滑块时的实时应用，但不频繁保存，保存由 setGain 触发）
  watch(gains, () => {
    applyGains()
  }, { deep: true })

  // 监听启用状态
  watch(enabled, () => {
    applyGains()
  })

  return {
    enabled,
    gains,
    customPresets,
    EQUALIZER_FREQUENCIES,
    EQUALIZER_PRESETS,
    initAudioContext,
    setGain,
    applyPreset,
    reset,
    toggle,
    savePreset,
    deletePreset
  }
}
