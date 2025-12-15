import { globalShortcut, app, BrowserWindow } from 'electron'
import type { ShortcutConfig } from '../../shared/types/settings'

export default class ShortcutManager {
  private mainWindow: BrowserWindow | null = null
  private shortcuts: Map<string, string> = new Map()
  private defaultShortcuts: Record<string, string> = {
    'play-pause': 'MediaPlayPause',
    'previous': 'MediaPreviousTrack',
    'next': 'MediaNextTrack',
    'volume-up': 'CommandOrControl+Up',
    'volume-down': 'CommandOrControl+Down',
    'toggle-window': 'CommandOrControl+M',
    'toggle-favorite': 'CommandOrControl+F'
  }

  // macOS 特定的默认快捷键（避免与系统快捷键冲突）
  private macDefaultShortcuts: Record<string, string> = {
    'play-pause': 'MediaPlayPause',
    'previous': 'MediaPreviousTrack',
    'next': 'MediaNextTrack',
    'volume-up': 'CommandOrControl+Shift+Up',
    'volume-down': 'CommandOrControl+Shift+Down',
    'toggle-window': 'CommandOrControl+Option+M',
    'toggle-favorite': 'CommandOrControl+Shift+F'
  }

  // Windows/Linux 特定的默认快捷键
  private winDefaultShortcuts: Record<string, string> = {
    'play-pause': 'MediaPlayPause',
    'previous': 'MediaPreviousTrack',
    'next': 'MediaNextTrack',
    'volume-up': 'Ctrl+Shift+Up',
    'volume-down': 'Ctrl+Shift+Down',
    'toggle-window': 'Ctrl+Alt+M',
    'toggle-favorite': 'Ctrl+Shift+F'
  }

  constructor() {
    // 根据操作系统选择默认快捷键
    if (process.platform === 'darwin') {
      Object.assign(this.defaultShortcuts, this.macDefaultShortcuts)
    } else {
      Object.assign(this.defaultShortcuts, this.winDefaultShortcuts)
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 注册所有快捷键
   */
  registerAll(shortcuts: Record<string, string>, handlers: Record<string, () => void>): void {
    // 先注销所有已注册的快捷键
    this.unregisterAll()

    console.log(`📋 开始注册快捷键，共 ${Object.keys(shortcuts).length} 个`)

    // 注册新的快捷键
    for (const [action, accelerator] of Object.entries(shortcuts)) {
      if (accelerator && accelerator !== '') {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            console.log(`⌨️  [快捷键触发] ${action} (${accelerator}) - ${new Date().toLocaleTimeString()}`)
            const handler = handlers[action]
            if (handler) {
              handler()
              console.log(`✅ [快捷键处理完成] ${action}`)
            } else {
              console.warn(`⚠️ [快捷键处理失败] ${action} - 未找到对应的处理器`)
            }
          })

          if (registered) {
            this.shortcuts.set(action, accelerator)
            console.log(`✅ 快捷键注册成功: ${action} -> ${accelerator}`)
          } else {
            console.warn(`⚠️ 快捷键注册失败（可能冲突）: ${action} -> ${accelerator}`)
          }
        } catch (error) {
          console.error(`❌ 快捷键注册错误: ${action} -> ${accelerator}`, error)
        }
      } else {
        console.log(`⏭️  跳过空快捷键: ${action}`)
      }
    }

    console.log(`📋 快捷键注册完成，已注册 ${this.shortcuts.size} 个快捷键`)
    console.log(`📋 已注册的快捷键列表:`, Array.from(this.shortcuts.entries()).map(([a, k]) => `${a}: ${k}`).join(', '))
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    const count = this.shortcuts.size
    console.log(`🗑️  [注销所有快捷键] 共 ${count} 个`)
    globalShortcut.unregisterAll()
    this.shortcuts.clear()
    console.log(`✅ [注销完成]`)
  }

  /**
   * 注册单个快捷键
   */
  register(action: string, accelerator: string, handler: () => void): boolean {
    // 先注销旧的快捷键（如果存在）
    const oldAccelerator = this.shortcuts.get(action)
    if (oldAccelerator) {
      console.log(`🔄 [快捷键更新] ${action}: ${oldAccelerator} -> ${accelerator}`)
      globalShortcut.unregister(oldAccelerator)
    }

    if (!accelerator || accelerator === '') {
      console.log(`⏭️  [跳过空快捷键] ${action}`)
      return true
    }

    try {
      const wrappedHandler = () => {
        console.log(`⌨️  [快捷键触发] ${action} (${accelerator}) - ${new Date().toLocaleTimeString()}`)
        handler()
        console.log(`✅ [快捷键处理完成] ${action}`)
      }

      const registered = globalShortcut.register(accelerator, wrappedHandler)
      if (registered) {
        this.shortcuts.set(action, accelerator)
        console.log(`✅ [快捷键注册成功] ${action} -> ${accelerator}`)
        return true
      } else {
        console.warn(`⚠️ [快捷键注册失败] ${action} -> ${accelerator} (可能冲突)`)
        // 如果注册失败，尝试恢复旧的快捷键
        if (oldAccelerator) {
          globalShortcut.register(oldAccelerator, handler)
        }
        return false
      }
    } catch (error) {
      console.error(`❌ [快捷键注册错误] ${action} -> ${accelerator}`, error)
      return false
    }
  }

  /**
   * 注销单个快捷键
   */
  unregister(action: string): void {
    const accelerator = this.shortcuts.get(action)
    if (accelerator) {
      console.log(`🗑️  [注销快捷键] ${action} (${accelerator})`)
      globalShortcut.unregister(accelerator)
      this.shortcuts.delete(action)
      console.log(`✅ [注销完成] ${action}`)
    } else {
      console.log(`ℹ️  [注销快捷键] ${action} - 未找到，可能未注册`)
    }
  }

  /**
   * 检查快捷键是否可用（不冲突）
   */
  isAvailable(accelerator: string): boolean {
    if (!accelerator || accelerator === '') {
      return true
    }

    try {
      // 尝试临时注册来检测是否冲突
      const testRegistered = globalShortcut.register(accelerator, () => {})
      if (testRegistered) {
        globalShortcut.unregister(accelerator)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * 获取默认快捷键配置
   */
  getDefaultShortcuts(): Record<string, string> {
    return { ...this.defaultShortcuts }
  }

  /**
   * 格式化快捷键显示名称
   */
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

  /**
   * 解析快捷键字符串为 Electron accelerator 格式
   */
  parseAccelerator(input: string): string {
    // 移除空格
    let accelerator = input.replace(/\s+/g, '')

    // macOS 特殊处理
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

    // 统一使用 CommandOrControl（跨平台）
    accelerator = accelerator.replace(/Command|Control/g, 'CommandOrControl')

    return accelerator
  }
}
