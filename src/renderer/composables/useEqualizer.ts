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

export function useEqualizer() {
  const enabled = ref(false)
  const gains = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const customPresets = ref<EqualizerPreset[]>([])

  // 初始化音频上下文
  const initAudioContext = (element: HTMLAudioElement) => {
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
    }
  }

  // 应用预设
  const applyPreset = (preset: EqualizerPreset) => {
    gains.value = [...preset.gains]
    applyGains()
  }

  // 重置为平坦
  const reset = () => {
    gains.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    applyGains()
  }

  // 启用/禁用均衡器
  const toggle = (value: boolean) => {
    enabled.value = value
    applyGains()
  }

  // 保存自定义预设
  const savePreset = (name: string) => {
    const preset: EqualizerPreset = {
      name,
      gains: [...gains.value]
    }
    customPresets.value.push(preset)
    return preset
  }

  // 删除自定义预设
  const deletePreset = (index: number) => {
    if (index >= 0 && index < customPresets.value.length) {
      customPresets.value.splice(index, 1)
    }
  }

  // 监听增益变化
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
