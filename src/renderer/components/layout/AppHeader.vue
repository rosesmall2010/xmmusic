<template>
  <header class="app-header">
    <div class="header-left">
      <div class="nav-buttons">
        <button class="nav-btn" @click="goBack" :disabled="!canGoBack" :title="$t('common.back')">
          <ChevronLeft :size="20" />
        </button>
        <button class="nav-btn" @click="goForward" :disabled="!canGoForward" :title="$t('common.forward')">
          <ChevronRight :size="20" />
        </button>
      </div>
    </div>

    <div class="header-center">
      <div class="search-wrapper" @keydown="handleSearchKeydown">
        <div class="search-box" :class="{ focused: showDropdown }">
          <Search :size="18" class="search-icon" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('header.searchPlaceholder')"
            @keyup.enter="handleSearch"
            @focus="handleSearchFocus"
            @blur="handleSearchBlur"
            @input="handleSearchInput"
          />
          <button v-if="searchQuery" class="clear-btn" @click="clearSearch">
            <X :size="20" />
          </button>
        </div>

        <!-- Search Dropdown -->
        <div v-if="showDropdown" class="search-dropdown">
          <!-- Search History -->
          <div v-if="searchHistory.length > 0 && !searchQuery" class="dropdown-section">
            <div class="section-header">
              <span>{{ $t('header.searchHistory') }}</span>
              <button class="clear-history-btn" @click="clearHistory">{{ $t('common.clear') }}</button>
            </div>
            <div
              v-for="(item, index) in searchHistory.slice(0, 5)"
              :key="'history-' + index"
              class="dropdown-item"
              :class="{ selected: selectedIndex === index }"
              @mousedown.prevent="selectHistoryItem(item)"
            >
              <Clock :size="16" class="item-icon" />
              <span class="item-text">{{ typeof item === 'string' ? item : (item.keyword || item.query || 'Unknown') }}</span>
            </div>
          </div>

          <!-- Search Suggestions -->
          <div v-if="searchSuggestions.length > 0 && searchQuery" class="dropdown-section">
            <div class="section-header">{{ $t('header.searchSuggestions') }}</div>
            <div
              v-for="(suggestion, index) in searchSuggestions.slice(0, 5)"
              :key="'suggestion-' + index"
              class="dropdown-item"
              :class="{ selected: selectedIndex === index }"
              @mousedown.prevent="selectSuggestion(suggestion)"
            >
              <Search :size="16" class="item-icon" />
              <span class="item-text">{{ suggestion }}</span>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="searchQuery && searchSuggestions.length === 0" class="dropdown-empty">
            {{ $t('header.noSuggestions') }}
          </div>
        </div>
      </div>
    </div>

    <div class="header-right">
      <button class="header-btn" @click="toggleMiniMode" :title="$t('header.miniMode')">
        <Minimize2 :size="18" />
      </button>

      <button class="header-btn" @click="toggleTheme" :title="theme === 'dark' ? $t('header.switchToLight') : $t('header.switchToDark')">
        <Moon v-if="theme === 'light'" :size="18" />
        <Sun v-else :size="18" />
      </button>

      <button class="header-btn" @click="toggleLanguage" :title="$t('header.switchLanguage')">
        <Languages :size="18" />
      </button>

      <button class="header-btn" @click="openSettings" :title="$t('header.settings')">
        <Settings :size="18" />
      </button>

      <div class="window-controls" v-if="!isMac">
        <button class="win-btn minimize" @click="minimizeWindow">
          <span>−</span>
        </button>
        <button class="win-btn maximize" @click="maximizeWindow">
          <span>□</span>
        </button>
        <button class="win-btn close" @click="closeWindow">
          <X :size="24" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, Moon, Sun, Settings, Minimize2, Search, Clock, X, Languages } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { locale } = useI18n()
const settingsStore = useSettingsStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const showDropdown = ref(false)
const searchSuggestions = ref<string[]>([])
const searchHistory = ref<any[]>([])
const selectedIndex = ref(-1)
const theme = ref<'light' | 'dark'>('light')
const isMac = ref(navigator.userAgent.includes('Mac'))
let debounceTimer: ReturnType<typeof setTimeout> | null = null

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

const handleSearchInput = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(async () => {
    const query = searchQuery.value || ''
    if (query.trim().length >= 2) {
      try {
        searchSuggestions.value = await window.electronAPI.getSearchSuggestions(query)
      } catch (error) {
        console.error('Failed to get search suggestions:', error)
      }
    } else {
      searchSuggestions.value = []
    }
    selectedIndex.value = -1
  }, 300)
}

const handleSearchFocus = async () => {
  showDropdown.value = true

  // Load search history when focusing
  if (!searchQuery.value) {
    try {
      searchHistory.value = await window.electronAPI.getSearchHistory()
      console.log('Search history loaded:', searchHistory.value)
    } catch (error) {
      console.error('Failed to load search history:', error)
      searchHistory.value = []
    }
  }
}

