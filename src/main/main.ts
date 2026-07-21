import { app, BrowserWindow, protocol, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, statSync, createReadStream } from 'fs'
import { Readable } from 'stream'
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

// 注册自定义协议特权（必须在 app ready 之前调用）
// standard: true 是媒体元素能对该协议正常 seek 的必要条件（electron#51442），
// 否则拖动进度条会触发 FFmpegDemuxer "data source error"，播放管线挂死、歌词不再跟随。
// standard 协议要求 URL 必须带 host，因此渲染进程统一使用 local-file://media/<路径> 形式。
// 注意不要加 stream: true —— Electron 37+（Chromium 137）下它会破坏媒体拖动（electron#47661）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
])

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

    // macOS 开发模式下优先使用 PNG（Electron nativeImage 对 PNG 支持更好），否则使用 .icns
    if (process.platform === 'darwin') {
      const picIconPngPath = join(projectRoot, 'pic', 'appicon2.png')
      const buildIconPngPath = join(projectRoot, 'build', 'icon.png')
      const picIconIcnsPath = join(projectRoot, 'pic', 'icon.icns')
      const buildIconIcnsPath = join(projectRoot, 'build', 'icon.icns')

      // 优先使用 PNG（开发模式下更可靠）
      if (existsSync(picIconPngPath)) {
        iconPath = picIconPngPath
        console.log(`✅ 找到 pic/appicon2.png`)
      } else if (existsSync(buildIconPngPath)) {
        iconPath = buildIconPngPath
        console.log(`✅ 找到 build/icon.png`)
      } else if (existsSync(picIconIcnsPath)) {
        iconPath = picIconIcnsPath
        console.log(`✅ 使用 pic/icon.icns`)
      } else if (existsSync(buildIconIcnsPath)) {
        iconPath = buildIconIcnsPath
        console.log(`✅ 使用 build/icon.icns`)
      } else {
        iconPath = buildIconPngPath
        console.log(`⚠️ 使用默认路径 build/icon.png（可能不存在）`)
      }
    } else {
      iconPath = join(projectRoot, 'build', 'icon.png')
    }

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
      // 尝试其他可能的路径（优先 PNG）
      const altPaths = [
        join(projectRoot, 'pic', 'appicon2.png'),
        join(__dirname, '../../pic/appicon2.png'),
        join(__dirname, '../../../pic/appicon2.png'),
        join(projectRoot, 'build', 'icon.png'),
        join(__dirname, '../../build/icon.png'),
        join(__dirname, '../../../build/icon.png'),
        join(projectRoot, 'pic', 'icon.icns'),
        join(__dirname, '../../pic/icon.icns'),
        join(__dirname, '../../../pic/icon.icns'),
        join(projectRoot, 'build', 'icon.icns'),
        join(__dirname, '../../build/icon.icns'),
        join(__dirname, '../../../build/icon.icns')
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
        console.error(`   - ${join(projectRoot, 'pic', 'appicon2.png')} (存在: ${existsSync(join(projectRoot, 'pic', 'appicon2.png'))})`)
        console.error(`   - ${join(projectRoot, 'build', 'icon.png')} (存在: ${existsSync(join(projectRoot, 'build', 'icon.png'))})`)
        console.error(`   - ${join(projectRoot, 'pic', 'icon.icns')} (存在: ${existsSync(join(projectRoot, 'pic', 'icon.icns'))})`)
        console.error(`   - ${join(projectRoot, 'build', 'icon.icns')} (存在: ${existsSync(join(projectRoot, 'build', 'icon.icns'))})`)
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
      // 对于 macOS 的 .icns 文件，Electron 的 nativeImage 应该能够加载
      // 但如果加载失败，可能需要使用路径字符串
      const nativeImg = nativeImage.createFromPath(iconPath)
      console.log(`📊 图标加载详情:`)
      console.log(`  - Path: ${iconPath}`)
      console.log(`  - isEmpty: ${nativeImg.isEmpty()}`)

      if (!nativeImg.isEmpty()) {
        const size = nativeImg.getSize()
        console.log(`  - getSize: ${JSON.stringify(size)}`)
        // 对于 macOS，确保图标有有效尺寸
        if (size.width > 0 && size.height > 0) {
          icon = nativeImg
          console.log(`✅ 图标加载成功，尺寸: ${size.width}x${size.height}`)
        } else {
          console.warn(`⚠️ 图标尺寸无效 (${size.width}x${size.height})`)
          // 对于 macOS，如果 nativeImage 无法正确加载 .icns，尝试使用路径字符串
          // macOS 的 BrowserWindow 应该能够处理 .icns 文件路径
          if (process.platform === 'darwin' && iconPath.endsWith('.icns')) {
            icon = iconPath
            console.log(`✅ 使用 .icns 文件路径作为图标`)
          } else {
            icon = iconPath
          }
        }
      } else {
        // 如果 nativeImage 加载失败，对于 macOS 的 .icns 文件，尝试使用路径字符串
        console.warn(`⚠️ nativeImage 加载为空`)
        console.warn(`   文件路径: ${iconPath}`)
        console.warn(`   文件存在: ${existsSync(iconPath)}`)
        // macOS 的 BrowserWindow 应该能够处理 .icns 文件路径
        if (process.platform === 'darwin' && iconPath.endsWith('.icns')) {
          icon = iconPath
          console.log(`✅ 使用 .icns 文件路径作为图标（macOS 原生支持）`)
        } else {
          icon = iconPath
        }
      }
    } catch (error: any) {
      console.error(`❌ 加载图标失败: ${error?.message || error}`)
      console.error(`   错误堆栈: ${error?.stack || '无堆栈信息'}`)
      // 出错时尝试直接使用路径（macOS 应该能够处理 .icns 文件路径）
      icon = iconPath
    }
  } else {
    console.warn(`⚠️ 图标路径无效或文件不存在: ${iconPath}`)
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

    // 优先使用 PNG（开发模式下更可靠），然后使用 .icns
    let dockIconPath = join(projectRoot, 'pic', 'appicon2.png')
    if (!existsSync(dockIconPath)) {
      dockIconPath = join(projectRoot, 'build', 'icon.png')
      if (!existsSync(dockIconPath)) {
        dockIconPath = join(projectRoot, 'pic', 'icon.icns')
        if (!existsSync(dockIconPath)) {
          dockIconPath = join(projectRoot, 'build', 'icon.icns')
        }
      }
    }

    if (existsSync(dockIconPath)) {
      try {
        const dockIcon = nativeImage.createFromPath(dockIconPath)
        if (!dockIcon.isEmpty()) {
          app.dock.setIcon(dockIcon)
          console.log(`✅ Dock 图标设置成功 (使用 ${dockIconPath.endsWith('.icns') ? 'ICNS' : 'PNG'} 格式)`)
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
  // 使用 protocol.handle 并手动处理 Range 分段请求：
  // 旧的 registerFileProtocol 不支持 Range，音频拖动进度条会触发
  // FFmpegDemuxer "data source error"，导致播放管线挂死、进度不再更新
  protocol.handle('local-file', (request) => {
    try {
      // URL 形如 local-file://media/Users/xxx.mp3（media 为固定占位 host）
      // 用 URL 解析取 pathname，再解码 URL 编码的字符
      let filePath = decodeURIComponent(new URL(request.url).pathname)

      // Windows 路径规范化：如果路径以 / 开头（如 /C:/Music），移除开头的斜杠
      if (process.platform === 'win32' && filePath.match(/^\/[A-Za-z]:/)) {
        filePath = filePath.substring(1)
      }

      // Windows 路径：将正斜杠转换为反斜杠（Windows 文件系统需要）
      if (process.platform === 'win32') {
        filePath = filePath.replace(/\//g, '\\')
      }

      if (!existsSync(filePath)) {
        console.error('❌ 文件不存在:', filePath)
        return new Response('Not Found', { status: 404 })
      }

      const { size } = statSync(filePath)
      const rangeHeader = request.headers.get('range')

      // 无 Range：整文件返回
      if (!rangeHeader) {
        const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Length': String(size),
            'Accept-Ranges': 'bytes'
          }
        })
      }

      // 有 Range：返回 206 分段内容（拖动进度条时媒体解码器依赖这个）
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      let start = match && match[1] ? parseInt(match[1], 10) : 0
      let end = match && match[2] ? parseInt(match[2], 10) : size - 1
      if (isNaN(start) || start < 0) start = 0
      if (isNaN(end) || end >= size) end = size - 1
      if (start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        })
      }

      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes'
        }
      })
    } catch (error: any) {
      console.error('❌ 文件访问错误:', error?.message || error)
      console.error('   原始URL:', request.url)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // 初始化数据库（同步执行，确保在设置 IPC 之前完成）
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
    console.error('  1. @vscode/sqlite3 模块未正确安装')
    console.error('  2. 数据库文件权限问题')
    console.error('  3. Electron 版本与 @vscode/sqlite3 不兼容')
    console.error('')
    console.error('💡 解决方案:')
    console.error('  1. 重新安装依赖: npm install')
    console.error('  2. 检查数据库文件权限')
    console.error('  3. 查看文档: docs/PYTHON_AND_ELECTRON_FIX.md')
    console.error('')
    console.error('⚠️ 应用将继续运行，但数据库功能将不可用')
    console.error('='.repeat(60))
    db = null
  }

  // 创建窗口
  createWindow()

  // 立即读取并应用主题设置到窗口外观
  if (mainWindow && db) {
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

  // 设置 IPC（数据库已初始化完成）
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
      db.close()
      console.log('✅ 数据库连接已关闭')
    } catch (error) {
      console.error('关闭数据库时出错:', error)
    }
  }
})
