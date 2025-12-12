<template>
  <div class="equalizer-panel" v-if="modelValue">
    <div class="panel-header">
      <h3 class="panel-title">音效</h3>
      <button class="close-btn" @click="emit('update:modelValue', false)">
        <X :size="16" />
      </button>
    </div>

    <div class="panel-content">
      <!-- 开关 -->
      <div class="setting-row">
        <label class="switch">
          <input
            type="checkbox"
            :checked="enabled"
            @change="toggle(!enabled)"
          >
          <span class="slider round"></span>
        </label>
        <span class="switch-label">{{ enabled ? '已开启' : '已关闭' }}</span>
      </div>

      <!-- 预设选择 -->
      <div class="setting-row">
        <label class="preset-label">预设音效</label>
        <select v-model="selectedPreset" @change="handlePresetChange" class="preset-select">
          <option value="flat">平坦</option>
          <option value="pop">流行</option>
          <option value="rock">摇滚</option>
          <option value="jazz">爵士</option>
          <option value="classical">古典</option>
          <option value="bass">重低音</option>
          <option value="treble">高音增强</option>
          <option value="vocal">人声增强</option>
        </select>
      </div>

      <!-- 10段均衡器 -->
      <div class="equalizer-sliders">
        <div
          v-for="(freq, index) in EQUALIZER_FREQUENCIES"
          :key="freq"
          class="slider-group"
        >
          <input
            type="range"
            :value="gains[index]"
            @input="handleGainChange(index, $event)"
            min="-12"
            max="12"
            step="0.5"
            orient="vertical"
            class="eq-slider"
            :disabled="!enabled"
          />
          <div class="freq-value">{{ formatGain(gains[index]) }}</div>
          <div class="freq-label">{{ formatFrequency(freq) }}</div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button class="btn-secondary" @click="handleReset">重置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useEqualizer, EQUALIZER_PRESETS } from '@/composables/useEqualizer'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const {
  enabled,
  gains,
  EQUALIZER_FREQUENCIES,
  setGain,
  applyPreset,
  reset,
  toggle
} = useEqualizer()

const selectedPreset = ref('flat')

const handlePresetChange = () => {
  const preset = EQUALIZER_PRESETS[selectedPreset.value as keyof typeof EQUALIZER_PRESETS]
  if (preset) {
    applyPreset(preset)
  }
}

const handleGainChange = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement
  setGain(index, parseFloat(target.value))
  // 切换到自定义模式（如果改变了预设值）
  const currentPresetKey = Object.keys(EQUALIZER_PRESETS).find(key => {
    const preset = EQUALIZER_PRESETS[key as keyof typeof EQUALIZER_PRESETS]
    return JSON.stringify(preset.gains) === JSON.stringify(gains.value)
  })
  if (!currentPresetKey) {
    selectedPreset.value = 'custom'
  }
}

const handleReset = () => {
  reset()
  selectedPreset.value = 'flat'
}

const formatFrequency = (freq: number): string => {
  if (freq >= 1000) {
    return `${freq / 1000}K`
  }
  return `${freq}`
}

const formatGain = (gain: number): string => {
  if (gain > 0) return `+${gain.toFixed(1)}`
  return gain.toFixed(1)
}

// 监听gains变化，自动检测是否匹配预设
watch(gains, () => {
  const matchedPreset = Object.keys(EQUALIZER_PRESETS).find(key => {
    const preset = EQUALIZER_PRESETS[key as keyof typeof EQUALIZER_PRESETS]
    return JSON.stringify(preset.gains) === JSON.stringify(gains.value)
  })
  if (matchedPreset) {
    selectedPreset.value = matchedPreset
  }
}, { deep: true })
</script>

<style scoped>
.equalizer-panel {
  position: absolute;
  bottom: calc(100% + 12px);
  right: 0;
  width: 540px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  z-index: var(--z-popover);
  animation: slideUp var(--transition-base) var(--transition-timing);
  backdrop-filter: blur(10px);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-base) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.panel-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
  color: var(--text-color);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base) var(--transition-timing);
}

.close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.panel-content {
  padding: var(--spacing-lg);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-base);
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-tertiary);
  transition: var(--transition-slow);
  border: 1px solid var(--border-color);
}

.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--bg-color);
  transition: var(--transition-slow);
  box-shadow: var(--shadow-sm);
}

input:checked + .slider {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.switch-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.preset-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  min-width: 80px;
  font-weight: 500;
}

.preset-select {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  cursor: pointer;
  outline: none;
  transition: all var(--transition-base) var(--transition-timing);
}

.preset-select:hover {
  border-color: var(--color-primary);
  background: var(--hover-bg);
}

.preset-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-alpha);
}

.equalizer-sliders {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: var(--spacing-lg) 0;
  padding: var(--spacing-lg) 0;
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  padding: var(--spacing-lg);
}

.slider-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.eq-slider {
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
  writing-mode: bt-lr;
  width: 6px;
  height: 120px;
  cursor: pointer;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  outline: none;
  transition: all var(--transition-base) var(--transition-timing);
}

.eq-slider:hover:not(:disabled) {
  background: var(--hover-bg);
}

.eq-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.eq-slider::-webkit-slider-runnable-track {
  width: 6px;
  height: 120px;
  background: transparent;
}

.eq-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--bg-color);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base) var(--transition-timing);
}

.eq-slider::-webkit-slider-thumb:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: var(--shadow-lg);
}

.eq-slider::-moz-range-track {
  width: 6px;
  height: 120px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.eq-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--bg-color);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base) var(--transition-timing);
}

.eq-slider::-moz-range-thumb:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: var(--shadow-lg);
}

.freq-value {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.freq-label {
  font-size: 10px;
  color: var(--text-tertiary);
  min-width: 36px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  padding-top: var(--spacing-base);
  border-top: 1px solid var(--border-color);
}

.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-base);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-secondary:hover {
  background: var(--hover-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-secondary:active {
  transform: scale(0.98);
}
</style>
