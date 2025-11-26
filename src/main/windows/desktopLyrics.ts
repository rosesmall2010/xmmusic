import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'

let desktopLyricsWindow: BrowserWindow | null = null
let isLocked = false

export function createDesktopLyricsWindow(): BrowserWindow | null {
  // 开发模式下禁用桌面歌词功能，避免连接问题
  const isDev = !app.isPackaged
  if (isDev) {
    console.log('⚠️ 桌面歌词功能在开发模式下不可用')
    return null
  }

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

  // Add error handling for failed loads
  let loadRetryCount = 0
  const maxRetries = 3

  desktopLyricsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Desktop lyrics window failed to load:', errorCode, errorDescription)

    // 在开发模式下，如果是连接错误，尝试重试
    if (isDev && errorCode === -102 && loadRetryCount < maxRetries) {
      loadRetryCount++
      console.log(`🔄 重试加载桌面歌词窗口 (${loadRetryCount}/${maxRetries})`)

      setTimeout(() => {
        if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
          const devServerURL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
          desktopLyricsWindow.loadURL(`${devServerURL}/#/desktop-lyrics`)
        }
      }, 1000 * loadRetryCount) // 递增延迟: 1s, 2s, 3s
    }
  })

  if (isDev) {
    // 开发模式：直接加载HTML，不依赖开发服务器
    // 这样可以避免连接问题
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>桌面歌词</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      -webkit-app-region: drag;
    }
    .desktop-lyrics-window {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 16px;
    }
    .lyrics-content {
      font-size: 32px;
      font-weight: 700;
      color: white;
      text-align: center;
      text-shadow:
        0 0 20px rgba(0, 0, 0, 0.8),
        0 2px 10px rgba(0, 0, 0, 0.6),
        0 0 40px rgba(255, 255, 255, 0.3);
    }
  </style>
</head>
<body>
  <div class="desktop-lyrics-window">
    <div class="lyrics-content">桌面歌词功能暂不可用</div>
  </div>
  <script>
    // 简单显示提示信息
    console.log('桌面歌词窗口已加载（开发模式）');
  </script>
</body>
</html>
    `
    desktopLyricsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
    console.log('✅ 桌面歌词窗口使用 data URL 加载（开发模式）')
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
