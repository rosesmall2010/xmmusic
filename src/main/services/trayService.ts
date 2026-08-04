import { app, Tray, Menu, nativeImage, BrowserWindow, NativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

export default class TrayService {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null
  private isPlaying: boolean = false
  private currentMusic: { title: string; artist: string } | null = null

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  /**
   * 创建系统托盘
   */
  createTray(): void {
    const icon = this.createTrayImage()
    if (icon.isEmpty()) {
      console.error('❌ 托盘图标加载失败：未找到可用图标文件')
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('xmmusic')

    this.updateTrayMenu()

    // 点击托盘图标显示/隐藏窗口
    this.tray.on('click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide()
        } else {
          this.mainWindow.show()
          this.mainWindow.focus()
        }
      }
    })

    // 双击托盘图标显示窗口
    this.tray.on('double-click', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })
  }

  /**
   * 解析可用的托盘图标路径（开发 / 打包均兜底）
   */
  private resolveTrayIconPath(): string | null {
    // Windows 托盘推荐 16×16；macOS / Linux 用 32 更清晰
    const preferred =
      process.platform === 'win32' ? ['icon-16.png', 'icon-32.png', 'icon.png'] : ['icon-32.png', 'icon-16.png', 'icon.png']

    const bases = [
      join(app.getAppPath(), 'build'),
      join(process.resourcesPath, 'build'),
      join(process.cwd(), 'build'),
      // dist/electron/main/services → 项目根 /build
      join(__dirname, '../../../build'),
      join(__dirname, '../../../../build'),
      join(process.cwd(), 'pic'),
      join(app.getAppPath(), 'pic')
    ]

    const altNames = ['appicon2.png', 'appicon.png']

    for (const base of bases) {
      for (const name of preferred) {
        const p = join(base, name)
        if (existsSync(p)) return p
      }
      for (const name of altNames) {
        const p = join(base, name)
        if (existsSync(p)) return p
      }
    }

    return null
  }

  /**
   * 生成适合当前平台的托盘 NativeImage
   */
  private createTrayImage(): NativeImage {
    const iconPath = this.resolveTrayIconPath()
    let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

    if (icon.isEmpty()) {
      return icon
    }

    // 按平台缩放到托盘合适尺寸（大图直接作托盘在 Windows 上常显示异常）
    const size = process.platform === 'darwin' ? 22 : 16
    const { width, height } = icon.getSize()
    if (width !== size || height !== size) {
      icon = icon.resize({ width: size, height: size })
    }

    // 仅 macOS 使用模板图（随菜单栏深浅色自适应）；Windows 上开启会导致图标空白
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    return icon
  }

  /**
   * 更新托盘菜单
   */
  updateTrayMenu(): void {
    if (!this.tray) return

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: this.currentMusic
          ? `${this.currentMusic.title} - ${this.currentMusic.artist}`
          : 'xmmusic',
        enabled: false
      },
      { type: 'separator' },
      {
        label: this.isPlaying ? '暂停' : '播放',
        click: () => {
          this.mainWindow?.webContents.send('tray-action', 'play-pause')
        }
      },
      {
        label: '上一首',
        click: () => {
          this.mainWindow?.webContents.send('tray-action', 'previous')
        }
      },
      {
        label: '下一首',
        click: () => {
          this.mainWindow?.webContents.send('tray-action', 'next')
        }
      },
      { type: 'separator' },
      {
        label: this.mainWindow?.isVisible() ? '隐藏窗口' : '显示窗口',
        click: () => {
          if (this.mainWindow) {
            if (this.mainWindow.isVisible()) {
              this.mainWindow.hide()
            } else {
              this.mainWindow.show()
              this.mainWindow.focus()
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit()
        }
      }
    ]

    const contextMenu = Menu.buildFromTemplate(template)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 更新播放状态
   */
  updatePlayState(isPlaying: boolean): void {
    this.isPlaying = isPlaying
    this.updateTrayMenu()
    this.updateTrayIcon()
  }

  /**
   * 更新当前音乐信息
   */
  updateCurrentMusic(music: { title: string; artist: string } | null): void {
    this.currentMusic = music
    this.updateTrayMenu()
  }

  /**
   * 更新托盘图标（根据播放状态）
   */
  private updateTrayIcon(): void {
    if (!this.tray) return
    const icon = this.createTrayImage()
    if (!icon.isEmpty()) {
      this.tray.setImage(icon)
    }
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
