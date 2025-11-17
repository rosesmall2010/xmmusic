<template>
  <div class="playback-settings">
    <h2>播放设置</h2>

    <div class="setting-item">
      <label>默认音量</label>
      <input type="range" v-model="settings.defaultVolume" min="0" max="100" @change="saveSettings" />
      <span class="value">{{ settings.defaultVolume }}%</span>
    </div>

    <div class="setting-item">
      <label>默认播放模式</label>
      <select v-model="settings.defaultPlayMode" @change="saveSettings">
        <option value="sequential">顺序播放</option>
        <option value="random">随机播放</option>
        <option value="repeat">单曲循环</option>
      </select>
    </div>

    <div class="setting-item">
      <label>淡入淡出</label>
      <input type="checkbox" v-model="settings.fadeInOut" @change="saveSettings" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const settings = ref({
  defaultVolume: 80,
  defaultPlayMode: 'sequential',
  fadeInOut: false
})

onMounted(async () => {
  const saved = await window.electronAPI.getSettings()
  if (saved) {
    settings.value = { ...settings.value, ...saved }
  }
})

const saveSettings = async () => {
  await window.electronAPI.saveSettings(settings.value)
}
</script>

<style scoped>
.playback-settings {
  padding: 20px;
}

h2 {
  margin-bottom: 24px;
  color: var(--text-color);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-item label {
  color: var(--text-color);
  font-size: 14px;
  flex: 1;
}

.setting-item input[type="range"] {
  flex: 2;
  margin: 0 10px;
}

.setting-item .value {
  width: 50px;
  text-align: right;
  color: var(--text-color);
}

.setting-item select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
}

.setting-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}
</style>
