import { globalShortcut, BrowserWindow } from 'electron'
import type { ShortcutConfig } from '../../shared/types/settings'

/**
 * 产品决策：仅应用内快捷键，禁止改为 true 除非产品变更。
 * 全局快捷键会抢占系统媒体键，影响其他 App。
 */
const ENABLE_GLOBAL_SHORTCUTS = false

/** 应用内默认快捷键（不以 Media* 为唯一绑定） */
const BASE_DEFAULT_SHORTCUTS: Record<string, string> = {
  'play-pause': 'Space',
  previous: 'CommandOrControl+Left',
  next: 'CommandOrControl+Right',
  'volume-up': 'CommandOrControl+Shift+Up',
  'volume-down': 'CommandOrControl+Shift+Down',
  'toggle-favorite': 'CommandOrControl+Shift+F'
}

export default class ShortcutManager {
  private mainWindow: BrowserWindow | null = null
  private shortcuts: Map<string, string> = new Map()
  private defaultShortcuts: Record<string, string> = { ...BASE_DEFAULT_SHORTCUTS }

  constructor() {
    // 默认表不含 toggle-window，避免死键
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 注册所有快捷键（全局模式；当前 ENABLE_GLOBAL_SHORTCUTS=false 时不注册）
   */
  registerAll(shortcuts: Record<string, string>, handlers: Record<string, () => void>): void {
    this.unregisterAll()

    if (!ENABLE_GLOBAL_SHORTCUTS) {
      return
    }

    for (const [action, accelerator] of Object.entries(shortcuts)) {
      if (accelerator && accelerator !== '') {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            const handler = handlers[action]
            if (handler) handler()
          })
          if (registered) {
            this.shortcuts.set(action, accelerator)
          }
        } catch (error) {
          console.error(`快捷键注册错误: ${action} -> ${accelerator}`, error)
        }
      }
    }
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.shortcuts.clear()
  }

  register(action: string, accelerator: string, handler: () => void): boolean {
    const oldAccelerator = this.shortcuts.get(action)
    if (oldAccelerator) {
      globalShortcut.unregister(oldAccelerator)
      this.shortcuts.delete(action)
    }

    if (!ENABLE_GLOBAL_SHORTCUTS) {
      return true
    }

    if (!accelerator || accelerator === '') {
      return true
    }

    try {
      const registered = globalShortcut.register(accelerator, handler)
      if (registered) {
        this.shortcuts.set(action, accelerator)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  unregister(action: string): void {
    const accelerator = this.shortcuts.get(action)
    if (accelerator) {
      globalShortcut.unregister(accelerator)
      this.shortcuts.delete(action)
    }
  }

  /** 应用内模式：不做 global 冲突检测，恒返回可用 */
  isAvailable(_accelerator: string): boolean {
    return true
  }

  getDefaultShortcuts(): Record<string, string> {
    return { ...this.defaultShortcuts }
  }

  formatAccelerator(accelerator: string): string {
    if (!accelerator) return ''

    return accelerator
      .replace(/CommandOrControl/g, process.platform === 'darwin' ? '⌘' : 'Ctrl')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Alt/g, process.platform === 'darwin' ? '⌥' : 'Alt')
      .replace(/Option/g, '⌥')
      .replace(/Shift/g, '⇧')
      .replace(/\+/g, ' + ')
  }

  parseAccelerator(input: string): string {
    let accelerator = input.replace(/\s+/g, '')

    if (process.platform === 'darwin') {
      accelerator = accelerator
        .replace(/⌘/g, 'Command')
        .replace(/⌥/g, 'Option')
        .replace(/⇧/g, 'Shift')
        .replace(/Ctrl/g, 'Command')
    } else {
      accelerator = accelerator
        .replace(/⌘/g, 'Control')
        .replace(/⌥/g, 'Alt')
        .replace(/⇧/g, 'Shift')
        .replace(/Command/g, 'Control')
    }

    accelerator = accelerator.replace(/Command|Control/g, 'CommandOrControl')
    return accelerator
  }
}
