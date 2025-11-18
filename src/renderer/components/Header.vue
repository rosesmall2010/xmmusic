<template>
  <header class="header">
    <div class="header-left">
      <h1 class="app-name">xmmusic</h1>
    </div>
    <div class="header-center">
      <div class="search-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('header.searchPlaceholder')"
          class="search-input"
          @input="handleSearch"
          @focus="showSuggestions = true"
          @blur="handleSearchBlur"
          @keydown.enter="handleSearchEnter"
          @keydown.arrow-down.prevent="selectNextSuggestion"
          @keydown.arrow-up.prevent="selectPrevSuggestion"
        />
        <div v-if="showSuggestions && (searchSuggestions.length > 0 || searchHistory.length > 0)" class="search-dropdown">
          <div v-if="searchSuggestions.length > 0" class="suggestions-section">
            <div class="section-title">搜索建议</div>
            <div
              v-for="(suggestion, index) in searchSuggestions"
              :key="`suggestion-${index}`"
              class="suggestion-item"
              :class="{ active: selectedSuggestionIndex === index }"
              @mousedown="selectSuggestion(suggestion)"
              v-html="highlightText(suggestion, searchQuery)"
            ></div>
          </div>
          <div v-if="searchHistory.length > 0 && searchQuery === ''" class="history-section">
            <div class="section-header">
              <span class="section-title">搜索历史</span>
              <button class="clear-history-btn" @click="clearHistory">清除</button>
            </div>
            <div
              v-for="(item, index) in searchHistory"
              :key="`history-${index}`"
              class="suggestion-item history-item"
              @mousedown="selectSuggestion(item.query)"
            >
              <span class="history-icon">🕐</span>
              {{ item.query }}
            </div>
          </div>
        </div>
      </div>
    </div>
          <div class="header-right">
            <div v-if="scanStore.isScanning || scanStore.progress" class="scan-indicator">
              <span class="scan-text">
                {{ scanStore.isPaused ? '⏸ 扫描已暂停' : '⏳ 扫描中' }}:
                {{ scanStore.progress ? scanStore.progress.percentage.toFixed(1) + '%' : '0%' }}
              </span>
            </div>
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
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMusicStore } from '@/stores/music'
import { useScanStore } from '@/stores/scan'

const { locale } = useI18n()
const musicStore = useMusicStore()
const scanStore = useScanStore()
const theme = ref('light')
const currentLanguage = ref('zh')
const searchQuery = ref('')
const showSuggestions = ref(false)
const searchSuggestions = ref<string[]>([])
const searchHistory = ref<Array<{ query: string; searchType: string; createdAt: string }>>([])
const selectedSuggestionIndex = ref(-1)

onMounted(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'
  currentLanguage.value = settings?.language || 'zh'
  locale.value = currentLanguage.value

  // 应用主题到 #app 元素（如果还没有应用）
  const appElement = document.getElementById('app')
  if (appElement && !appElement.className) {
    appElement.className = theme.value
  }

  // 监听主题变化事件（从设置页面触发）
  window.addEventListener('theme-changed', ((e: CustomEvent) => {
    theme.value = e.detail
  }) as EventListener)

  // 加载搜索历史
  await loadSearchHistory()

  // 扫描状态由 App.vue 统一管理，这里不需要重复监听
})

// 监听搜索查询变化，获取搜索建议
watch(searchQuery, async (newQuery) => {
  if (newQuery && newQuery.trim().length > 0) {
    try {
      searchSuggestions.value = await window.electronAPI.getSearchSuggestions(newQuery)
    } catch (error) {
      console.error('获取搜索建议失败:', error)
    }
  } else {
    searchSuggestions.value = []
  }
  selectedSuggestionIndex.value = -1
})

const loadSearchHistory = async () => {
  try {
    searchHistory.value = await window.electronAPI.getSearchHistory()
  } catch (error) {
    console.error('加载搜索历史失败:', error)
  }
}

const clearHistory = async () => {
  try {
    await window.electronAPI.clearSearchHistory()
    searchHistory.value = []
  } catch (error) {
    console.error('清除搜索历史失败:', error)
  }
}

const selectSuggestion = (suggestion: string) => {
  searchQuery.value = suggestion
  showSuggestions.value = false
  handleSearch()
}

const handleSearchBlur = () => {
  // 延迟隐藏，以便点击建议项时能触发
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const handleSearchEnter = () => {
  if (selectedSuggestionIndex.value >= 0 && searchSuggestions.value[selectedSuggestionIndex.value]) {
    selectSuggestion(searchSuggestions.value[selectedSuggestionIndex.value])
  } else {
    handleSearch()
    showSuggestions.value = false
  }
}

const selectNextSuggestion = () => {
  if (searchSuggestions.value.length > 0) {
    selectedSuggestionIndex.value = Math.min(selectedSuggestionIndex.value + 1, searchSuggestions.value.length - 1)
  }
}

const selectPrevSuggestion = () => {
  if (selectedSuggestionIndex.value > 0) {
    selectedSuggestionIndex.value--
  }
}

const highlightText = (text: string, query: string): string => {
  if (!query || !text) return text
  const regex = new RegExp(`(${query})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
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

const toggleTheme = async () => {
  const newTheme = theme.value === 'light' ? 'dark' : 'light'
  theme.value = newTheme
  await window.electronAPI.saveSettings({ theme: newTheme })
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.className = newTheme
  }
  // 触发事件通知其他组件
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: newTheme }))
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
    showSuggestions.value = false
    // 重新加载搜索历史
    loadSearchHistory()
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
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
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
  color: var(--active-text);
}

.search-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  outline: none;
  width: 250px;
  background: var(--bg-color);
  color: var(--text-color);
}

.search-input:focus {
  border-color: var(--active-text);
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
  color: var(--text-color);
}

.suggestions-section,
.history-section {
  padding: 8px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--secondary-text-color);
  text-transform: uppercase;
  padding: 8px 12px;
}

.clear-history-btn {
  background: none;
  border: none;
  color: var(--secondary-text-color);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}

.clear-history-btn:hover {
  color: var(--active-text);
}

.suggestion-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
}

.suggestion-item:hover,
.suggestion-item.active {
  background-color: var(--hover-bg);
}

.history-item {
  color: var(--secondary-text-color);
}

.history-icon {
  margin-right: 8px;
  font-size: 12px;
}

.suggestion-item mark {
  background-color: #ffeb3b;
  color: inherit;
  font-weight: 600;
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
  background-color: var(--hover-bg);
}

.close-btn:hover {
  background-color: var(--active-text);
  color: white;
}

.scan-indicator {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  margin-right: 8px;
  background: var(--hover-bg);
  border-radius: 4px;
  font-size: 12px;
}

.scan-text {
  color: var(--text-color);
  white-space: nowrap;
}
</style>
