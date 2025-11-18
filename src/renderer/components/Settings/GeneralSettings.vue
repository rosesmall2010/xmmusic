<template>
  <div class="general-settings">
    <h2>通用设置</h2>

    <div class="setting-item">
      <label>主题</label>
      <select v-model="settings.theme" @change="saveSettings">
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </div>

    <div class="setting-item">
      <label>语言</label>
      <select v-model="settings.language" @change="saveSettings">
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>

    <div class="setting-item">
      <label>启动时自动播放上次的音乐</label>
      <input type="checkbox" v-model="settings.autoPlayOnStart" @change="saveSettings" />
    </div>

    <div class="setting-item">
      <label>最小化到系统托盘</label>
      <input type="checkbox" v-model="settings.minimizeToTray" @change="saveSettings" />
    </div>

    <div class="setting-item">
      <label>默认显示歌词</label>
      <input type="checkbox" v-model="settings.showLyrics" @change="saveSettings" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

const settings = ref({
  theme: 'light',
  language: 'zh',
  autoPlayOnStart: false,
  minimizeToTray: false,
  showLyrics: false
})

onMounted(async () => {
  const saved = await window.electronAPI.getSettings()
  if (saved) {
    settings.value = { ...settings.value, ...saved }
  }
})

const saveSettings = async () => {
  await window.electronAPI.saveSettings(settings.value)

  // 应用主题到 #app 元素
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.className = settings.value.theme
  }

  // 触发主题变化事件
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: settings.value.theme }))

  // 应用语言
  locale.value = settings.value.language
}

// 监听主题变化
watch(() => settings.value.theme, (newTheme) => {
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.className = newTheme
  }
  // 触发主题变化事件
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: newTheme }))
})
</script>

<style scoped>
.general-settings {
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
}

.setting-item select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
}

.setting-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}
</style>
