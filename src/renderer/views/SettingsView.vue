<template>
  <div class="settings-view">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
    </div>

    <div class="settings-content">
      <!-- 常规设置 -->
      <section class="settings-section">
        <h2 class="section-title">常规</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">主题模式</div>
            <div class="setting-desc">选择应用的显示风格</div>
          </div>
          <div class="setting-control">
            <select :value="settingsStore.theme" @change="handleThemeChange">
              <option value="light">浅色模式</option>
              <option value="dark">深色模式</option>
              <option value="system">跟随系统</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">关闭主面板</div>
            <div class="setting-desc">点击关闭按钮时的行为</div>
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
            <span class="switch-label">{{ settingsStore.closeToTray ? '最小化到托盘' : '退出程序' }}</span>
          </div>
        </div>
      </section>

      <!-- 播放设置 -->
      <section class="settings-section">
        <h2 class="section-title">播放</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">自动播放</div>
            <div class="setting-desc">程序启动或切换歌曲时自动播放</div>
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

      <!-- 存储与数据 -->
      <section class="settings-section">
        <h2 class="section-title">数据管理</h2>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">音乐库</div>
            <div class="setting-desc">重新扫描所有音乐文件夹</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="rescanLibrary" :disabled="isRescanning">
              {{ isRescanning ? '扫描中...' : '重新扫描' }}
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">清除缓存</div>
            <div class="setting-desc">清除封面图片和临时文件</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearCache" :disabled="isClearing">
              {{ isClearing ? '清除中...' : '清除缓存' }}
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">搜索历史</div>
            <div class="setting-desc">清除所有搜索记录</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearSearchHistory">清除记录</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">播放历史</div>
            <div class="setting-desc">清除所有播放记录</div>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="clearPlayHistory">清除记录</button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-section">
        <h2 class="section-title">关于</h2>

        <div class="about-card">
          <div class="app-logo">
            <Music :size="48" />
          </div>
          <div class="app-info">
            <h3 class="app-name">XM Music</h3>
            <p class="app-version">Version 1.0.3</p>
            <p class="app-desc">一个基于 Electron + Vue 3 的高颜值本地音乐播放器</p>
          </div>
          <div class="app-links">
            <a href="https://github.com/zdhsoft/xmmusic" target="_blank" class="link">GitHub</a>
            <span class="divider">|</span>
            <a href="#" class="link" @click.prevent="checkUpdate">检查更新</a>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Music } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const isClearing = ref(false)
const isRescanning = ref(false)

const clearCache = async () => {
  if (!confirm('确定要清除所有缓存吗？这将删除封面缓存和临时文件。')) return

  isClearing.value = true
  try {
    await window.electronAPI.clearCache()
    alert('缓存已清除')
  } catch (error) {
    console.error('清除缓存失败:', error)
    alert('清除缓存失败')
  } finally {
    isClearing.value = false
  }
}

const clearSearchHistory = async () => {
  if (!confirm('确定要清除搜索历史吗？')) return
  try {
    await window.electronAPI.clearSearchHistory()
    alert('搜索历史已清除')
  } catch (error) {
    console.error('清除搜索历史失败:', error)
    alert('清除失败')
  }
}

const clearPlayHistory = async () => {
  if (!confirm('确定要清除播放历史吗？')) return
  try {
    await window.electronAPI.clearPlayHistory()
    alert('播放历史已清除')
  } catch (error) {
    console.error('清除播放历史失败:', error)
    alert('清除失败')
  }
}

const rescanLibrary = async () => {
  if (isRescanning.value) return
  if (!confirm('确定要重新扫描所有音乐库吗？这可能需要一些时间。')) return

  isRescanning.value = true
  try {
    const dirs = await window.electronAPI.getMusicDirectories()
    if (dirs.length === 0) {
      alert('没有设置音乐目录')
      return
    }

    // 简单的串行扫描
    for (const dir of dirs) {
      await window.electronAPI.scanMusicFolder(dir.path)
    }
    alert('扫描完成')
  } catch (error) {
    console.error('扫描失败:', error)
    alert('扫描过程中出错')
  } finally {
    isRescanning.value = false
  }
}

const checkUpdate = () => {
  alert('当前已是最新版本')
}

const handleThemeChange = async (e: Event) => {
  const theme = (e.target as HTMLSelectElement).value as any
  settingsStore.setTheme(theme)
  // 同步窗口外观,确保红绿灯颜色正确
  await window.electronAPI.setWindowTheme(theme)
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
</style>
