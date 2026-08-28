<template>
  <transition name="eq-fade">
    <div class="eq-overlay" v-if="modelValue">
      <div class="equalizer-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-left">
            <span class="header-badge">
              <SlidersHorizontal :size="16" />
            </span>
            <div class="header-text">
              <h3 class="panel-title">{{ $t('player.equalizer') }}</h3>
              <span class="panel-subtitle">{{ enabled ? $t('equalizer.enabled') : $t('equalizer.disabled') }}</span>
            </div>
          </div>
          <button class="close-btn" @click="emit('update:modelValue', false)" :title="$t('common.close')">
            <X :size="18" />
          </button>
        </div>

        <div class="panel-content">
          <!-- 顶部控制条 -->
          <div class="control-bar">
            <label class="switch">
              <input type="checkbox" :checked="enabled" @change="onEnabledChange" />
              <span class="slider round"></span>
            </label>

            <div class="preset-wrap">
              <span class="preset-label">{{ $t('equalizer.preset') }}</span>
              <div class="select-shell">
                <select v-model="selectedPreset" @change="handlePresetChange" class="preset-select" :disabled="!enabled">
                  <option value="flat">{{ $t('equalizer.flat') }}</option>
                  <option value="pop">{{ $t('equalizer.pop') }}</option>
                  <option value="rock">{{ $t('equalizer.rock') }}</option>
                  <option value="jazz">{{ $t('equalizer.jazz') }}</option>
                  <option value="classical">{{ $t('equalizer.classical') }}</option>
                  <option value="bass">{{ $t('equalizer.bass') }}</option>
                  <option value="treble">{{ $t('equalizer.treble') }}</option>
                  <option value="vocal">{{ $t('equalizer.vocal') }}</option>
                </select>
                <ChevronDown class="select-caret" :size="15" />
              </div>
            </div>
          </div>

          <!-- 10段均衡器 -->
          <div class="eq-board" :class="{ 'is-disabled': !enabled }">
            <div class="eq-scale">
              <span>+12</span>
              <span>+6</span>
              <span class="zero">0</span>
              <span>-6</span>
              <span>-12</span>
            </div>

            <div class="equalizer-sliders">
              <div
                v-for="(freq, index) in EQUALIZER_FREQUENCIES"
                :key="freq"
                class="slider-group"
              >
                <div class="freq-value" :class="{ active: enabled && gains[index] !== 0 }">
                  {{ formatGain(gains[index]) }}
                </div>
                <div class="slider-track">
                  <div class="track-groove"></div>
                  <div class="track-fill" :style="fillStyle(gains[index])"></div>
                  <input
                    type="range"
                    :value="gains[index]"
                    @input="handleGainChange(index, $event)"
                    min="-12"
                    max="12"
                    step="0.5"
                    class="eq-slider"
                    :disabled="!enabled"
                  />
                </div>
                <div class="freq-label">{{ formatFrequency(freq) }}</div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="actions">
            <button class="btn-secondary" @click="handleReset" :disabled="!enabled">
              <RotateCcw :size="14" />
              {{ $t('equalizer.reset') }}
            </button>
            <button class="btn-primary" @click="emit('update:modelValue', false)">
              {{ $t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-vue-next'
import { useEqualizer, EQUALIZER_PRESETS } from '@/composables/useEqualizer'

const {
  enabled,
  gains,
  EQUALIZER_FREQUENCIES,
  setGain,
  applyPreset,
  reset,
  toggle,
  flushSaveSettings
} = useEqualizer()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const selectedPreset = ref('flat')

const onEnabledChange = (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  toggle(checked)
}

watch(
  () => props.modelValue,
  (visible, wasVisible) => {
    // 关闭面板时立即落盘，避免拖动滑块后的防抖尚未完成
    if (wasVisible && !visible) {
      void flushSaveSettings()
    }
  }
)

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

// 以 0dB 中线为基准，向 thumb 方向填充轨道（正向上、负向下）
const fillStyle = (gain: number): Record<string, string> => {
  const ratio = Math.min(Math.abs(gain) / 12, 1)
  const height = `${ratio * 50}%`
  return gain >= 0 ? { bottom: '50%', height } : { top: '50%', height }
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
/* ==================== 遮罩层 ==================== */
.eq-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-popover);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(6px);
}

.eq-fade-enter-active,
.eq-fade-leave-active {
  transition: opacity var(--transition-base) var(--transition-timing);
}
.eq-fade-enter-active .equalizer-panel,
.eq-fade-leave-active .equalizer-panel {
  transition: transform var(--transition-base) var(--transition-timing),
    opacity var(--transition-base) var(--transition-timing);
}
.eq-fade-enter-from,
.eq-fade-leave-to {
  opacity: 0;
}
.eq-fade-enter-from .equalizer-panel,
.eq-fade-leave-to .equalizer-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

/* ==================== 面板容器（玻璃质感） ==================== */
.equalizer-panel {
  width: 560px;
  max-width: calc(100vw - 32px);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-xl);
}

#app.light .equalizer-panel {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 250, 0.92));
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px) saturate(1.4);
}

#app.dark .equalizer-panel {
  background: linear-gradient(160deg, rgba(46, 46, 46, 0.92), rgba(24, 24, 24, 0.92));
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 60px -14px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px) saturate(1.3);
}

