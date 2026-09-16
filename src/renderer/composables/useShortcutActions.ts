import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'

/** 播放控制快捷键动作（主窗 / 迷你共用） */
export function useShortcutActions() {
  const playerStore = usePlayerStore()
  const player = usePlayer()

  async function handlePrevious() {
    const prev = playerStore.getPrevious()
    if (prev) {
      if (prev.index >= 0) playerStore.setCurrentQueueIndex(prev.index)
      await player.play(prev.music)
    }
  }

  async function handleNext() {
    const next = playerStore.getNext()
    if (next) {
      if (next.index >= 0) playerStore.setCurrentQueueIndex(next.index)
      await player.play(next.music)
    }
  }

  function adjustVolume(delta: number) {
    const next = Math.max(0, Math.min(100, playerStore.volume + delta))
    playerStore.volume = next
    player.setVolume(next)
  }

  function handleShortcutAction(action: string) {
    switch (action) {
      case 'play-pause':
        // 播停 → 恢复当前曲 → 队列有项则播当前索引（冷启动无 currentMusic 时）
        if (playerStore.isPlaying) {
          player.pause()
        } else if (playerStore.currentMusic) {
          player.resume()
        } else if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
          player.play(playerStore.queue[playerStore.currentQueueIndex])
        }
        break
      case 'previous':
        void handlePrevious()
        break
      case 'next':
        void handleNext()
        break
      case 'volume-up':
        adjustVolume(5)
        break
      case 'volume-down':
        adjustVolume(-5)
        break
      case 'toggle-favorite':
        if (playerStore.currentMusic) {
          void window.electronAPI.toggleFavorite(playerStore.currentMusic.id).then(() => {
            window.dispatchEvent(new Event('favorites-updated'))
          })
        }
        break
      default:
        break
    }
  }

  return { handleShortcutAction, handlePrevious, handleNext, adjustVolume }
}
