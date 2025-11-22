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
    x: (width - 800) / 2,
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
      preload: join(__dirname, 'preload.js')
    }
  })

  const isDev = !app.isPackaged

  if (isDev) {
    desktopLyricsWindow.loadURL('http://localhost:5173/#/desktop-lyrics')
  } else {
    desktopLyricsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'desktop-lyrics'
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
    // Lock: enable mouse events passthrough
    desktopLyricsWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    // Unlock: restore mouse interaction
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
