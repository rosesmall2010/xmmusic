import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'

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
    // 创建托盘图标
    const iconPath = this.getTrayIcon()
    const icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true) // macOS 支持模板图片

    this.tray = new Tray(icon)
    this.tray.setToolTip('xmmusic')

    // 创建托盘菜单
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
   * 获取托盘图标路径
   */
  private getTrayIcon(): string {
    const platform = process.platform
    if (platform === 'darwin') {
      // macOS
      return join(__dirname, '../../assets/tray-icon-mac.png')
    } else if (platform === 'win32') {
      // Windows
      return join(__dirname, '../../assets/tray-icon-win.png')
    } else {
      // Linux
      return join(__dirname, '../../assets/tray-icon-linux.png')
    }
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

    // 可以根据播放状态切换图标
    // 这里简化处理，保持同一个图标
    const iconPath = this.getTrayIcon()
    const icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)
    this.tray.setImage(icon)
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