const handleSearchBlur = () => {
  // Delay to allow click on dropdown items
  setTimeout(() => {
    showDropdown.value = false
    selectedIndex.value = -1
  }, 200)
}

const handleSearch = async () => {
  const query = searchQuery.value || ''
  if (query.trim().length === 0) {
    return
  }

  showDropdown.value = false

  try {
    // 保存搜索历史（如果API存在）
    if (window.electronAPI.addSearchHistory) {
      await window.electronAPI.addSearchHistory(query.trim())
    }
  } catch (error) {
    console.error('Failed to save search history:', error)
  }

  router.push({
    name: 'Search',
    query: { q: query }
  })
}

const clearSearch = () => {
  searchQuery.value = ''
  searchSuggestions.value = []
}

const selectSuggestion = (suggestion: string) => {
  searchQuery.value = suggestion || ''
  handleSearch()
}

const selectHistoryItem = (item: any) => {
  const keyword = typeof item === 'string' ? item : (item.keyword || item.query || '')
  searchQuery.value = keyword
  handleSearch()
}

const clearHistory = async () => {
  try {
    await window.electronAPI.clearSearchHistory()
    searchHistory.value = []
  } catch (error) {
    console.error('Failed to clear search history:', error)
  }
}

const handleSearchKeydown = (e: KeyboardEvent) => {
  if (!showDropdown.value) return

  const itemCount = searchQuery.value
    ? searchSuggestions.value.length
    : searchHistory.value.length

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % itemCount
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = selectedIndex.value <= 0 ? itemCount - 1 : selectedIndex.value - 1
  } else if (e.key === 'Enter' && selectedIndex.value >= 0) {
    e.preventDefault()
    if (searchQuery.value && searchSuggestions.value[selectedIndex.value]) {
      selectSuggestion(searchSuggestions.value[selectedIndex.value])
    } else if (!searchQuery.value && searchHistory.value[selectedIndex.value]) {
      selectHistoryItem(searchHistory.value[selectedIndex.value])
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false
    searchInputRef.value?.blur()
  }
}

const toggleTheme = async () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.getElementById('app')?.setAttribute('class', theme.value)
  await window.electronAPI.saveSettings({ theme: theme.value })
  // 同步窗口外观,确保红绿灯颜色正确
  await window.electronAPI.setWindowTheme(theme.value)
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme.value }))
}

const toggleMiniMode = async () => {
  // 保存当前路由路径，以便退出Mini模式时恢复
  localStorage.setItem('lastRoute', router.currentRoute.value.fullPath)
  await window.electronAPI.setMiniMode(true)
  router.replace('/mini')
}

const toggleLanguage = () => {
  const newLang = settingsStore.language === 'zh' ? 'en' : 'zh'
  settingsStore.setLanguage(newLang)
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
onMounted(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'
})
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
  -webkit-app-region: drag; /* 整个header作为拖拽区域，空白区域可拖动 */
}

/* 确保所有按钮和搜索框都可以点击 */
.header-btn,
.nav-btn,
.win-btn {
  -webkit-app-region: no-drag;
}

.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  /* 移除 no-drag，让空白区域可以拖动 */
}

.search-wrapper {
  -webkit-app-region: no-drag;
}

.search-box {
  -webkit-app-region: no-drag;
}

.nav-buttons {
  -webkit-app-region: no-drag;
}

/* macOS红绿灯按钮避让 */
.header-left {
  padding-left: 80px;
}

/* Windows下不需要额外padding */
@media (not (platform: macos)) {
  .header-left {
    padding-left: 0;
  }
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
.search-wrapper {
  flex: 1;
  max-width: 333px;
  position: relative;
}

.search-box {
  height: 40px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-sm);
  -webkit-app-region: no-drag;
  transition: all var(--transition-base) var(--transition-timing);
}

.search-box.focused {
  background: var(--hover-bg);
  box-shadow: 0 0 0 2px var(--color-primary);
}

.search-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
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

/* 搜索下拉菜单 */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 1000;
  max-height: 400px;
  overflow-y: auto;
}

.dropdown-section {
  padding: var(--spacing-sm) 0;
}

.dropdown-section + .dropdown-section {
  border-top: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.clear-history-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.clear-history-btn:hover {
  background: var(--hover-bg);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  min-height: 40px; /* 确保足够的高度 */
}

.dropdown-item:hover,
.dropdown-item.selected {
  background: var(--hover-bg);
}

.item-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.item-text {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--text-color) !important; /* 强制显示文字 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
  min-width: 0; /* 允许flex收缩 */
  display: block; /* 确保显示为块级元素 */
}

.dropdown-empty {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
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
  /* 优化transition,仅对background做过渡,减少延迟 */
  transition: background var(--transition-fast) var(--transition-timing);
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