/* ==================== 头部 ==================== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-base) var(--spacing-lg);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.header-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary-dark));
  box-shadow: 0 6px 16px -4px rgba(var(--color-primary-rgb), 0.6);
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-title {
  font-size: var(--font-size-base);
  font-weight: 700;
  margin: 0;
  color: var(--text-color);
  letter-spacing: 0.2px;
}

.panel-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: 500;
}

.close-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base) var(--transition-timing);
}

.close-btn:hover {
  background: var(--color-accent-red);
  border-color: var(--color-accent-red);
  color: #fff;
  transform: rotate(90deg);
}

/* ==================== 内容 ==================== */
.panel-content {
  padding: 0 var(--spacing-lg) var(--spacing-lg);
}

.control-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-base) 0 var(--spacing-lg);
}

/* 开关 */
.switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 26px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--bg-tertiary);
  transition: var(--transition-slow);
  border: 1px solid var(--border-color);
}

.slider.round {
  border-radius: var(--radius-full);
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  border-radius: 50%;
  background-color: var(--bg-color);
  transition: var(--transition-slow);
  box-shadow: var(--shadow-md);
}

input:checked + .slider {
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary-dark));
  border-color: transparent;
}

input:checked + .slider:before {
  transform: translateX(20px);
  background-color: #fff;
}

/* 预设选择 */
.preset-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.preset-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.select-shell {
  position: relative;
  flex: 1;
}

.preset-select {
  width: 100%;
  padding: var(--spacing-sm) 34px var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  outline: none;
  appearance: none;
  transition: all var(--transition-base) var(--transition-timing);
}

.preset-select:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.preset-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-alpha);
}

.preset-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-caret {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}

/* ==================== 均衡器面板 ==================== */
.eq-board {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-base);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  transition: opacity var(--transition-base) var(--transition-timing);
}

#app.dark .eq-board {
  background: rgba(0, 0, 0, 0.22);
  border-color: rgba(255, 255, 255, 0.05);
}

.eq-board.is-disabled {
  opacity: 0.55;
}

/* dB 刻度 */
.eq-scale {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  height: 150px;
  margin-top: 22px;
  padding-right: 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.eq-scale .zero {
  color: var(--text-secondary);
}

.equalizer-sliders {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.slider-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.slider-track {
  position: relative;
  width: 26px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 轨道凹槽 */
.track-groove {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 6px;
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--bg-tertiary);
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.25);
}

#app.dark .track-groove {
  background: rgba(255, 255, 255, 0.08);
}

/* 从 0dB 中线向 thumb 方向的填充条 */
.track-fill {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  border-radius: var(--radius-full);
  background: linear-gradient(var(--color-primary-light), var(--color-primary-dark));
  transition: height var(--transition-fast) var(--transition-timing);
  pointer-events: none;
}

/* 0dB 中线 */
.slider-track::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 1px;
  transform: translate(-50%, -50%);
  background: var(--border-color);
  z-index: 1;
}

.eq-slider {
  /* Chromium 121+ 标准竖向 range：thumb 自动水平居中，不再依赖已废弃的 slider-vertical */
  writing-mode: vertical-lr;
  direction: rtl;
  width: 26px;
  height: 150px;
  cursor: pointer;
  background: transparent;
  outline: none;
  position: relative;
  z-index: 2;
}

.eq-slider:disabled {
  cursor: not-allowed;
}

/* 轨道设为透明，露出下方 groove / fill */
.eq-slider::-webkit-slider-runnable-track {
  width: 6px;
  height: 150px;
  background: transparent;
}

.eq-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--color-primary-light), var(--color-primary-dark));
  border: 3px solid var(--bg-color);
  cursor: pointer;
  box-shadow: 0 2px 8px -1px rgba(var(--color-primary-rgb), 0.6);
  transition: transform var(--transition-fast) var(--transition-timing),
    box-shadow var(--transition-fast) var(--transition-timing);
}

.eq-slider:hover:not(:disabled)::-webkit-slider-thumb {
  transform: scale(1.18);
  box-shadow: 0 0 0 6px rgba(var(--color-primary-rgb), 0.15), 0 2px 10px -1px rgba(var(--color-primary-rgb), 0.7);
}

.eq-slider:disabled::-webkit-slider-thumb {
  background: var(--text-disabled);
  box-shadow: none;
}

/* Firefox */
.eq-slider::-moz-range-track {
  width: 6px;
  height: 150px;
  background: transparent;
}

.eq-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--color-primary-light), var(--color-primary-dark));
  border: 3px solid var(--bg-color);
  cursor: pointer;
  box-shadow: 0 2px 8px -1px rgba(var(--color-primary-rgb), 0.6);
}

.freq-value {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  min-width: 34px;
  padding: 1px 0;
  text-align: center;
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
  transition: all var(--transition-base) var(--transition-timing);
}

.freq-value.active {
  color: var(--color-primary);
  background: var(--color-primary-alpha);
}

.freq-label {
  font-size: 10px;
  color: var(--text-tertiary);
  min-width: 34px;
  text-align: center;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ==================== 操作按钮 ==================== */
.actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  padding-top: var(--spacing-base);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--spacing-sm) var(--spacing-base);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-primary-alpha);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-secondary:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  border-radius: var(--radius-base);
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary-dark));
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-primary:hover {
  box-shadow: 0 6px 16px -4px rgba(var(--color-primary-rgb), 0.6);
}

.btn-primary:active {
  transform: scale(0.97);
}
</style>
