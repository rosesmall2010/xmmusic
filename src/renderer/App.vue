<template>
  <div id="app" :class="theme">
    <template v-if="!isBlankLayout">
      <AppHeader />
      <div class="app-body">
        <AppSidebar />
        <main class="app-content">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </main>
      </div>
      <PlayerBar @toggle-queue="toggleQueue" />
    </template>

    <template v-else>
      <router-view v-slot="{ Component, route }">
        <keep-alive include="MiniPlayer">
          <transition
            :name="getTransitionName(route)"
            mode="out-in"
            :duration="getTransitionDuration(route)"
          >
            <component :is="Component" />
          </transition>
        </keep-alive>
      </router-view>
    </template>

    <PlayQueueDrawer v-model:visible="showQueue" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import PlayerBar from '@/components/layout/PlayerBar.vue'
import PlayQueueDrawer from '@/components/layout/PlayQueueDrawer.vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const settingsStore = useSettingsStore()
const theme = computed(() => {
  const currentTheme = settingsStore.theme
  // 如果是 system 模式，需要根据系统主题返回实际的主题
  if (currentTheme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return currentTheme
})
const showQueue = ref(false)
const playerStore = usePlayerStore()
const player = usePlayer()

const isBlankLayout = computed(() => route.meta.layout === 'blank')

const toggleQueue = () => {
  showQueue.value = !showQueue.value
}

// 根据路由决定过渡动画名称和时长
const getTransitionName = (currentRoute: any) => {
  const currentName = currentRoute.name

  // 切换到 mini 窗口时，禁用过渡动画，避免变灰白
  if (currentName === 'MiniPlayer') {
    return 'instant'
  }

  return 'fade'
}

const getTransitionDuration = (currentRoute: any) => {
  const currentName = currentRoute.name

  // 切换到 mini 窗口时，禁用过渡动画
  if (currentName === 'MiniPlayer') {
    return { enter: 0, leave: 0 }
  }

  return undefined
}

onMounted(async () => {
  // 加载设置
  const settings = await window.electronAPI.getSettings()
  
  // 同步窗口外观,确保红绿灯颜色正确
  try {
    const validTheme = (settingsStore.theme === 'light' || settingsStore.theme === 'dark' || settingsStore.theme === 'system')
      ? settingsStore.theme as 'light' | 'dark' | 'system'
      : 'light'
    await window.electronAPI.setWindowTheme(validTheme)
  } catch (error) {
    console.error('同步窗口外观失败:', error)
  }

  // 监听主题变化（从 settingsStore）
  watch(() => settingsStore.theme, async (newTheme) => {
    // 同步窗口外观
    try {
      await window.electronAPI.setWindowTheme(newTheme)
    } catch (error) {
      console.error('同步窗口外观失败:', error)
    }
  })

  // 初始化播放器（会恢复上次的播放状态：队列、当前音乐、播放位置）
  await playerStore.initialize(settings)

  // 注意：不自动播放，只恢复状态
  // 用户可以通过点击播放按钮手动继续播放

  // 监听快捷键
  console.log('🎧 [渲染进程] 注册快捷键监听器')
  window.electronAPI.onShortcutAction(handleShortcutAction)

  // 监听托盘操作
  window.electronAPI.onTrayAction(handleTrayAction)

  // 监听播放状态变化，更新托盘
  watch(() => playerStore.isPlaying, (isPlaying) => {
    window.electronAPI.updateTrayPlayState(isPlaying)
  })

  // 监听当前音乐变化，更新托盘
  watch(() => playerStore.currentMusic, (music) => {
    if (music) {
      window.electronAPI.updateTrayCurrentMusic({
        title: music.title,
        artist: music.artist
      })
    } else {
      window.electronAPI.updateTrayCurrentMusic(null)
    }
  })

  // 加载快捷键配置
  try {
    await window.electronAPI.loadShortcuts()
  } catch (error) {
    console.error('加载快捷键失败:', error)
  }

  // 监听全局队列切换事件（来自NowPlayingView等组件）
  window.addEventListener('toggle-queue', toggleQueue)
})

// 处理快捷键
function handleShortcutAction(action: string) {
  console.log(`🎯 [渲染进程] 收到快捷键动作: ${action} - ${new Date().toLocaleTimeString()}`)

  switch (action) {
    case 'play-pause':
      console.log(`▶️ [播放控制] 当前状态: ${playerStore.isPlaying ? '播放中' : '暂停'}`)
      if (playerStore.isPlaying) {
        player.pause()
        console.log(`✅ [播放控制] 已暂停`)
      } else {
        if (playerStore.currentMusic) {
          player.resume()
          console.log(`✅ [播放控制] 已恢复播放`)
        } else if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
          player.play(playerStore.queue[playerStore.currentQueueIndex])
          console.log(`✅ [播放控制] 开始播放队列中的歌曲`)
        } else {
          console.warn(`⚠️ [播放控制] 没有可播放的音乐`)
        }
      }
      break
    case 'previous':
      console.log(`⏮️ [上一首] 执行中...`)
      handlePrevious()
      console.log(`✅ [上一首] 完成`)
      break
    case 'next':
      console.log(`⏭️ [下一首] 执行中...`)
      handleNext()
      console.log(`✅ [下一首] 完成`)
      break
    case 'toggle-favorite':
      if (playerStore.currentMusic) {
        console.log(`❤️ [收藏] 切换收藏状态: ${playerStore.currentMusic.title}`)
        window.electronAPI.toggleFavorite(playerStore.currentMusic.id).then(() => {
          window.dispatchEvent(new Event('favorites-updated'))
          console.log(`✅ [收藏] 收藏状态已更新`)
        })
      } else {
        console.warn(`⚠️ [收藏] 没有当前播放的音乐`)
      }
      break
    default:
      console.warn(`⚠️ [渲染进程] 未知的快捷键动作: ${action}`)
  }

  console.log(`✅ [渲染进程] 快捷键动作处理完成: ${action}`)
}

