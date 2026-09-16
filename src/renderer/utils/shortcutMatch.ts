import { APP_SHORTCUT_ACTIONS } from '@shared/utils/shortcutActions'
import type { ShortcutConfig } from '@shared/types/settings'

export { APP_SHORTCUT_ACTIONS }
export type { AppShortcutAction } from '@shared/utils/shortcutActions'

/** v1.2.3 从 Media* 全局媒体键迁移到应用内快捷键，加载旧配置时自动映射 */
const LEGACY_SHORTCUT_MAP: Record<string, string> = {
  MediaPlayPause: 'Space',
  MediaPreviousTrack: 'CommandOrControl+Left',
  MediaNextTrack: 'CommandOrControl+Right'
}

const KEY_CODE_MAP: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space'
}

function normalizeEventKey(key: string, code: string): string {
  if (KEY_CODE_MAP[code]) return KEY_CODE_MAP[code]
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

function normalizeAcceleratorKey(key: string): string {
  if (key === 'Space') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** 输入框 / 可编辑区域聚焦时不触发字母键与 Space 播停 */
export function isEditableElementFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function shouldSkipShortcutInInput(accelerator: string): boolean {
  const parts = accelerator.split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  if (key === 'Space') return true
  if (key.length === 1 && /^[A-Za-z]$/.test(key)) return true
  return false
}

export function eventMatchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  if (!accelerator || event.type !== 'keydown') return false

  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return false

  const keyPart = normalizeAcceleratorKey(parts[parts.length - 1])
  const mods = parts.slice(0, -1)

  const needCmdOrCtrl = mods.some((m) => m === 'CommandOrControl' || m === 'Command' || m === 'Control')
  const needAlt = mods.some((m) => m === 'Alt' || m === 'Option')
  const needShift = mods.some((m) => m === 'Shift')
  const isMac = navigator.platform.toLowerCase().includes('mac')

  const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey
  if (needCmdOrCtrl !== cmdOrCtrl) return false
  if (needAlt !== event.altKey) return false
  if (needShift !== event.shiftKey) return false

  // 快捷键未声明某修饰键时，事件里多按了修饰键视为不匹配（避免 Ctrl+Left 误触发 Left）
  if (!needCmdOrCtrl && cmdOrCtrl) return false
  if (!needAlt && event.altKey) return false
  if (!needShift && event.shiftKey && keyPart !== 'Space') return false

  const eventKey = normalizeEventKey(event.key, event.code)
  return eventKey === keyPart
}

export function eventToAccelerator(event: KeyboardEvent): string | null {
  if (event.type !== 'keydown') return null
  const ignore = ['Control', 'Shift', 'Alt', 'Meta', 'Command']
  if (ignore.includes(event.key)) return null

  const parts: string[] = []
  const isMac = navigator.platform.toLowerCase().includes('mac')
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  const key = normalizeEventKey(event.key, event.code)
  parts.push(key)
  return parts.join('+')
}

export function formatAcceleratorDisplay(accelerator: string): string {
  if (!accelerator) return ''
  const isMac = navigator.platform.toLowerCase().includes('mac')
  return accelerator
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' + ')
}

/** 兼容历史快捷键配置并过滤未支持动作 */
export function normalizeShortcutConfig(
  input: ShortcutConfig,
  defaults: ShortcutConfig
): ShortcutConfig {
  const next: ShortcutConfig = {}
  for (const action of APP_SHORTCUT_ACTIONS) {
    const raw = (input[action] || '').trim()
    if (!raw) {
      next[action] = defaults[action] || ''
      continue
    }
    next[action] = LEGACY_SHORTCUT_MAP[raw] || raw
  }
  return next
}
