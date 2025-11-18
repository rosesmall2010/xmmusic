<template>
  <div class="equalizer-view">
    <div class="equalizer-header">
      <h2>音频均衡器</h2>
      <div class="header-actions">
        <label class="toggle-label">
          <input type="checkbox" v-model="equalizer.enabled" @change="equalizer.toggle(equalizer.enabled)" />
          <span>启用均衡器</span>
        </label>
        <button @click="resetEqualizer" class="btn-reset">重置</button>
      </div>
    </div>

    <div class="equalizer-content">
      <!-- 预设选择 -->
      <div class="presets-section">
        <h3>预设音效</h3>
        <div class="presets-list">
          <button
            v-for="(preset, key) in equalizer.EQUALIZER_PRESETS"
            :key="key"
            class="preset-btn"
            :class="{ active: currentPreset === key }"
            @click="applyPreset(key as string, preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <!-- 自定义预设 -->
      <div v-if="equalizer.customPresets.length > 0" class="presets-section">
        <h3>自定义预设</h3>
        <div class="presets-list">
          <button
            v-for="(preset, index) in equalizer.customPresets"
            :key="index"
            class="preset-btn custom"
            @click="applyCustomPreset(preset)"
          >
            {{ preset.name }}
            <span class="delete-btn" @click.stop="deletePreset(index)">×</span>
          </button>
        </div>
      </div>

      <!-- 保存自定义预设 -->
      <div class="save-preset-section">
        <input
          v-model="newPresetName"
          type="text"
          placeholder="输入预设名称"
          class="preset-name-input"
          @keyup.enter="saveCurrentPreset"
        />
        <button @click="saveCurrentPreset" class="btn-save" :disabled="!newPresetName.trim()">
          保存当前设置
        </button>
      </div>

      <!-- 均衡器滑块 -->
      <div class="equalizer-sliders">
        <div
          v-for="(freq, index) in equalizer.EQUALIZER_FREQUENCIES"
          :key="index"
          class="slider-group"
        >
          <div class="freq-label">{{ formatFrequency(freq) }}</div>
          <div class="slider-container">
            <input
              type="range"
              :value="equalizer.gains[index]"
              min="-12"
              max="12"
              step="0.5"
              class="slider"
              :disabled="!equalizer.enabled"
              @input="updateGain(index, ($event.target as HTMLInputElement).valueAsNumber)"
            />
            <div class="gain-value" :class="{ positive: equalizer.gains[index] > 0, negative: equalizer.gains[index] < 0 }">
              {{ formatGain(equalizer.gains[index]) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useEqualizer, type EqualizerPreset } from '@/composables/useEqualizer'
import { usePlayerStore } from '@/stores/player'

const playerStore = usePlayerStore()
const equalizer = useEqualizer()
const currentPreset = ref<string | null>(null)
const newPresetName = ref('')

onMounted(() => {
  // 加载保存的均衡器设置
  loadEqualizerSettings()

  // 尝试找到音频元素并初始化均衡器
  const findAndInitAudio = () => {
    const audio = document.querySelector('audio')
    if (audio) {
      equalizer.initAudioContext(audio)
      return true
    }
    return false
  }

  // 立即尝试
  findAndInitAudio()

  // 如果没找到，延迟再试（音频元素可能稍后才创建）
  setTimeout(() => {
    findAndInitAudio()
  }, 1000)
})

// 监听当前音乐变化，重新初始化均衡器
watch(() => playerStore.currentMusic, () => {
  setTimeout(() => {
    const audio = document.querySelector('audio')
    if (audio) {
      equalizer.initAudioContext(audio)
    }
  }, 500)
})

const formatFrequency = (freq: number): string => {
  if (freq >= 1000) {
    return `${(freq / 1000).toFixed(1)}k`
  }
  return freq.toString()
}

const formatGain = (gain: number): string => {
  if (gain === 0) return '0'
  return gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)
}

const updateGain = (index: number, value: number) => {
  equalizer.setGain(index, value)
  currentPreset.value = null // 清除预设选择
  saveEqualizerSettings()
}

const applyPreset = (key: string, preset: EqualizerPreset) => {
  equalizer.applyPreset(preset)
  currentPreset.value = key
  saveEqualizerSettings()
}

const applyCustomPreset = (preset: EqualizerPreset) => {
  equalizer.applyPreset(preset)
  currentPreset.value = null
  saveEqualizerSettings()
}

const resetEqualizer = () => {
  equalizer.reset()
  currentPreset.value = 'flat'
  saveEqualizerSettings()
}

const saveCurrentPreset = () => {
  if (!newPresetName.value.trim()) return

  equalizer.savePreset(newPresetName.value.trim())
  newPresetName.value = ''
  saveEqualizerSettings()
}

const deletePreset = (index: number) => {
  if (confirm('确定要删除这个预设吗？')) {
    equalizer.deletePreset(index)
    saveEqualizerSettings()
  }
}

const saveEqualizerSettings = async () => {
  const settings = {
    enabled: equalizer.enabled,
    gains: equalizer.gains,
    customPresets: equalizer.customPresets
  }
  await window.electronAPI.saveSettings({ equalizer: settings })
}

const loadEqualizerSettings = async () => {
  const settings = await window.electronAPI.getSettings()
  if (settings?.equalizer) {
    equalizer.enabled = settings.equalizer.enabled || false
    if (settings.equalizer.gains) {
      equalizer.gains = settings.equalizer.gains
    }
    if (settings.equalizer.customPresets) {
      equalizer.customPresets = settings.equalizer.customPresets
    }
  }
}
</script>

<style scoped>
.equalizer-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.equalizer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.equalizer-header h2 {
  margin: 0;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-color);
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.btn-reset {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
}

.btn-reset:hover {
  background: var(--hover-bg);
}

.equalizer-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.presets-section {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.presets-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color);
}

.presets-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  position: relative;
}

.preset-btn:hover {
  background: var(--hover-bg);
}

.preset-btn.active {
  background: #ff4757;
  color: white;
  border-color: #ff4757;
}

.preset-btn.custom {
  padding-right: 24px;
}

.delete-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 0, 0, 0.2);
  color: #ff0000;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.delete-btn:hover {
  background: rgba(255, 0, 0, 0.4);
}

.save-preset-section {
  display: flex;
  gap: 12px;
  align-items: center;
}

.preset-name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
}

.btn-save {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #ff4757;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-save:hover:not(:disabled) {
  background: #ff6b7a;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.equalizer-sliders {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  gap: 8px;
  padding: 20px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  min-height: 300px;
}

.slider-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.freq-label {
  font-size: 11px;
  color: var(--secondary-text-color);
  font-weight: 500;
}

.slider-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.slider {
  width: 100%;
  height: 200px;
  writing-mode: vertical-lr;
  direction: rtl;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  opacity: 1;
  background: transparent;
}

.slider::-webkit-slider-track {
  width: 4px;
  background: var(--border-color);
  border-radius: 2px;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--active-text);
  border-radius: 50%;
  cursor: pointer;
  margin-left: -6px;
}

.slider::-moz-range-track {
  width: 4px;
  background: var(--border-color);
  border-radius: 2px;
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--active-text);
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gain-value {
  font-size: 11px;
  color: var(--secondary-text-color);
  min-width: 35px;
  text-align: center;
}

.gain-value.positive {
  color: #4CAF50;
}

.gain-value.negative {
  color: #f44336;
}
</style>
