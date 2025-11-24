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
      <router-view v-slot="{ Component }">
        <keep-alive include="MiniPlayer">
          <transition name="fade" mode="out-in">
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

const route = useRoute()
const theme = ref('light')
const showQueue = ref(false)
const playerStore = usePlayerStore()
const player = usePlayer()

const isBlankLayout = computed(() => route.meta.layout === 'blank')

const toggleQueue = () => {
  showQueue.value = !showQueue.value
}

onMounted(async () => {
  // 加载设置
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'

  // 同步窗口外观,确保红绿灯颜色正确
  try {
    const validTheme = (theme.value === 'light' || theme.value === 'dark' || theme.value === 'system')
      ? theme.value as 'light' | 'dark' | 'system'
      : 'light'
    await window.electronAPI.setWindowTheme(validTheme)
  } catch (error) {
    console.error('同步窗口外观失败:', error)
  }

  // 监听主题变化
  window.addEventListener('theme-changed', ((e: CustomEvent) => {
    theme.value = e.detail
  }) as EventListener)

  // 初始化播放器（会恢复上次的播放状态：队列、当前音乐、播放位置）
  await playerStore.initialize(settings)

  // 注意：不自动播放，只恢复状态
  // 用户可以通过点击播放按钮手动继续播放

  // 监听快捷键
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
})

// 处理快捷键
function handleShortcutAction(action: string) {
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
    case 'volume-up':
      playerStore.volume = Math.min(100, playerStore.volume + 5)
      player.setVolume(playerStore.volume)
      break
    case 'volume-down':
      playerStore.volume = Math.max(0, playerStore.volume - 5)
      player.setVolume(playerStore.volume)
      break
    case 'toggle-favorite':
      if (playerStore.currentMusic) {
        window.electronAPI.toggleFavorite(playerStore.currentMusic.filePath)
      }
      break
  }
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
