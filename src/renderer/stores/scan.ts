import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import type { ScanProgress } from '@shared/types/music'

export const useScanStore = defineStore('scan', () => {
  const isScanning = ref(false)
  const isPaused = ref(false)
  const progress = ref<ScanProgress | null>(null)

  // 节流相关
  let progressUpdateTimer: number | null = null
  let lastProgressUpdate = 0
  const PROGRESS_UPDATE_INTERVAL = 200 // 每200ms最多更新一次

  function setScanning(scanning: boolean) {
    isScanning.value = scanning
    if (!scanning) {
      isPaused.value = false
      progress.value = null
      if (progressUpdateTimer) {
        cancelAnimationFrame(progressUpdateTimer)
        progressUpdateTimer = null
      }
    }
  }

  function setPaused(paused: boolean) {
    isPaused.value = paused
  }

  function setProgress(prog: ScanProgress | null) {
    const now = Date.now()

    // 节流：限制更新频率
    if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) {
      // 如果更新太频繁，延迟更新（取消之前的延迟更新，使用最新的值）
      if (progressUpdateTimer) {
        cancelAnimationFrame(progressUpdateTimer)
      }
      progressUpdateTimer = requestAnimationFrame(() => {
        progress.value = prog
        lastProgressUpdate = Date.now()
        progressUpdateTimer = null
      })
      return
    }

    // 立即更新（因为已经过了节流间隔）
    lastProgressUpdate = now
    progress.value = prog
  }

  return {
    isScanning,
    isPaused,
    progress,
    setScanning,
    setPaused,
    setProgress
  }
})
