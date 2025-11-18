import { app, BrowserWindow, protocol, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import MusicDatabase from './database/db'
import { setupIPC } from './ipc/handlers'
import FileMonitor from './services/fileMonitor'
import ShortcutManager from './services/shortcutManager'
import TrayService from './services/trayService'

let mainWindow: BrowserWindow | null = null
let db: MusicDatabase | null = null
let fileMonitor: FileMonitor | null = null
let shortcutManager: ShortcutManager | null = null
let trayService: TrayService | null = null

function createWindow(): void {
  // 开发模式检测：严格判断是否为开发模式
  // 生产打包版本中，NODE_ENV 会被设置为 'production'，且不会有 VITE_DEV_SERVER_URL
  const isDev: boolean = process.env.NODE_ENV !== 'production' &&
                         (process.env.NODE_ENV === 'development' ||
                          !process.env.NODE_ENV ||
                          !!process.env.VITE_DEV_SERVER_URL)

  // 设置应用图标
  // 开发环境：从项目根目录的 build 文件夹
  // 生产环境：从打包后的资源目录
  let iconPath: string | undefined

  if (isDev) {
    // 开发环境：从项目根目录
    // 在开发模式下，直接使用 process.cwd() 获取项目根目录
    // 因为 npm run dev 会在项目根目录执行
    const projectRoot = process.cwd()

    // 开发模式下统一使用 PNG（更简单，跨平台）
    iconPath = join(projectRoot, 'build', 'icon.png')

    // 输出详细的调试信息（确保能看到）
    console.log('='.repeat(60))
    console.log('🔍 图标路径调试信息:')
    console.log(`  - isDev: ${isDev}`)
    console.log(`  - __dirname: ${__dirname}`)
    console.log(`  - process.cwd(): ${process.cwd()}`)
    console.log(`  - projectRoot: ${projectRoot}`)
    console.log(`  - iconPath: ${iconPath}`)
    console.log(`  - 文件存在: ${existsSync(iconPath)}`)
    console.log('='.repeat(60))

    if (!existsSync(iconPath)) {
      console.warn(`⚠️ 图标文件不存在: ${iconPath}`)
      // 尝试其他可能的路径
      const altPaths = [
        join(__dirname, '../../build/icon.png'),
        join(__dirname, '../../../build/icon.png')
      ]

      for (const altPath of altPaths) {
        if (existsSync(altPath)) {
          iconPath = altPath
          console.log(`✅ 找到备用图标路径: ${iconPath}`)
          break
        }
      }

      if (!iconPath || !existsSync(iconPath)) {
        console.error(`❌ 无法找到图标文件，尝试的路径:`)
        console.error(`   - ${join(projectRoot, 'build', 'icon.png')} (存在: ${existsSync(join(projectRoot, 'build', 'icon.png'))})`)
        altPaths.forEach(p => console.error(`   - ${p} (存在: ${existsSync(p)})`))
        iconPath = undefined
      }
    } else {
      console.log(`✅ 图标文件存在: ${iconPath}`)
    }
  } else {
    // 生产环境：从资源目录
    if (process.platform === 'darwin') {
      iconPath = join(process.resourcesPath, 'build', 'icon.icns')
    } else {
      iconPath = join(process.resourcesPath, 'build', 'icon.png')
    }
  }

  // 使用 nativeImage 加载图标
  let icon: Electron.NativeImage | string | undefined
  if (iconPath && existsSync(iconPath)) {
    try {
      const nativeImg = nativeImage.createFromPath(iconPath)
      console.log(`📊 图标加载详情:`)
      console.log(`  - Path: ${iconPath}`)
      console.log(`  - isEmpty: ${nativeImg.isEmpty()}`)

      if (!nativeImg.isEmpty()) {
        console.log(`  - getSize: ${JSON.stringify(nativeImg.getSize())}`)
        icon = nativeImg
        console.log(`✅ 图标加载成功`)
      } else {
        // 如果 nativeImage 加载失败，直接使用路径字符串
        console.warn(`⚠️ nativeImage 加载为空，使用路径字符串作为图标`)
        icon = iconPath
      }
    } catch (error) {
      console.error(`❌ 加载图标失败: ${error}`)
      // 出错时尝试直接使用路径
      icon = iconPath
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(icon && { icon }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 允许访问本地文件
      webSecurity: false, // 允许跨域访问本地文件
      preload: join(__dirname, 'preload.js'),
      devTools: isDev // 生产模式下完全禁用 DevTools
    },
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  })

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000'
    console.log(`🔗 加载开发服务器: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl)
    // 仅在开发模式下打开 DevTools
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的文件，不打开 DevTools
    const indexPath = join(__dirname, '../renderer/index.html')
    console.log(`📁 加载文件: ${indexPath}`)
    mainWindow.loadFile(indexPath)
    // 确保生产模式下 DevTools 是关闭的
    mainWindow.webContents.closeDevTools()
  }
}

app.whenReady().then(async () => {
  // 设置 Dock 图标（仅 macOS）
  if (process.platform === 'darwin') {
    // 开发模式检测：严格判断是否为开发模式
    const isDev = process.env.NODE_ENV !== 'production' &&
                  (process.env.NODE_ENV === 'development' ||
                   !process.env.NODE_ENV ||
                   process.env.VITE_DEV_SERVER_URL)
    const projectRoot = process.cwd()
    const dockIconPath = join(projectRoot, 'build', 'icon.png')

    if (existsSync(dockIconPath)) {
      try {
        const dockIcon = nativeImage.createFromPath(dockIconPath)
        if (!dockIcon.isEmpty()) {
          app.dock.setIcon(dockIcon)
          console.log('✅ Dock 图标设置成功')
        } else {
          console.warn('⚠️ Dock 图标加载为空')
        }
      } catch (error) {
        console.error('❌ 设置 Dock 图标失败:', error)
      }
    } else {
      console.warn('⚠️ Dock 图标文件不存在:', dockIconPath)
    }
  }

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
  console.log('🔧 开始初始化数据库...')
  try {
    db = MusicDatabase.getInstance()
    db.initialize()
    console.log('✅ 数据库初始化成功')
  } catch (error: any) {
    console.error('='.repeat(60))
    console.error('❌ 数据库初始化失败!')
    console.error('='.repeat(60))
    console.error('错误信息:', error?.message || error)
    if (error?.stack) {
      console.error('错误堆栈:', error.stack)
    }
    console.error('')
    console.error('⚠️ 可能的原因:')
    console.error('  1. better-sqlite3 模块未正确编译')
    console.error('  2. Python 环境配置问题')
    console.error('  3. Electron 版本与 better-sqlite3 不兼容')
    console.error('')
    console.error('💡 解决方案:')
    console.error('  1. 重新编译: npm run rebuild')
    console.error('  2. 检查 Python: python3 --version')
    console.error('  3. 查看文档: docs/BETTER_SQLITE3_FIX.md')
    console.error('')
    console.error('⚠️ 应用将继续运行，但数据库功能将不可用')
    console.error('='.repeat(60))
    db = null
  }

  // 创建窗口
  createWindow()

  // 初始化系统托盘
  if (mainWindow) {
    trayService = new TrayService(mainWindow)
    trayService.createTray()
    console.log('✅ 系统托盘已初始化')

    // 监听窗口关闭事件，根据设置决定是否最小化到托盘
    mainWindow.on('close', (event) => {
      const settings = db?.getAllSettings() || {}
      if (settings.minimizeToTray) {
        event.preventDefault()
        mainWindow?.hide()
      }
    })
  }

  // 初始化快捷键管理器
  shortcutManager = new ShortcutManager()
  if (mainWindow) {
    shortcutManager.setMainWindow(mainWindow)
    console.log('✅ 快捷键管理器已初始化')
  }

  // 初始化文件监控
  if (db) {
    fileMonitor = new FileMonitor(db)
    console.log('✅ 文件监控服务已初始化')
  }

  // 设置 IPC（即使数据库未初始化也要设置基础 handlers）
  if (mainWindow) {
    setupIPC(db, mainWindow, fileMonitor, shortcutManager, trayService)

    // 加载并注册快捷键
    if (shortcutManager) {
      mainWindow.webContents.once('did-finish-load', async () => {
        try {
          await mainWindow?.webContents.executeJavaScript(`
            window.electronAPI.loadShortcuts()
          `)
        } catch (error) {
          console.error('加载快捷键失败:', error)
        }
      })
    }
  } else {
    console.warn('⚠️ IPC 未设置：主窗口未创建')
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
