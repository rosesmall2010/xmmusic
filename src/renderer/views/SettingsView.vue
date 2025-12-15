<template>
  <div class="settings-view">
    <div class="page-header">
      <h1 class="page-title">{{ $t('settings.title') }}</h1>
    </div>

    <div class="settings-content">
      <!-- 常规设置 -->
      <section class="settings-section">
        <h2 class="section-title">{{ $t('settings.general') }}</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.theme') }}</div>
            <div class="setting-desc">{{ $t('settings.themeDesc') }}</div>
          </div>
          <div class="setting-control">
            <select :value="settingsStore.theme" @change="handleThemeChange">
              <option value="light">{{ $t('settings.lightMode') }}</option>
              <option value="dark">{{ $t('settings.darkMode') }}</option>
              <option value="system">{{ $t('settings.systemMode') }}</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.language') }}</div>
            <div class="setting-desc">{{ $t('settings.languageDesc') }}</div>
          </div>
          <div class="setting-control">
            <div class="language-buttons">
              <button
                class="lang-btn"
                :class="{ active: settingsStore.language === 'zh' }"
                @click="handleLanguageChange('zh')"
              >
                <span class="lang-flag">🇨🇳</span>
                <span class="lang-name">{{ $t('settings.chinese') }}</span>
              </button>
              <button
                class="lang-btn"
                :class="{ active: settingsStore.language === 'en' }"
                @click="handleLanguageChange('en')"
              >
                <span class="lang-flag">🇺🇸</span>
                <span class="lang-name">{{ $t('settings.english') }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.closeBehavior') }}</div>
            <div class="setting-desc">{{ $t('settings.closeBehaviorDesc') }}</div>
          </div>
          <div class="setting-control">
            <label class="switch">
              <input
                type="checkbox"
                :checked="settingsStore.closeToTray"
                @change="settingsStore.toggleCloseToTray()"
              >
              <span class="slider round"></span>
            </label>
            <span class="switch-label">{{ settingsStore.closeToTray ? $t('settings.minimizeToTray') : $t('settings.exitApp') }}</span>
          </div>
        </div>
      </section>

      <!-- 播放设置 -->
      <section class="settings-section">
        <h2 class="section-title">{{ $t('settings.playback') }}</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.autoPlay') }}</div>
            <div class="setting-desc">{{ $t('settings.autoPlayDesc') }}</div>
          </div>
          <div class="setting-control">
            <label class="switch">
              <input
                type="checkbox"
                :checked="settingsStore.autoPlay"
                @change="settingsStore.toggleAutoPlay()"
              >
              <span class="slider round"></span>
            </label>
          </div>
        </div>
      </section>

      <!-- 音乐目录管理 -->
      <section class="settings-section">
        <h2 class="section-title">{{ $t('settings.musicDirectories') }}</h2>
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.scanDirectories') }}</div>
            <div class="setting-desc">{{ $t('settings.scanDirectoriesDesc') }}</div>
          </div>
          <div class="setting-control">
            <button class="btn-primary" @click="showAddDirDialog = true" :disabled="dirStore.directories.length >= 20">
              <Plus :size="16" />
              {{ $t('settings.addDirectory') }}
            </button>
          </div>
        </div>

        <div v-if="dirStore.loading" class="dir-loading">{{ $t('settings.loading') }}</div>
        <div v-else-if="dirStore.directories.length === 0" class="dir-empty">
          {{ $t('settings.noDirectories') }}
        </div>
        <div v-else class="dir-list">
          <div
            v-for="dir in dirStore.directories"
            :key="dir.id"
            class="dir-item"
            :class="{ disabled: !dir.enabled }"
          >
            <div class="dir-content">
              <div class="dir-path">{{ dir.path }}</div>
              <div class="dir-meta">
                <span class="dir-order">{{ $t('settings.order') }}: {{ dir.display_order }}</span>
                <span class="dir-status" :class="{ enabled: dir.enabled, disabled: !dir.enabled }">
                  {{ dir.enabled ? $t('settings.enabled') : $t('settings.disabled') }}
                </span>
              </div>
            </div>
            <div class="dir-actions">
              <button
                class="btn-icon"
                @click="toggleDirEnabled(dir)"
                :title="dir.enabled ? $t('settings.disable') : $t('settings.enable')"
              >
                <Power v-if="dir.enabled" :size="16" />
                <PowerOff v-else :size="16" />
              </button>
              <button class="btn-icon" @click="editDir(dir)" :title="$t('settings.edit')">
                <Edit :size="16" />
              </button>
              <button class="btn-icon danger" @click="deleteDir(dir)" :title="$t('settings.delete')">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 存储与数据 -->
      <section class="settings-section">
        <h2 class="section-title">{{ $t('settings.dataManagement') }}</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.musicLibrary') }}</div>
            <div class="setting-desc">{{ $t('settings.rescanAllDesc') }}</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="rescanLibrary" :disabled="isRescanning">
              {{ isRescanning ? $t('settings.scanning') : $t('settings.rescanAll') }}
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.clearCache') }}</div>
            <div class="setting-desc">{{ $t('settings.clearCacheDesc') }}</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearCache" :disabled="isClearing">
              {{ isClearing ? $t('settings.clearing') : $t('settings.clearCache') }}
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.searchHistory') }}</div>
            <div class="setting-desc">{{ $t('settings.clearSearchHistoryDesc') }}</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearSearchHistory">{{ $t('settings.clearHistory') }}</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">{{ $t('settings.playHistory') }}</div>
            <div class="setting-desc">{{ $t('settings.clearPlayHistoryDesc') }}</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearPlayHistory">{{ $t('settings.clearHistory') }}</button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-section">
        <h2 class="section-title">{{ $t('settings.about') }}</h2>

        <div class="about-card">
          <div class="app-logo">
            <Music :size="48" />
          </div>
          <div class="app-info">
            <h3 class="app-name">XM Music</h3>
            <p class="app-version">{{ $t('settings.version') }} {{ appVersion }}</p>
            <p class="app-desc">{{ $t('settings.appDescription') }}</p>
          </div>
          <div class="app-links">
            <a href="https://github.com/zdhsoft/xmmusic" target="_blank" class="link">GitHub</a>
            <span class="divider">|</span>
            <a href="#" class="link" @click.prevent="checkUpdate">{{ $t('settings.checkUpdate') }}</a>
          </div>
        </div>
      </section>
    </div>

    <!-- 添加/编辑目录对话框 -->
    <div v-if="showAddDirDialog" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog-content">
        <h3 class="dialog-title">{{ editingDir ? '编辑目录' : '添加目录' }}</h3>
        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">{{ $t('settings.directoryPath') }}</label>
            <div class="form-input-group">
              <input
                v-model="newDirPath"
                type="text"
                class="form-input"
                :placeholder="$t('settings.directoryPathPlaceholder')"
                @keyup.enter="editingDir ? handleSaveEdit() : handleAddDir()"
              />
              <button
                class="btn-secondary"
                @click="selectDirPath"
                :title="$t('settings.browse')"
              >
                {{ $t('settings.browse') }}
              </button>
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-secondary" @click="closeDialog">{{ $t('common.cancel') }}</button>
          <button class="btn-primary" @click="editingDir ? handleSaveEdit() : handleAddDir()">
            {{ editingDir ? $t('common.save') : $t('common.add') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Music, Plus, Power, PowerOff, Edit, Trash2 } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useLocalMusicDirStore } from '@/stores/localMusicDir'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const dirStore = useLocalMusicDirStore()
const isClearing = ref(false)
const isRescanning = ref(false)
const appVersion = ref('1.0.7')
const showAddDirDialog = ref(false)
const editingDir = ref<{ id: number; path: string; display_order: number; enabled: boolean } | null>(null)
const newDirPath = ref('')

// 加载目录列表
onMounted(async () => {
  try {
    await dirStore.loadDirectories({ sortBy: 'display_order', order: 'ASC' })
  } catch (error) {
    console.error('加载目录列表失败:', error)
  }

  try {
    appVersion.value = await window.electronAPI.getAppVersion()
  } catch (error) {
    console.error('获取应用版本号失败:', error)
  }
})

// 添加目录
const handleAddDir = async () => {
  if (!newDirPath.value.trim()) {
    alert(t('message.directoryRequired'))
    return
  }

  try {
    // 验证路径
    const validation = await dirStore.validatePath(newDirPath.value.trim())
    if (!validation.valid) {
      alert(validation.error || t('message.directoryInvalid'))
      return
    }

    // 检查是否已存在
    const existing = dirStore.directories.find(d => d.path === newDirPath.value.trim())
    if (existing) {
      alert(t('message.directoryExists'))
      return
    }

    // 检查数量限制
    if (dirStore.directories.length >= 20) {
      alert(t('message.directoryMaxReached'))
      return
    }

    await dirStore.addDirectory(newDirPath.value.trim())
    newDirPath.value = ''
    showAddDirDialog.value = false
    alert(t('message.directoryAdded'))
  } catch (error: any) {
    alert(error.message || t('message.directoryAddError'))
  }
}

// 编辑目录
const editDir = (dir: { id: number; path: string; display_order: number; enabled: boolean }) => {
  editingDir.value = { ...dir }
  newDirPath.value = dir.path
  showAddDirDialog.value = true
}

// 保存编辑
const handleSaveEdit = async () => {
  if (!editingDir.value || !newDirPath.value.trim()) {
    alert(t('message.directoryRequired'))
    return
  }

  try {
    const validation = await dirStore.validatePath(newDirPath.value.trim())
    if (!validation.valid) {
      alert(validation.error || t('message.directoryInvalid'))
      return
    }

    // 检查是否与其他目录重复
    const existing = dirStore.directories.find(
      d => d.path === newDirPath.value.trim() && d.id !== editingDir.value!.id
    )
    if (existing) {
      alert(t('message.directoryExists'))
      return
    }

    await dirStore.updateDirectory(editingDir.value.id, {
      path: newDirPath.value.trim()
    })
    newDirPath.value = ''
    editingDir.value = null
    showAddDirDialog.value = false
    alert(t('message.directoryEditSuccess'))
  } catch (error: any) {
    alert(error.message || t('message.directoryEditError'))
  }
}

// 删除目录
const deleteDir = async (dir: { id: number; path: string }) => {
  if (!confirm(t('settings.deleteDirectoryConfirm', { path: dir.path }))) {
    return
  }

  const removeFiles = confirm(t('settings.deleteDirectoryFilesConfirm'))
  try {
    await dirStore.deleteDirectory(dir.id, { removeScannedFiles: removeFiles })
    alert(t('message.directoryDeleteSuccess'))
  } catch (error: any) {
    alert(error.message || t('message.directoryDeleteError'))
  }
}

// 切换启用/禁用
const toggleDirEnabled = async (dir: { id: number; enabled: boolean }) => {
  try {
    await dirStore.updateDirectory(dir.id, { enabled: !dir.enabled })
  } catch (error: any) {
    alert(error.message || '更新目录状态失败')
  }
}

// 关闭对话框
const closeDialog = () => {
  showAddDirDialog.value = false
  editingDir.value = null
  newDirPath.value = ''
}

const clearCache = async () => {
  if (!confirm(t('settings.clearCacheConfirm'))) return

  isClearing.value = true
  try {
    await window.electronAPI.clearCache()
    alert(t('settings.clearCacheSuccess'))
  } catch (error) {
    console.error('清除缓存失败:', error)
    alert(t('settings.clearCacheError'))
  } finally {
    isClearing.value = false
  }
}

const clearSearchHistory = async () => {
  if (!confirm(t('settings.clearSearchHistoryConfirm'))) return
  try {
    await window.electronAPI.clearSearchHistory()
    alert(t('settings.clearSearchHistorySuccess'))
  } catch (error) {
    console.error('清除搜索历史失败:', error)
    alert(t('settings.clearError'))
  }
}

const clearPlayHistory = async () => {
  if (!confirm(t('settings.clearPlayHistoryConfirm'))) return
  try {
    await window.electronAPI.clearPlayHistory()
    alert(t('settings.clearPlayHistorySuccess'))
  } catch (error) {
    console.error('清除播放历史失败:', error)
    alert(t('settings.clearError'))
  }
}

const rescanLibrary = async () => {
  if (isRescanning.value) return
  if (!confirm(t('settings.rescanAllConfirm'))) return

  isRescanning.value = true
  try {
    const enabledDirs = await dirStore.getEnabledDirectories()
    if (enabledDirs.length === 0) {
      alert(t('settings.noEnabledDirectories'))
      return
    }

    // 使用新的扫描所有目录方法
    await window.electronAPI.scanAllDirectories({
      concurrency: 10,
      fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
      excludePaths: [],
      forceRescan: false
    })
    alert(t('message.scanCompleted'))
  } catch (error: any) {
    console.error('扫描失败:', error)
    alert(error.message || t('message.scanError'))
  } finally {
    isRescanning.value = false
  }
}

const checkUpdate = () => {
  alert(t('settings.alreadyLatestVersion'))
}

const handleLanguageChange = (lang: 'zh' | 'en') => {
  settingsStore.setLanguage(lang)
}

const handleThemeChange = async (e: Event) => {
  const theme = (e.target as HTMLSelectElement).value as any
  settingsStore.setTheme(theme)
  // 同步窗口外观,确保红绿灯颜色正确
  await window.electronAPI.setWindowTheme(theme)
}

// 选择目录路径
const selectDirPath = async () => {
  try {
    const paths = await window.electronAPI.selectMusicFolder()
    if (paths && paths.length > 0) {
      newDirPath.value = paths[0]
    }
  } catch (error) {
    console.error('选择目录失败:', error)
  }
}
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl);
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.settings-section {
  margin-bottom: var(--spacing-2xl);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-xs);
  border-bottom: 1px solid var(--border-color);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) 0;
}