// 处理托盘操作
function handleTrayAction(action: string) {
  switch (action) {
    case 'play-pause':
      if (playerStore.isPlaying) {
        player.pause()
      } else {
        if (playerStore.currentMusic) {
          player.resume()
        } else if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
          player.play(playerStore.queue[playerStore.currentQueueIndex])
        }
      }
      break
    case 'previous':
      handlePrevious()
      break
    case 'next':
      handleNext()
      break
  }
}

async function handlePrevious() {
  const prev = playerStore.getPrevious()
  if (prev) {
    const index = playerStore.queue.findIndex(m => m.id === prev.id)
    if (index >= 0) {
      playerStore.setCurrentQueueIndex(index)
      await player.play(prev)
    }
  }
}

async function handleNext() {
  const next = playerStore.getNext()
  if (next) {
    const index = playerStore.queue.findIndex(m => m.id === next.id)
    if (index >= 0) {
      playerStore.setCurrentQueueIndex(index)
      await player.play(next)
    }
  }
}

onBeforeUnmount(() => {
  window.electronAPI.removeShortcutAction()
  window.electronAPI.removeTrayAction()
  window.removeEventListener('toggle-queue', toggleQueue)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--font-family-base);
  transition: background-color var(--transition-slow), color var(--transition-slow);
  background-color: var(--bg-color);
  color: var(--text-color);
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 页面过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base) var(--transition-timing);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 无动画过渡（用于正在播放到 mini 窗口的切换） */
.instant-enter-active,
.instant-leave-active {
  transition: none;
}

.instant-enter-from,
.instant-leave-to {
  opacity: 1;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--radius-base);
  transition: background var(--transition-base) var(--transition-timing);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* 选中文本样式 */
::selection {
  background-color: rgba(var(--color-primary-rgb), 0.2);
  color: var(--text-color);
}
</style>
