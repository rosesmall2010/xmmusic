<template>
  <header class="header">
    <div class="header-left">
      <h1 class="app-name">xmmusic</h1>
    </div>
    <div class="header-center">
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="$t('header.searchPlaceholder')"
        class="search-input"
        @input="handleSearch"
      />
    </div>
    <div class="header-right">
      <button class="header-btn" @click="toggleTheme">
        <span v-if="theme === 'light'">🌙</span>
        <span v-else>☀️</span>
      </button>
      <button class="header-btn" @click="toggleLanguage">
        {{ currentLanguage === 'zh' ? 'EN' : '中文' }}
      </button>
      <button class="header-btn" @click="minimizeWindow">➖</button>
      <button class="header-btn" @click="maximizeWindow">🔲</button>
      <button class="header-btn close-btn" @click="closeWindow">✕</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMusicStore } from '@/stores/music'

const { locale } = useI18n()
const musicStore = useMusicStore()
const theme = ref('light')
const currentLanguage = ref('zh')
const searchQuery = ref('')

onMounted(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'
  currentLanguage.value = settings?.language || 'zh'
  locale.value = currentLanguage.value
})

const minimizeWindow = () => {
  window.electronAPI.minimizeWindow()
}

const maximizeWindow = () => {
  window.electronAPI.maximizeWindow()
}

const closeWindow = () => {
  window.electronAPI.closeWindow()
}

const toggleTheme = async () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  await window.electronAPI.saveSettings({ theme: theme.value })
  document.getElementById('app')?.setAttribute('class', theme.value)
}

const toggleLanguage = async () => {
  currentLanguage.value = currentLanguage.value === 'zh' ? 'en' : 'zh'
  locale.value = currentLanguage.value
  await window.electronAPI.saveSettings({ language: currentLanguage.value })
}

let searchTimer: NodeJS.Timeout | null = null
const handleSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    musicStore.searchMusic(searchQuery.value)
  }, 300)
}
</script>

<style scoped>
.header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
  -webkit-app-region: drag;
}

.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
}

.app-name {
  font-size: 18px;
  font-weight: bold;
  color: #ff4757;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 20px;
  outline: none;
  width: 250px;
  -webkit-app-region: no-drag;
}

.search-input:focus {
  border-color: #ff4757;
}

.header-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  cursor: pointer;
  margin-left: 10px;
  border-radius: 4px;
  -webkit-app-region: no-drag;
  transition: background-color 0.2s;
}

.header-btn:hover {
  background-color: #f0f0f0;
}

.close-btn:hover {
  background-color: #ff4757;
  color: white;
}
</style>