.setting-info {
  flex: 1;
  padding-right: var(--spacing-xl);
}

.setting-label {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.setting-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

/* Select Style */
select {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  outline: none;
  cursor: pointer;
}

/* Switch Style */
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
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
}

input:checked + .slider {
  background-color: var(--color-primary);
}

input:focus + .slider {
  box-shadow: 0 0 1px var(--color-primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.switch-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* Button Style */
.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-secondary:hover {
  background: var(--hover-bg);
}

/* About Card */
.about-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid var(--border-color);
}

.app-logo {
  font-size: 4rem;
  margin-bottom: var(--spacing-md);
}

.app-name {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
}

.app-version {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
}

.app-desc {
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
}

.app-links {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
}

.link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: var(--font-size-sm);
}

.link:hover {
  text-decoration: underline;
}

.divider {
  color: var(--border-color);
}

/* 目录管理样式 */
.dir-loading,
.dir-empty {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.dir-list {
  margin-top: var(--spacing-md);
}

.dir-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  border: 1px solid var(--border-color);
  transition: all var(--transition-base);
}

.dir-item:hover {
  border-color: var(--color-primary);
  background: var(--hover-bg);
}

.dir-item.disabled {
  opacity: 0.6;
}

.dir-content {
  flex: 1;
  min-width: 0;
}

.dir-path {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
  word-break: break-all;
}

.dir-meta {
  display: flex;
  gap: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.dir-status.enabled {
  color: var(--color-success);
}

.dir-status.disabled {
  color: var(--text-secondary);
}

.dir-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-left: var(--spacing-md);
}

.btn-icon {
  padding: var(--spacing-xs);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  color: var(--text-color);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: var(--hover-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-icon.danger:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.btn-primary {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-base);
  background: var(--color-primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.dialog-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: var(--spacing-lg);
}

.dialog-body {
  margin-bottom: var(--spacing-lg);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.form-input-group {
  display: flex;
  gap: var(--spacing-sm);
}

.form-input {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  outline: none;
}

.form-input:focus {
  border-color: var(--color-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
}
</style>
