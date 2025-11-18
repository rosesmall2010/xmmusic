<template>
  <div id="app" :class="theme">
    <Header />
    <div class="main-container">
      <Sidebar />
      <MainContent />
    </div>
    <LyricsView />
    <Footer />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Header from '@/components/Header.vue'
import Sidebar from '@/components/Sidebar.vue'
import MainContent from '@/components/MainContent.vue'
import Footer from '@/components/Footer.vue'
import LyricsView from '@/components/LyricsView.vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import { useMusicStore } from '@/stores/music'
import { useScanStore } from '@/stores/scan'

const theme = ref('light')
const playerStore = usePlayerStore()
const musicStore = useMusicStore()
const scanStore = useScanStore()
const player = usePlayer()

// 全局扫描进度监听（统一管理，避免重复监听）
let globalProgressUpdateTimer: number | null = null

// 处理快捷键消息
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
      player.previous()
      break
    case 'next':
      player.next()
      break
    case 'volume-up':
      playerStore.setVolume(Math.min(100, playerStore.volume + 5))
      player.setVolume(playerStore.volume)
      break
    case 'volume-down':
      playerStore.setVolume(Math.max(0, playerStore.volume - 5))
      player.setVolume(playerStore.volume)
      break
    case 'toggle-favorite':
      if (playerStore.currentMusic) {
        window.electronAPI.toggleFavorite(playerStore.currentMusic.filePath)
      }
      break
  }
}

onMounted(async () => {
  const settings = await window.electronAPI.getSettings()
  theme.value = settings?.theme || 'light'
  // 应用主题到 #app 元素
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.className = theme.value
  }

  // 监听主题变化事件（从 Header 或其他组件触发）
  window.addEventListener('theme-changed', ((e: CustomEvent) => {
    theme.value = e.detail
  }) as EventListener)

  // 加载扫描状态（全局统一管理）
  try {
    const state = await window.electronAPI.getScanState()
    scanStore.setScanning(state.isScanning)
    scanStore.setPaused(state.isPaused)
    scanStore.setProgress(state.progress)
  } catch (error) {
    console.error('加载扫描状态失败:', error)
  }

  // 全局监听扫描进度（统一管理，使用节流）
  window.electronAPI.onScanProgress((progress) => {
    // 使用 requestAnimationFrame 延迟更新，避免阻塞UI
    if (globalProgressUpdateTimer) {
      cancelAnimationFrame(globalProgressUpdateTimer)
    }
    globalProgressUpdateTimer = requestAnimationFrame(() => {
      scanStore.setProgress(progress)
      globalProgressUpdateTimer = null
    })
  })

  // 全局监听扫描状态变化
  window.electronAPI.onScanStateChanged((state) => {
    // 使用 nextTick 避免阻塞
    nextTick(() => {
      scanStore.setScanning(state.isScanning)
      scanStore.setPaused(state.isPaused)
    })
  })

  await playerStore.initialize(settings)

  if (playerStore.shouldAutoResume && playerStore.currentMusic) {
    await player.play(playerStore.currentMusic)
    if (playerStore.resumePosition > 0) {
      player.seek(playerStore.resumePosition)
    }
  }

  // 监听快捷键消息
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
      player.previous()
      break
    case 'next':
      player.next()
      break
  }
}

onBeforeUnmount(() => {
  window.electronAPI.removeShortcutAction()
  window.electronAPI.removeTrayAction()
  window.electronAPI.removeScanProgress()
  window.electronAPI.removeScanStateChanged()
  if (globalProgressUpdateTimer) {
    cancelAnimationFrame(globalProgressUpdateTimer)
  }
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  transition: background-color 0.3s, color 0.3s;
}

/* 浅色主题 CSS 变量 */
#app.light {
  --bg-color: #ffffff;
  --sidebar-bg: #f8f9fa;
  --hover-bg: #e9ecef;
  --active-bg: #dee2e6;
  --text-color: #1f1f1f;
  --secondary-text-color: #666666;
  --border-color: #e0e0e0;
  --sidebar-border: #dee2e6;
  --active-text: #ff4757;
  background-color: #f5f5f5;
  color: #333;
}

/* 深色主题 CSS 变量 */
#app.dark {
  --bg-color: #2d2d2d;
  --sidebar-bg: #1e1e1e;
  --hover-bg: #3d3d3d;
  --active-bg: #4d4d4d;
  --text-color: #f5f5f5;
  --secondary-text-color: #bbbbbb;
  --border-color: #444444;
  --sidebar-border: #333333;
  --active-text: #ff6b7a;
  background-color: #1a1a1a;
  color: #fff;
}

.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
