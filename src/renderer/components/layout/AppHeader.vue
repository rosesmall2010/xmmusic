<template>
  <header class="app-header">
    <div class="header-left">
      <div class="nav-buttons">
        <button class="nav-btn" @click="goBack" :disabled="!canGoBack" title="后退">
          <span class="icon">←</span>
        </button>
        <button class="nav-btn" @click="goForward" :disabled="!canGoForward" title="前进">
          <span class="icon">→</span>
        </button>
      </div>
    </div>

    <div class="header-center">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索音乐、艺术家、专辑..."
          @keyup.enter="handleSearch"
        />
        <button v-if="searchQuery" class="clear-btn" @click="clearSearch">
          <span>×</span>
        </button>
      </div>
    </div>

    <div class="header-right">
      <button class="header-btn" @click="toggleMiniMode" title="迷你模式">
        <span class="icon">🖥️</span>
      </button>

      <button class="header-btn" @click="toggleTheme" :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'">
        <span class="icon">{{ theme === 'dark' ? '☀️' : '🌙' }}</span>
      </button>

      <button class="header-btn" @click="openSettings" title="设置">
        <span class="icon">⚙️</span>
      </button>

      <div class="window-controls" v-if="!isMac">
        <button class="win-btn minimize" @click="minimizeWindow">
          <span>−</span>
        </button>
        <button class="win-btn maximize" @click="maximizeWindow">
          <span>□</span>
        </button>
        <button class="win-btn close" @click="closeWindow">
          <span>×</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const searchQuery = ref('')
const theme = ref<'light' | 'dark'>('light')
// Check if running on Mac by checking user agent
const isMac = ref(navigator.userAgent.includes('Mac'))

const canGoBack = computed(() => router.options.history.state.back !== null)
const canGoForward = computed(() => router.options.history.state.forward !== null)

const goBack = () => {
  if (canGoBack.value) {
    router.back()
  }
}

const goForward = () => {
  if (canGoForward.value) {
    router.forward()
  }
}

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    router.push({
      name: 'Search',
      query: { q: searchQuery.value }
    })
  }
}

const clearSearch = () => {
  searchQuery.value = ''
}

const toggleTheme = async () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.getElementById('app')?.setAttribute('class', theme.value)
  await window.electronAPI.saveSettings({ theme: theme.value })
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme.value }))
}

const toggleMiniMode = async () => {
  await window.electronAPI.setMiniMode(true)
  router.push('/mini')
}

const openSettings = () => {
  router.push('/settings')
}

const minimizeWindow = () => {
  window.electronAPI.minimizeWindow()
}

const maximizeWindow = () => {
  window.electronAPI.maximizeWindow()
}

const closeWindow = () => {
  window.electronAPI.closeWindow()
}

// 初始化主题
;(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'
})()
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-lg);
  -webkit-app-region: drag;
  user-select: none;
}

.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.header-left {
  flex-shrink: 0;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 600px;
  margin: 0 auto;
}

.header-right {
  flex-shrink: 0;
}

/* 导航按钮 */
.nav-buttons {
  display: flex;
  gap: var(--spacing-xs);
  -webkit-app-region: no-drag;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--hover-bg);
  border-radius: var(--radius-base);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color);
  transition: all var(--transition-base) var(--transition-timing);
}

.nav-btn:hover:not(:disabled) {
  background: var(--active-bg);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 搜索框 */
.search-box {
  flex: 1;
  max-width: 500px;
  height: 40px;
  background: var(--bg-secondary);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-sm);
  -webkit-app-region: no-drag;
  transition: all var(--transition-base) var(--transition-timing);
}

.search-box:focus-within {
  background: var(--hover-bg);
  box-shadow: 0 0 0 2px var(--color-primary);
}

.search-icon {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: var(--font-size-base);
  color: var(--text-color);
}

.search-box input::placeholder {
  color: var(--text-tertiary);
}

.clear-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-xl);
  line-height: 1;
  transition: all var(--transition-fast) var(--transition-timing);
}

.clear-btn:hover {
  background: var(--active-bg);
  color: var(--text-color);
}

/* Header按钮 */
.header-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-base);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color);
  font-size: var(--font-size-lg);
  transition: all var(--transition-base) var(--transition-timing);
  -webkit-app-region: no-drag;
}

.header-btn:hover {
  background: var(--hover-bg);
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  gap: var(--spacing-xs);
  margin-left: var(--spacing-md);
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color);
  font-size: var(--font-size-base);
  transition: background var(--transition-fast) var(--transition-timing);
}

.win-btn:hover {
  background: var(--hover-bg);
}

.win-btn.close:hover {
  background: #e81123;
  color: white;
}

.icon {
  font-size: inherit;
  display: inline-block;
}
</style>
