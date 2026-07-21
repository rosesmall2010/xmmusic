import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'

let desktopLyricsWindow: BrowserWindow | null = null
let isLocked = false

export function createDesktopLyricsWindow(): BrowserWindow | null {
  if (desktopLyricsWindow) {
    desktopLyricsWindow.show()
    desktopLyricsWindow.focus()
    return desktopLyricsWindow
  }

  const { width } = screen.getPrimaryDisplay().workAreaSize

  desktopLyricsWindow = new BrowserWindow({
    width: 800,
    height: 120,
    x: Math.round((width - 800) / 2),
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 编译后本文件位于 dist/electron/main/windows/，preload.js 在上一级目录
      preload: join(__dirname, '../preload.js')
    }
  })

  desktopLyricsWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('桌面歌词窗口加载失败:', errorCode, errorDescription)
  })

  const isDev = !app.isPackaged
  if (isDev) {
    // 开发模式：加载 Vite 开发服务器（与主窗口一致）
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000'
    desktopLyricsWindow.loadURL(`${devServerUrl}/#/desktop-lyrics`)
  } else {
    // 生产模式：dist/electron/main/windows/ → dist/renderer/index.html
    // hash 需要以 / 开头才能匹配 vue-router 的 hash 路由
    desktopLyricsWindow.loadFile(join(__dirname, '../../../renderer/index.html'), {
      hash: '/desktop-lyrics'
    })
  }

  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null
    isLocked = false
  })

  return desktopLyricsWindow
}

export function closeDesktopLyricsWindow(): void {
  if (desktopLyricsWindow) {
    desktopLyricsWindow.close()
    desktopLyricsWindow = null
    isLocked = false
  }
}

export function toggleDesktopLyricsWindow(): boolean {
  if (desktopLyricsWindow) {
    closeDesktopLyricsWindow()
    return false
  } else {
    createDesktopLyricsWindow()
    return true
  }
}

export function setDesktopLyricsLocked(locked: boolean): void {
  if (!desktopLyricsWindow) return

  isLocked = locked
  if (locked) {
    // 锁定：鼠标事件穿透窗口
    desktopLyricsWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    // 解锁：恢复鼠标交互
    desktopLyricsWindow.setIgnoreMouseEvents(false)
  }
}

export function sendToDesktopLyrics(channel: string, ...args: any[]): void {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.webContents.send(channel, ...args)
  }
}

export function getDesktopLyricsWindow(): BrowserWindow | null {
  return desktopLyricsWindow
}

export function isDesktopLyricsOpen(): boolean {
  return desktopLyricsWindow !== null && !desktopLyricsWindow.isDestroyed()
}
