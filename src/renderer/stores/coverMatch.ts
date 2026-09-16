import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CoverMatchProgress, CoverMatchSummary } from '@shared/types/coverMatch'

/**
 * 批量匹配封面状态（跨路由持久，离开本地音乐页再回来仍能看到进度）
 */
export const useCoverMatchStore = defineStore('coverMatch', () => {
  const isMatching = ref(false)
  const progress = ref<CoverMatchProgress | null>(null)
  const lastSummary = ref<CoverMatchSummary | null>(null)

  let listenersBound = false
  let runningPromise: Promise<CoverMatchSummary> | null = null
  /** 状态版本号：IPC 异步返回或 finished 事件时递增，避免过期结果覆盖新状态 */
  let syncEpoch = 0

  function ensureListeners() {
    if (listenersBound) return
    listenersBound = true
    window.electronAPI.onCoverMatchProgress((p) => {
      isMatching.value = true
      progress.value = p
    })
    window.electronAPI.onCoverMatchFinished((summary) => {
      lastSummary.value = summary
      syncEpoch++
      if (!runningPromise) {
        isMatching.value = false
        progress.value = null
      }
    })
  }

  /**
   * 从主进程同步批量匹配状态（离开本地音乐页再回来时调用）
   * - syncEpoch：await 期间若收到 progress/finished 或本地 start/finish，则丢弃本次结果
   * - 二次 getCoverMatchState：枚举阶段 isRunning 为 true 但 progress 可能仍为空，稍等再取一次
   */
  async function syncFromMain() {
    ensureListeners()
    const epochAtStart = syncEpoch
    try {
      const state = await window.electronAPI.getCoverMatchState()
      if (epochAtStart !== syncEpoch) return

      if (state.isRunning) {
        const again = await window.electronAPI.getCoverMatchState()
        if (epochAtStart !== syncEpoch) return
        if (!again.isRunning) {
          // 主进程已结束但本地 batchMatch promise 仍在收尾
          isMatching.value = runningPromise != null
          progress.value = null
          return
        }
        isMatching.value = true
        progress.value = again.progress ?? state.progress
        return
      }

      if (runningPromise == null) {
        isMatching.value = false
        progress.value = null
      }
    } catch (e) {
      console.error('同步封面匹配状态失败:', e)
    }
  }

  async function startBatchMatch(): Promise<CoverMatchSummary> {
    ensureListeners()
    if (runningPromise) return runningPromise

    isMatching.value = true
    lastSummary.value = null

    runningPromise = window.electronAPI.batchMatchMissingCovers()
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
      await window.electronAPI.cancelCoverMatch()
    } catch {
      // ignore
    }
  }

  function setOptimisticProgress(p: CoverMatchProgress) {
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
