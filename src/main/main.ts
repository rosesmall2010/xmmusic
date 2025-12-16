import { app, BrowserWindow, protocol, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import MusicDatabase from './database/db'
import { setupIPC } from './ipc/handlers'
import FileMonitor from './services/fileMonitor'
import ShortcutManager from './services/shortcutManager'
import TrayService from './services/trayService'

// 设置应用名称（修复 macOS 菜单栏和进程名称显示为 Electron 的问题）
app.name = 'xmmusic'

// 修复 Electron 39 网络服务崩溃问题
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('disable-site-isolation-trials')

// 开发模式下使用独立的 userData 目录，避免与生产环境冲突
// 这必须在 app.on('ready') 之前调用
if (!app.isPackaged && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)) {
  const userDataPath = app.getPath('userData')
  const devUserDataPath = `${userDataPath}-dev`
  app.setPath('userData', devUserDataPath)
  console.log('='.repeat(60))
  console.log(`🔧 开发模式检测到，已切换 UserData 目录`)
  console.log(`📂 原路径: ${userDataPath}`)
  console.log(`📂 新路径: ${devUserDataPath}`)
  console.log('='.repeat(60))
}

let mainWindow: BrowserWindow | null = null
let db: MusicDatabase | null = null
let fileMonitor: FileMonitor | null = null
let shortcutManager: ShortcutManager | null = null
let trayService: TrayService | null = null
let isMainWindowReady = false // 跟踪主窗口是否就绪

export function isMainWindowLoaded(): boolean {
  return isMainWindowReady
}

