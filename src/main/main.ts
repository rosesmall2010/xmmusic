import { app, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import MusicDatabase from './database/db'
import { setupIPC } from './ipc/handlers'
import FileMonitor from './services/fileMonitor'

let mainWindow: BrowserWindow | null = null
let db: MusicDatabase | null = null
let fileMonitor: FileMonitor | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 允许访问本地文件
      webSecurity: false, // 允许跨域访问本地文件
      preload: join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  })

  // 开发模式检测：检查是否有 VITE_DEV_SERVER_URL 或 NODE_ENV
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.VITE_DEV_SERVER_URL

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    // 尝试加载 3001，如果失败则尝试 3000
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3001'
    console.log(`🔗 加载开发服务器: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的文件
    const indexPath = join(__dirname, '../renderer/index.html')
    console.log(`📁 加载文件: ${indexPath}`)
    mainWindow.loadFile(indexPath)
  }
}

app.whenReady().then(async () => {
  // 注册自定义协议来访问本地文件
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const url = request.url.replace('local-file://', '')
    try {
      const decodedPath = decodeURIComponent(url)
      console.log('📂 访问本地文件:', decodedPath)
      callback({ path: decodedPath })
    } catch (error) {
      console.error('文件访问错误:', error)
      callback({ error: -2 }) // FILE_NOT_FOUND
    }
  })

  // 初始化数据库
  try {
    db = MusicDatabase.getInstance()
    db.initialize()
    console.log('✅ 数据库初始化成功')
  } catch (error: any) {
    console.error('❌ 数据库初始化失败:', error?.message || error)
    console.error('⚠️ better-sqlite3 需要为 Electron 重新编译')
    console.error('⚠️ 请查看: docs/BETTER_SQLITE3_FIX.md 了解解决方案')
    console.error('⚠️ 应用将继续运行，但数据库功能将不可用')
    db = null
  }

  // 创建窗口
  createWindow()

  // 初始化文件监控
  if (db) {
    fileMonitor = new FileMonitor(db)
    console.log('✅ 文件监控服务已初始化')
  }

  // 设置 IPC
  if (db && mainWindow) {
    setupIPC(db, mainWindow, fileMonitor)
  } else {
    console.warn('⚠️ IPC 未设置：数据库未初始化，相关功能将不可用')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 停止文件监控
  if (fileMonitor) {
    try {
      fileMonitor.stopAll()
    } catch (error) {
      console.error('停止文件监控时出错:', error)
    }
  }

  if (db) {
    try {
      db.close()
    } catch (error) {
      console.error('关闭数据库时出错:', error)
    }
  }
  if (process.platform !== 'darwin') app.quit()
})
