import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LyricsMatchProgress, LyricsMatchSummary } from '@shared/types/lyrics'

/**
 * 批量匹配歌词状态（跨路由持久，离开本地音乐页再回来仍能看到进度）
 */
export const useLyricsMatchStore = defineStore('lyricsMatch', () => {
  const isMatching = ref(false)
  const progress = ref<LyricsMatchProgress | null>(null)
  const lastSummary = ref<LyricsMatchSummary | null>(null)

  let listenersBound = false
  let runningPromise: Promise<LyricsMatchSummary> | null = null

  function ensureListeners() {
    if (listenersBound) return
    listenersBound = true
    window.electronAPI.onLyricsMatchProgress((p) => {
      isMatching.value = true
      progress.value = p
    })
    window.electronAPI.onLyricsMatchFinished((summary) => {
      lastSummary.value = summary
      // 若有由本 store 发起的 runningPromise，收尾交给它的 finally；
      // 否则（例如页面重建后）这里直接复位 UI 状态
      if (!runningPromise) {
        isMatching.value = false
        progress.value = null
      }
    })
  }

  /** 从主进程同步状态（本地音乐页挂载时调用） */
  async function syncFromMain() {
    ensureListeners()
    try {
      const state = await window.electronAPI.getLyricsMatchState()
      isMatching.value = state.isRunning
      progress.value = state.progress
      if (!state.isRunning && runningPromise == null) {
        progress.value = null
      }
    } catch (e) {
      console.error('同步歌词匹配状态失败:', e)
    }
  }

  /**
   * 启动批量匹配；同一时刻只跑一份任务。
   * 即使发起方组件已卸载，Promise 仍会在 store 内跑完。
   */
  async function startBatchMatch(): Promise<LyricsMatchSummary> {
    ensureListeners()
    if (runningPromise) return runningPromise

    isMatching.value = true
    lastSummary.value = null

    runningPromise = window.electronAPI.batchMatchMissingLyrics()
      .then((summary) => {
        lastSummary.value = summary
        return summary
      })
      .finally(() => {
        isMatching.value = false
        progress.value = null
        runningPromise = null
      })

    return runningPromise
  }

  async function cancel() {
    try {
      await window.electronAPI.cancelLyricsMatch()
    } catch {
      // ignore
    }
  }

  function setOptimisticProgress(p: LyricsMatchProgress) {
    isMatching.value = true
    progress.value = p
  }

  return {
    isMatching,
    progress,
    lastSummary,
    ensureListeners,
    syncFromMain,
    startBatchMatch,
    cancel,
    setOptimisticProgress
  }
})