function createWindow(): void {
  // 开发模式检测：使用 app.isPackaged 作为最可靠的判断依据
  // app.isPackaged 在打包后的应用中为 true，开发模式下为 false
  // 同时检查 NODE_ENV 和 VITE_DEV_SERVER_URL 作为辅助判断
  const isDev: boolean = !app.isPackaged &&
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
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, 'preload.js'),
      devTools: isDev, // 生产模式下完全禁用 DevTools
      // Electron 39 网络服务稳定性配置
      backgroundThrottling: false,
      offscreen: false
    },
    // macOS: 使用原生红绿灯按钮，隐藏标题栏但保留按钮
    // Windows/Linux: 完全自定义无边框窗口
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          frame: true,
          // backgroundColor确保红绿灯在所有主题下都正确显示灰色
          backgroundColor: '#00000000' // 完全透明,让CSS控制背景
        }
      : { frame: false }
    )
  })

  // 添加错误处理和调试信息
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('='.repeat(60))
    console.error('❌ 页面加载失败!')
    console.error(`  - 错误代码: ${errorCode}`)
    console.error(`  - 错误描述: ${errorDescription}`)
    console.error(`  - URL: ${validatedURL}`)
    console.error('='.repeat(60))
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ 页面加载完成')
    isMainWindowReady = true  // 标记主窗口已就绪
  })

  mainWindow.webContents.on('dom-ready', () => {
    console.log('✅ DOM 准备就绪')
  })

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000'
    console.log(`🔗 加载开发服务器: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl)
    // 仅在开发模式下打开 DevTools
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的文件
    const indexPath = join(__dirname, '../renderer/index.html')
    console.log('='.repeat(60))
    console.log('📁 生产模式文件加载信息:')
    console.log(`  - __dirname: ${__dirname}`)
    console.log(`  - indexPath: ${indexPath}`)
    console.log(`  - 文件存在: ${existsSync(indexPath)}`)
    console.log(`  - process.resourcesPath: ${process.resourcesPath}`)
    console.log(`  - app.isPackaged: ${app.isPackaged}`)

    // 检查文件是否存在
    if (!existsSync(indexPath)) {
      console.error('❌ index.html 文件不存在!')
      console.error('尝试查找备用路径...')
      const altPaths = [
        join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html'),
        join(process.resourcesPath, 'app', 'dist', 'renderer', 'index.html'),
        join(__dirname, '..', 'renderer', 'index.html'),
        join(__dirname, '../../renderer/index.html')
      ]
      for (const altPath of altPaths) {
        console.log(`  - 检查: ${altPath} (存在: ${existsSync(altPath)})`)
        if (existsSync(altPath)) {
          console.log(`✅ 找到备用路径: ${altPath}`)
          mainWindow.loadFile(altPath)
          console.log('='.repeat(60))
          return
        }
      }
      console.error('❌ 无法找到 index.html 文件')
      console.log('='.repeat(60))
    } else {
      console.log(`✅ 找到文件: ${indexPath}`)
      console.log('='.repeat(60))
    }

    mainWindow.loadFile(indexPath).catch((error) => {
      console.error('❌ loadFile 失败:', error)
    })
  }
}

// 处理网络服务崩溃和渲染进程错误
app.on('web-contents-created', (_, contents) => {
  contents.on('render-process-gone', (event: Electron.Event, details: Electron.RenderProcessGoneDetails) => {
    console.error('❌ 渲染进程退出:', details)
    if (details.reason === 'crashed') {
      console.error('❌ 渲染进程崩溃，原因:', details.exitCode)
    }
  })
})

app.whenReady().then(async () => {
  // 设置 Dock 图标（仅 macOS）
  if (process.platform === 'darwin' && app.dock) {
    // 开发模式检测：使用 app.isPackaged 作为最可靠的判断依据
    const isDev = !app.isPackaged &&
                  (process.env.NODE_ENV === 'development' ||
                   !process.env.NODE_ENV ||
                   !!process.env.VITE_DEV_SERVER_URL)
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
    // 移除协议前缀
    const url = request.url.replace('local-file://', '')
    console.log('🔍 原始URL (移除协议后):', url)
    try {
      // 浏览器会自动对URL中的中文字符进行编码，所以需要解码
      const filePath = decodeURIComponent(url)
      // console.log('📂 解码后的文件路径:', filePath)
      // console.log('📁 文件是否存在:', existsSync(filePath))
      callback({ path: filePath })
    } catch (error) {
      console.error('文件访问错误:', error)
      callback({ error: -2 }) // FILE_NOT_FOUND
    }
  })

  // 创建窗口 - 先创建窗口，再初始化数据库，避免阻塞UI
  createWindow()

  // 初始化数据库 - 放在窗口创建之后，避免阻塞UI
  console.log('🔧 开始初始化数据库...')
  setTimeout(() => {
    console.log('🔧 执行数据库初始化...')
    try {
      db = MusicDatabase.getInstance()
      console.log('🔧 获取数据库实例成功')
      db.initialize()
      console.log('✅ 数据库初始化成功')

      // 数据库初始化完成后，执行后续操作
      console.log('🔧 执行数据库初始化后的操作...')

      // 初始化文件监控
      fileMonitor = new FileMonitor(db)
      console.log('✅ 文件监控服务已初始化')

      // 应用主题设置
      if (mainWindow) {
        try {
          const settings = db.getAllSettings()
          const theme = settings.theme || 'light'
          const { nativeTheme } = require('electron')
          if (theme === 'system') {
            nativeTheme.themeSource = 'system'
          } else {
            nativeTheme.themeSource = theme
          }
          console.log(`✅ 窗口外观已设置为: ${theme}`)
        } catch (error) {
          console.error('设置窗口外观失败:', error)
        }
      }



      console.log('✅ 数据库初始化后的操作执行完成')
    } catch (error: any) {
      console.error('='.repeat(60))
      console.error('❌ 数据库初始化失败!')
      console.error('='.repeat(60))
      console.error('错误信息:', error?.message || error)
      console.error('错误堆栈:', error?.stack || '无堆栈信息')
      db = null
    }
  }, 100) // 延迟 100ms 执行，让窗口先渲染出来

  // 初始化系统托盘
  if (mainWindow) {
    trayService = new TrayService(mainWindow)
    trayService.createTray()
    console.log('✅ 系统托盘已初始化')

    // 监听窗口关闭事件，根据设置决定是否最小化到托盘
    mainWindow.on('close', (event) => {
      // 数据库可能尚未初始化，所以需要检查
      if (db) {
        const settings = (db as any)?.getAllSettings() || {}
        if (settings.minimizeToTray) {
          event.preventDefault()
          mainWindow?.hide()
        }
      }
    })
  }

  // 初始化快捷键管理器
  shortcutManager = new ShortcutManager()
  if (mainWindow) {
    shortcutManager.setMainWindow(mainWindow)
    console.log('✅ 快捷键管理器已初始化')
  }

  // 设置 IPC
  if (mainWindow) {
    console.log('🔧 设置 IPC handlers...')
    setupIPC(db, mainWindow, fileMonitor, shortcutManager, trayService)
    console.log('✅ IPC handlers 已设置')

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
    console.error('❌ IPC 设置失败：主窗口未创建')
  }

  // 不使用 await，让数据库初始化在后台完成
  // 界面会立即响应，数据库会在100ms后初始化完成
  // 所有依赖数据库的初始化（主题、托盘、快捷键、IPC）都在Promise内部完成

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 在所有平台（包括 macOS）上，当所有窗口关闭时退出应用
  // 如果用户开启了"最小化到托盘"，窗口不会真正关闭（而是隐藏），因此不会触发此事件
  app.quit()
})

app.on('will-quit', () => {
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
      (db as any).close()
      console.log('✅ 数据库连接已关闭')
    } catch (error) {
      console.error('关闭数据库时出错:', error)
    }
  }
})
