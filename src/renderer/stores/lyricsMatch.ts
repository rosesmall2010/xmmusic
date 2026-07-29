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
  /** 每次开始/结束递增，用于丢弃过期的 syncFromMain 结果 */
  let syncEpoch = 0

  function ensureListeners() {
    if (listenersBound) return
    listenersBound = true
    window.electronAPI.onLyricsMatchProgress((p) => {
      isMatching.value = true
      progress.value = p
    })
    window.electronAPI.onLyricsMatchFinished((summary) => {
      lastSummary.value = summary
      syncEpoch++
      // 若有由本 store 发起的 runningPromise，收尾交给它的 finally；
      // 否则（例如页面重建后）这里直接复位 UI 状态
      if (!runningPromise) {
        isMatching.value = false
        progress.value = null
      }
    })
  }

  /**
   * 从主进程同步状态（本地音乐页挂载时调用）
   * 用 epoch + 二次确认避免「查询时进行中、写回时已结束」把 isMatching 卡死在 true
   */
  async function syncFromMain() {
    ensureListeners()
    const epochAtStart = syncEpoch
    try {
      const state = await window.electronAPI.getLyricsMatchState()
      // 查询期间若已收到 finished / 本地 task 收尾，丢弃过期结果
      if (epochAtStart !== syncEpoch) return

      if (state.isRunning) {
        // 再确认一次：防止取样在进行中、响应回来时已结束
        const again = await window.electronAPI.getLyricsMatchState()
        if (epochAtStart !== syncEpoch) return
        if (!again.isRunning) {
          isMatching.value = runningPromise != null
          progress.value = null
          return
        }
        isMatching.value = true
        progress.value = again.progress ?? state.progress
        return
      }

      // 主进程空闲；若本 store 仍有进行中的 Promise，保留 isMatching
      if (runningPromise == null) {
        isMatching.value = false
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
        syncEpoch++
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
