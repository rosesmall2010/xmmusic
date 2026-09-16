import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { ShortcutConfig } from '@shared/types/settings'
import {
  APP_SHORTCUT_ACTIONS,
  eventMatchesAccelerator,
  isEditableElementFocused,
  normalizeShortcutConfig,
  shouldSkipShortcutInInput
} from '@/utils/shortcutMatch'

/**
 * 应用内快捷键：窗口聚焦时监听 keydown，不依赖 globalShortcut
 */
export function useAppShortcuts(onAction: (action: string) => void, enabled = true) {
  const shortcuts = ref<ShortcutConfig>({})
  const recordingShortcut = ref(false)
  const handleRecordingState = (e: Event) => {
    recordingShortcut.value = Boolean((e as CustomEvent<boolean>).detail)
  }

  const loadShortcuts = async () => {
    const defaults = await window.electronAPI.getDefaultShortcuts()
    try {
      const saved = await window.electronAPI.getShortcutConfig()
      if (saved && Object.keys(saved).length > 0) {
        shortcuts.value = normalizeShortcutConfig(saved, defaults)
        return
      }
    } catch {
      // ignore
    }
    try {
      shortcuts.value = normalizeShortcutConfig({}, defaults)
    } catch (e) {
      console.error('加载默认快捷键失败:', e)
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (recordingShortcut.value) return
    if (event.repeat) return

    for (const action of APP_SHORTCUT_ACTIONS) {
      const accelerator = shortcuts.value[action]
      if (!accelerator) continue
      if (!eventMatchesAccelerator(event, accelerator)) continue

      if (isEditableElementFocused() && shouldSkipShortcutInInput(accelerator)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onAction(action)
      return
    }
  }

  onMounted(async () => {
    if (!enabled) return
    await loadShortcuts()
    window.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('shortcuts-config-updated', loadShortcuts as EventListener)
    window.addEventListener('shortcut-recording-state', handleRecordingState as EventListener)
  })

  onBeforeUnmount(() => {
    if (!enabled) return
    window.removeEventListener('keydown', handleKeydown, true)
    window.removeEventListener('shortcuts-config-updated', loadShortcuts as EventListener)
    window.removeEventListener('shortcut-recording-state', handleRecordingState as EventListener)
  })

  return { shortcuts, loadShortcuts }
}

/** 设置页保存后通知全局热更新 */
export function notifyShortcutsUpdated() {
  window.dispatchEvent(new Event('shortcuts-config-updated'))
}

/** 设置页录制快捷键时通知应用层暂停响应 */
export function notifyShortcutRecordingState(recording: boolean) {
  window.dispatchEvent(new CustomEvent('shortcut-recording-state', { detail: recording }))
}
