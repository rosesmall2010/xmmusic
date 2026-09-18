import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, normalize, sep } from 'path'
import MusicDatabase, { calculateFilePathMD5 } from '../database/db'
import FileScanner from '../services/fileScanner'
import ID3Fixer from '../services/id3Fixer'
import FileExporter from '../services/fileExporter'
import ShortcutManager from '../services/shortcutManager'
import LyricsService from '../services/lyricsService'
import LyricsMatchService from '../services/lyricsMatchService'
import CoverMatchService from '../services/coverMatchService'
import TrayService from '../services/trayService'
import MetadataEditor from '../services/metadataEditor'
import { loadSettingsFromFile, saveSettingsToFile } from '../services/settingsStore'
import scanManager from '../services/scanManager'
import * as desktopLyrics from '../windows/desktopLyrics'
import { syncMusicMetadataToDb, batchSyncMusicMetadataToDb } from '../services/metadataSync'
import { setPlaylistCover, getPlaylistCoverCandidates } from '../services/playlistCover'
import type { ScanProgress, MusicItem } from '../../shared/types/music'
import type { ShortcutConfig } from '../../shared/types/settings'
import type { LyricsData, LyricsMatchProgress, LyricsMatchSummary } from '../../shared/types/lyrics'
import type { CoverMatchResult, CoverMatchProgress, CoverMatchSummary } from '../../shared/types/coverMatch'
import { APP_SHORTCUT_ACTIONS } from '../../shared/utils/shortcutActions'

/** 从高级搜索条件生成历史文案；仅排序/limit 等程序化查询返回 null */
function buildAdvancedSearchHistoryLabel(criteria: Record<string, unknown> | null | undefined): string | null {
  if (!criteria) return null

  const keyword = typeof criteria.keyword === 'string' ? criteria.keyword.trim() : ''
  if (keyword) return keyword

  const parts: string[] = []
  const push = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${label}:${value.trim()}`)
    }
  }
  push('歌手', criteria.artist)
  push('专辑', criteria.album)
  push('流派', criteria.genre)
  push('目录', criteria.directory)
  push('格式', criteria.fileExtension)

  if (criteria.favorite === true) parts.push('收藏')
  if (criteria.favorite === false) parts.push('未收藏')
  if (typeof criteria.minDuration === 'number' || typeof criteria.maxDuration === 'number') {
    const min = typeof criteria.minDuration === 'number' ? criteria.minDuration : ''
    const max = typeof criteria.maxDuration === 'number' ? criteria.maxDuration : ''
    parts.push(`时长:${min}-${max}`)
  }
  if (typeof criteria.yearFrom === 'number' || typeof criteria.yearTo === 'number') {
    const from = typeof criteria.yearFrom === 'number' ? criteria.yearFrom : ''
    const to = typeof criteria.yearTo === 'number' ? criteria.yearTo : ''
    parts.push(`年份:${from}-${to}`)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

export function setupIPC(db: MusicDatabase | null, mainWindow: BrowserWindow, shortcutManager: ShortcutManager | null = null, trayService: TrayService | null = null) {
  const lyricsService = new LyricsService()
  const lyricsMatchService = new LyricsMatchService()
  const coverMatchService = new CoverMatchService()
  const metadataEditor = new MetadataEditor()
  let lyricsMatchRunning = false
  /** 仅批量任务置位，供离开再回来恢复进度条 */
  let batchLyricsMatchActive = false
  let lyricsMatchLastProgress: LyricsMatchProgress | null = null
  let coverMatchRunning = false
  let batchCoverMatchActive = false
  let coverMatchLastProgress: CoverMatchProgress | null = null

  /**
   * 歌词 / 封面匹配进程内互斥锁
   * 避免并发写 ID3、争用网络与重复弹进度；UI 层 matchingLyricsId / matchingCoverId 与之对齐
   */
  const assertLyricsMatchIdle = () => {
    if (lyricsMatchRunning) throw new Error('歌词匹配进行中，请稍候')
    if (coverMatchRunning) throw new Error('封面匹配进行中，请稍候')
  }

  const withLyricsMatchLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    assertLyricsMatchIdle()
    lyricsMatchRunning = true
    try {
      return await fn()
    } finally {
      lyricsMatchRunning = false
    }
  }

  const assertCoverMatchIdle = () => {
    if (coverMatchRunning) throw new Error('封面匹配进行中，请稍候')
    if (lyricsMatchRunning) throw new Error('歌词匹配进行中，请稍候')
  }

  const withCoverMatchLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    assertCoverMatchIdle()
    coverMatchRunning = true
    try {
      return await fn()
    } finally {
      coverMatchRunning = false
    }
  }
  // 窗口控制（不依赖数据库）
  ipcMain.handle('window-minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle('window-close', () => {
    mainWindow.close()
  })

  // 应用信息
  ipcMain.handle('get-app-version', () => {
    // Electron 的 app.getVersion() 来源于 package.json 的 version
    return app.getVersion()
  })

  // 设置窗口外观模式(用于macOS红绿灯颜色)
  ipcMain.handle('set-window-theme', (_, theme: 'light' | 'dark' | 'system') => {
    const { nativeTheme } = require('electron')
    if (theme === 'system') {
      nativeTheme.themeSource = 'system'
    } else {
      nativeTheme.themeSource = theme
    }
  })

  // 迷你模式状态
  let normalBounds: Electron.Rectangle | null = null
  let isMiniMode = false
  const MINI_WIDTH = 320
  const MINI_HEIGHT = 480

  // 监听窗口大小变化，在 mini 模式下强制保持固定大小
  const handleWindowResize = () => {
    if (isMiniMode) {
      const bounds = mainWindow.getBounds()
      // 如果窗口大小不是 mini 模式的大小，强制恢复
      if (bounds.width !== MINI_WIDTH || bounds.height !== MINI_HEIGHT) {
        mainWindow.setSize(MINI_WIDTH, MINI_HEIGHT, false)
      }
    }
  }

  // 监听窗口移动，在拖动后检查并恢复 mini 模式的大小
  // 这在多显示器环境下特别重要，因为拖动到不同显示器时可能会触发大小变化
  const handleWindowMove = () => {
    if (isMiniMode) {
      // 延迟执行，确保在显示器切换完成后恢复大小
      setTimeout(() => {
        const bounds = mainWindow.getBounds()
        if (bounds.width !== MINI_WIDTH || bounds.height !== MINI_HEIGHT) {
          console.log(`🔧 检测到 mini 窗口大小变化: ${bounds.width}x${bounds.height}，恢复为 ${MINI_WIDTH}x${MINI_HEIGHT}`)
          mainWindow.setSize(MINI_WIDTH, MINI_HEIGHT, false)
        }
      }, 100)
    }
  }

  ipcMain.handle('set-mini-mode', async (_, enabled: boolean) => {
    if (enabled) {
      // 进入迷你模式 - 只在normalBounds为null时保存当前窗口尺寸
      if (!normalBounds && !mainWindow.isFullScreen()) {
        normalBounds = mainWindow.getBounds()
      }

      isMiniMode = true

      // 禁用窗口大小调整
      mainWindow.setResizable(false)
      mainWindow.setMinimumSize(MINI_WIDTH, MINI_HEIGHT)
      mainWindow.setMaximumSize(MINI_WIDTH, MINI_HEIGHT)
      mainWindow.setSize(MINI_WIDTH, MINI_HEIGHT, true)
      mainWindow.setAlwaysOnTop(true)

      // 添加事件监听器（先移除，避免重复调用 enabled=true 时监听器叠加）
      mainWindow.removeListener('resize', handleWindowResize)
      mainWindow.removeListener('move', handleWindowMove)
      mainWindow.on('resize', handleWindowResize)
      mainWindow.on('move', handleWindowMove)
    } else {
      // 退出迷你模式
      isMiniMode = false

      // 移除事件监听器
      mainWindow.removeListener('resize', handleWindowResize)
      mainWindow.removeListener('move', handleWindowMove)

      // 恢复窗口大小调整
      mainWindow.setResizable(true)
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setMinimumSize(800, 600)
      // 移除最大尺寸限制，使用一个很大的合理值（9999x9999 足够大，且不会导致转换错误）
      mainWindow.setMaximumSize(9999, 9999)

      if (normalBounds) {
        mainWindow.setBounds(normalBounds, true)
        normalBounds = null  // 重置为null,防止下次保存mini窗口尺寸
      } else {
        mainWindow.setSize(1000, 680, true)
        mainWindow.center()
      }
    }
  })

  // 桌面歌词控制
  ipcMain.handle('toggle-desktop-lyrics', () => {
    return desktopLyrics.toggleDesktopLyricsWindow()
  })

  ipcMain.handle('set-desktop-lyrics-locked', (_, locked: boolean) => {
    desktopLyrics.setDesktopLyricsLocked(locked)
  })

  ipcMain.handle('is-desktop-lyrics-open', () => {
    return desktopLyrics.isDesktopLyricsOpen()
  })

  // 主窗口推送播放状态 → 转发给桌面歌词窗口
  ipcMain.on('desktop-lyrics-state', (_, state) => {
    desktopLyrics.sendToDesktopLyrics('desktop-lyrics-state', state)
  })

  // 桌面歌词窗口加载完成 → 通知主窗口立即推送一次当前播放状态
  ipcMain.on('desktop-lyrics-ready', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-lyrics-request-state')
    }
  })

  // 桌面歌词窗口开/关 → 通知主窗口是否需要持续推送播放状态
  desktopLyrics.onDesktopLyricsVisibilityChange((open) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-lyrics-visibility', open)
    }
  })

  // 文件操作（部分不依赖数据库）
  ipcMain.handle('select-music-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'multiSelections']
    })
    return result.filePaths
  })

  // 在文件管理器中打开
  ipcMain.handle('open-in-file-explorer', async (_, filePath: string) => {
    const { shell } = require('electron')
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('select-music-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '音频文件', extensions: ['mp3', 'flac', 'aac', 'wav', 'ogg', 'm4a', 'ape', 'wma'] }
      ]
    })
    return result.filePaths && result.filePaths.length > 0 ? result.filePaths[0] : null
  })

  ipcMain.handle('select-music-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '音频文件', extensions: ['mp3', 'flac', 'aac', 'wav', 'ogg', 'm4a', 'ape', 'wma'] }
      ]
    })
    return result.filePaths || []
  })

  ipcMain.handle('select-image-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
      ]
    })
    return result.filePaths && result.filePaths.length > 0 ? result.filePaths[0] : null
  })

  // 选择单个目录（复制歌单文件等到指定路径）
  ipcMain.handle('select-folder', async (_, title?: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: title || '选择目录'
    })
    return result.canceled || !result.filePaths?.length ? null : result.filePaths[0]
  })

  /** 仅允许读写 userData 下文件（快捷键配置等），禁止任意路径 */
  const assertUnderUserData = (filePath: string) => {
    const resolved = normalize(resolve(filePath))
    const root = normalize(resolve(app.getPath('userData')))
    const fileCmp = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root
    if (fileCmp !== rootCmp && !fileCmp.startsWith(rootCmp.endsWith(sep) ? rootCmp : rootCmp + sep)) {
      throw new Error('仅允许访问应用数据目录内的文件')
    }
  }

  ipcMain.handle('read-file', async (_, filePath: string, encoding: string = 'utf-8') => {
    assertUnderUserData(filePath)
    return readFileSync(filePath, encoding as BufferEncoding)
  })

  ipcMain.handle('write-file', async (_, filePath: string, content: string, encoding: string = 'utf-8') => {
    assertUnderUserData(filePath)
    writeFileSync(filePath, content, encoding as BufferEncoding)
  })

  ipcMain.handle('show-save-dialog', async (_, options: any) => {
    const result = await dialog.showSaveDialog(mainWindow, options)
    return result.canceled ? null : result.filePath
  })

  // 扫描管理器状态
  let currentScanner: FileScanner | null = null

  // ========== 扫描操作（v1.0.6 更新） ==========

  /**
   * 扫描所有配置的目录（v1.0.6 新方法）
   */
  ipcMain.handle('scan-all-directories', async (_, options?: {
    concurrency?: number
    fileTypes?: string[]
    excludePaths?: string[]
    forceRescan?: boolean
  }) => {
    if (!db) {
      const errorMsg = '数据库未初始化，无法扫描音乐。\n\n' +
        '可能的原因：\n' +
        '1. @vscode/sqlite3 模块未正确安装\n' +
        '2. 数据库文件权限问题\n' +
        '3. 数据库初始化失败\n\n' +
        '请查看终端控制台的错误信息，或尝试重新安装依赖：\n' +
        'npm install'
      console.error('❌ 数据库未初始化，无法执行扫描操作')
      console.error('💡 提示：请检查终端控制台的数据库初始化错误信息')
      throw new Error(errorMsg)
    }

    // 检查是否已有扫描任务
    const state = scanManager.getState()
    if (state.isScanning && !state.isPaused) {
      throw new Error('已有扫描任务正在进行中，请先暂停或取消当前任务')
    }

    // 如果已暂停，恢复扫描
    if (state.isPaused) {
      scanManager.resume()
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: false })
      return { success: 0, failed: 0, corrupted: 0, skipped: 0, duration: 0, errors: [] }
    }

    try {
      // 发送扫描开始事件
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: false })

      const result = await scanManager.startScan({
        concurrency: options?.concurrency || 10,
        fileTypes: options?.fileTypes || ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
        excludePaths: options?.excludePaths || [],
        forceRescan: options?.forceRescan || false,
        onProgress: (progress: any) => {
          scanManager.setProgress(progress)
          // 使用 setImmediate 确保不阻塞主线程（better-sqlite3 是同步的）
          setImmediate(() => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('scan-progress', progress)
            }
          })
        }
      })

      // 发送扫描完成事件
      mainWindow.webContents.send('scan-state-changed', { isScanning: false, isPaused: false })

      return result
    } catch (error: any) {
      if (error.message === '扫描已取消') {
        throw error
      }
      throw error
    }
  })

  /**
   * 扫描单个目录（保留兼容）
   */
  ipcMain.handle('scan-music-folder', async (_, path: string) => {
    if (!db) {
      const errorMsg = '数据库未初始化，无法扫描音乐。\n\n' +
        '可能的原因：\n' +
        '1. @vscode/sqlite3 模块未正确安装\n' +
        '2. 数据库文件权限问题\n' +
        '3. 数据库初始化失败\n\n' +
        '请查看终端控制台的错误信息，或尝试重新安装依赖：\n' +
        'npm install'
      console.error('❌ 数据库未初始化，无法执行扫描操作')
      console.error('💡 提示：请检查终端控制台的数据库初始化错误信息')
      throw new Error(errorMsg)
    }

    // 检查是否已有扫描任务
    const state = scanManager.getState()
    if (state.isScanning && !state.isPaused) {
      throw new Error('已有扫描任务正在进行中，请先暂停或取消当前任务')
    }

    // 如果已暂停，恢复扫描
    if (state.isPaused && currentScanner) {
      scanManager.resume()
      currentScanner.setPaused(false)
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: false })
      return { success: 0, failed: 0, corrupted: 0, skipped: 0, duration: 0, errors: [] }
    }

    // 创建新的扫描器
    currentScanner = new FileScanner(db)
    // 注册到 scanManager，使通用的暂停/取消 IPC 能转发到这个实际在跑的扫描器
    scanManager.setScanner(currentScanner)
    scanManager.setScanning(true)
    scanManager.setCancelled(false)

    try {
      const result = await currentScanner.scanDirectory(path, {
        recursive: true,
        fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
        excludePaths: [],
        onProgress: (progress: ScanProgress) => {
          scanManager.setProgress(progress)
          // 使用 setImmediate 确保不阻塞主线程
          setImmediate(() => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('scan-progress', progress)
            }
          })
        }
      })

      scanManager.setScanning(false)
      currentScanner = null
      scanManager.setScanner(null)
      return result
    } catch (error: any) {
      scanManager.setScanning(false)
      currentScanner = null
      scanManager.setScanner(null)
      if (error.message === '扫描已取消') {
        throw error
      }
      throw error
    }
  })

  ipcMain.handle('pause-scan', async () => {
    const state = scanManager.getState()
    if (state.isScanning && !state.isPaused) {
      scanManager.pause()
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: true })
      return true
    }
    return false
  })

  ipcMain.handle('resume-scan', async () => {
    const state = scanManager.getState()
    if (state.isScanning && state.isPaused) {
      scanManager.resume()
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: false })
      return true
    }
    return false
  })

  ipcMain.handle('cancel-scan', async () => {
    const state = scanManager.getState()
    if (state.isScanning) {
      scanManager.cancel()
      mainWindow.webContents.send('scan-state-changed', { isScanning: false, isPaused: false })
      return true
    }
    return false
  })

  ipcMain.handle('get-scan-state', async () => {
    return scanManager.getState()
  })

  // 数据库操作（需要数据库）
  ipcMain.handle('get-music-list', async (_, offset: number, limit: number) => {
    if (!db) return []
    // 使用 getLocalMusicPaginated 从 local_music 表读取
    return db.getLocalMusicPaginated(offset, limit)
  })

  ipcMain.handle('get-music-total-count', () => {
    if (!db) return 0
    // 使用 getLocalMusicCount 从 local_music 表读取总数
    return db.getLocalMusicCount()
  })

  ipcMain.handle('get-local-music-index', (_, musicId: number) => {
    if (!db) return null
    return db.getLocalMusicIndexByMusicId(musicId)
  })

  ipcMain.handle('search-music', async (_, query: string) => {
    if (!db) return []
    const results = db.searchMusic(query)
    // 记录搜索历史
    if (query && query.trim()) {
      db.addSearchHistory(query.trim(), 'basic')
    }
    return results
  })

  ipcMain.handle('advanced-search', async (_, criteria: any) => {
    if (!db) return []
    const results = db.advancedSearch(criteria)
    // 仅当存在用户输入的检索条件时才写入历史（纯排序/limit 等程序化查询不算搜索）
    const historyLabel = buildAdvancedSearchHistoryLabel(criteria)
    if (historyLabel) {
      db.addSearchHistory(historyLabel, 'advanced', criteria)
    }
    return results
  })

  ipcMain.handle('get-search-history', async () => {
    if (!db) return []
    return db.getSearchHistory(10)
  })

  ipcMain.handle('clear-search-history', async () => {
    if (!db) return
    db.clearSearchHistory()
  })

  ipcMain.handle('get-search-suggestions', async (_, query: string) => {
    if (!db) return []
    return db.getSearchSuggestions(query, 5)
  })

  ipcMain.handle('get-music-by-id', async (_, id: number) => {
    if (!db) return null
    return db.getMusicById(id)
  })

  ipcMain.handle('get-existing-music-ids', async (_, ids: number[]) => {
    if (!db) return []
    return db.getExistingMusicIds(ids)
  })

  // 获取音乐的详细音频信息（包括 VBR）
  ipcMain.handle('get-music-audio-info', async (_, musicId: number) => {
    if (!db) return null
    const music = db.getMusicById(musicId)
    if (!music || !music.filePath) return null

    try {
      // 动态加载 music-metadata
      const musicMetadata = await import('music-metadata')
      const parseFile = musicMetadata.parseFile
      const metadata = await parseFile(music.filePath)

      // 检测 VBR
      let isVBR = false
      let codecProfile = null
      if (metadata.format.codecProfile) {
        codecProfile = metadata.format.codecProfile
        isVBR = /VBR|V0|V1|V2|V3|V4|V5|V6|V7|V8|V9/i.test(codecProfile)
      }
      // 如果 bitrate 为 0，也可能是 VBR
      if (!metadata.format.bitrate || metadata.format.bitrate === 0) {
        isVBR = true
      }

      return {
        bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : music.bitrate,
        sampleRate: metadata.format.sampleRate || music.sampleRate,
        channels: metadata.format.numberOfChannels || music.channels,
        isVBR,
        codecProfile: codecProfile || null
      }
    } catch (error) {
      console.error('解析音频信息失败:', error)
      // 返回数据库中的基本信息
      return {
        bitrate: music.bitrate,
        sampleRate: music.sampleRate,
        channels: music.channels,
        isVBR: false,
        codecProfile: null
      }
    }
  })

  ipcMain.handle('record-play', async (_, musicId: number) => {
    if (!db) return
    // 使用新的基于 music_id 的方法
    db.addToRecentPlaysByMusicId(musicId)
    // 更新播放统计
    const music = db.getAllMusicById(musicId)
    if (music) {
      db.updateAllMusic(musicId, {
        play_count: (music.playCount || 0) + 1,
        last_played_at: new Date().toISOString()
      })
    }
  })

  // 播放列表
  ipcMain.handle('create-playlist', async (_, name: string, description?: string) => {
    if (!db) throw new Error('数据库未初始化')
    return db.createPlaylist(name, description)
  })

  ipcMain.handle('update-playlist', async (_, id: number, updates: any) => {
    if (!db) return
    db.updatePlaylist(id, updates)
  })

  // 设置歌单封面：本地图片 / 歌曲封面 / 默认
  ipcMain.handle('set-playlist-cover', async (_, playlistId: number, source: any) => {
    if (!db) throw new Error('数据库未初始化')
    return setPlaylistCover(db, playlistId, source)
  })

  // 获取歌单内可作为封面的歌曲列表（有封面图，分页，每页最多 100）
  ipcMain.handle('get-playlist-cover-candidates', async (_, playlistId: number, options?: { page?: number; pageSize?: number }) => {
    if (!db) return { items: [], page: 1, pageSize: 100, hasMore: false }
    return getPlaylistCoverCandidates(db, playlistId, options)
  })

  ipcMain.handle('delete-playlist', async (_, id: number) => {
    if (!db) return
    db.deletePlaylist(id)
  })

  ipcMain.handle('get-playlists', () => {
    if (!db) return []
    return db.getPlaylists()
  })

  ipcMain.handle('update-playlist-order', (_, playlistIds: number[]) => {
    if (!db) return
    db.updatePlaylistOrder(playlistIds)
  })

  ipcMain.handle('add-to-playlist', async (_, playlistId: number, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')

    // 检查歌单是否存在
    const playlist = db.getPlaylistById(playlistId)
    if (!playlist) {
      throw new Error('歌单不存在')
    }

    // 检查音乐是否存在
    const music = db.getMusicById(musicId)
    if (!music) {
      throw new Error('音乐不存在')
    }

    // 检查是否已在歌单中（使用现有的 IPC handler 逻辑）
    const stmt = db['db']!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ? AND music_id = ?')
    const result = stmt.get(playlistId, musicId) as { count: number }
    if (result.count > 0) {
      throw new Error('该歌曲已存在于该歌单中')
    }

    // 添加到歌单
    db.addToPlaylistByMusicId(playlistId, musicId)
    return { success: true }
  })

  // 批量添加到歌单 - 优化性能（v1.0.6 使用 music_id）
  ipcMain.handle('batch-add-to-playlist', async (event, playlistId: number, musicIds: number[]) => {
    if (!db) return { success: false, added: 0, skipped: 0, total: 0 }

    const total = musicIds.length
    let added = 0
    let skipped = 0

    try {
      // 分批处理，每批50个，避免UI卡顿
      const batchSize = 50
      for (let i = 0; i < musicIds.length; i += batchSize) {
        const batch = musicIds.slice(i, Math.min(i + batchSize, musicIds.length))

        // 处理当前批次
        for (const musicId of batch) {
          try {
            db.addToPlaylistByMusicId(playlistId, musicId)
            added++
          } catch (error) {
            // 跳过已存在的歌曲
            skipped++
          }
        }

        // 发送进度更新
        const current = Math.min(i + batchSize, musicIds.length)
        setImmediate(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('batch-add-progress', {
              current,
              total,
              added,
              skipped
            })
          }
        })

        // 让出主线程，避免阻塞
        await new Promise(resolve => setImmediate(resolve))
      }

      return { success: true, added, skipped, total }
    } catch (error) {
      console.error('批量添加失败:', error)
      return { success: false, added, skipped, total }
    }
  })

  // 批量从歌单删除（v1.0.6 使用 music_id）
  ipcMain.handle('batch-remove-from-playlist', async (_, playlistId: number, musicIds: number[]) => {
    if (!db) return { success: false, removed: 0 }
    let removed = 0
    musicIds.forEach(musicId => {
      try {
        db.removeFromPlaylistByMusicId(playlistId, musicId)
        removed++
      } catch (error) {
        console.error(`Failed to remove musicId: ${musicId}`, error)
      }
    })
    return { success: true, removed }
  })

  ipcMain.handle('is-file-in-playlist', async (_, musicId: number, playlistId?: number) => {
    if (!db) return false
    if (playlistId !== undefined) {
      const stmt = db['db']!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ? AND music_id = ?')
      const result = stmt.get(playlistId, musicId) as { count: number }
      return result.count > 0
    } else {
      const stmt = db['db']!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE music_id = ?')
      const result = stmt.get(musicId) as { count: number }
      return result.count > 0
    }
  })

  ipcMain.handle('get-playlists-for-file', async (_, musicId: number) => {
    if (!db) return []
    const stmt = db['db']!.prepare('SELECT DISTINCT playlist_id FROM playlist_item WHERE music_id = ?')
    const rows = stmt.all(musicId) as Array<{ playlist_id: number }>
    return rows.map(row => row.playlist_id)
  })

  ipcMain.handle('remove-from-playlist-by-path', async (_, playlistId: number, musicId: number) => {
    if (!db) return
    db.removeFromPlaylistByMusicId(playlistId, musicId)
  })

  ipcMain.handle('get-playlist-songs', async (_, playlistId: number) => {
    if (!db) return []
    // 使用新的基于 music_id 的方法
    const songs = db.getPlaylistSongsByMusicId(playlistId)
    return songs.map(item => {
      const { fullPath, position, ...musicItem } = item
      return musicItem as MusicItem
    })
  })

  // 歌单歌曲（分页）
  ipcMain.handle('get-playlist-songs-paginated', (_, playlistId: number, offset: number, limit: number) => {
    if (!db) return []
    return db.getPlaylistSongsPaginated(playlistId, offset, limit)
  })

  ipcMain.handle('get-playlist-songs-count', (_, playlistId: number) => {
    if (!db) return 0
    return db.getPlaylistSongsCount(playlistId)
  })

  // 收藏（v1.0.6 使用 music_id）
  ipcMain.handle('toggle-favorite', async (_, musicId: number) => {
    if (!db) return false
    if (db.isFavoriteByMusicId(musicId)) {
      db.removeFromFavoritesByMusicId(musicId)
    } else {
      db.addToFavoritesByMusicId(musicId)
    }
    // 返回最新状态，减少渲染层二次查询导致的延迟
    return db.isFavoriteByMusicId(musicId)
  })

  ipcMain.handle('is-file-favorite', async (_, musicId: number) => {
    if (!db) return false
    return db.isFavoriteByMusicId(musicId)
  })

  // 收藏功能（v1.0.6 使用 music_id）
  ipcMain.handle('get-favorites', () => {
    if (!db) return []
    return db.getFavoritesByMusicId()
  })

  // 收藏功能（分页）
  ipcMain.handle('get-favorites-paginated', (_, offset: number, limit: number) => {
    if (!db) return []
    // TODO: 实现基于 music_id 的分页方法
    const allFavorites = db.getFavoritesByMusicId()
    return allFavorites.slice(offset, offset + limit)
  })

  ipcMain.handle('get-favorites-count', () => {
    if (!db) return 0
    return db.getFavoritesCount()
  })

  // 播放历史（v1.0.6 使用 music_id）
  ipcMain.handle('get-recent-plays', (_, limit?: number) => {
    if (!db) return []
    return db.getRecentPlaysByMusicId(limit)
  })

  ipcMain.handle('clear-play-history', async () => {
    if (!db) return
    db.clearPlayHistory()
  })

  // 清空列表
  ipcMain.handle('clear-local-music', async () => {
    if (!db) return
    // 「清除所有」：除 settings 与配置目录外清空库表（曲目/歌单/收藏/队列等）
    db.clearAllExceptSettings()
  })

  /** 清理本地音乐中磁盘文件已不存在的曲库记录 */
  ipcMain.handle('cleanup-missing-local-music', async () => {
    if (!db) throw new Error('数据库未初始化')
    return db.cleanupMissingLocalMusic()
  })

  ipcMain.handle('clear-favorites', async () => {
    if (!db) return
    db.clearFavorites()
  })

  ipcMain.handle('clear-recent-plays', async () => {
    if (!db) return
    db.clearRecentPlays()
  })

  ipcMain.handle('clear-playlist', async (_, playlistId: number) => {
    if (!db) return
    db.clearPlaylist(playlistId)
  })

  // 音乐目录
  // ========== local_music_dir 管理（v1.0.6 新架构） ==========

  ipcMain.handle('local-music-dir:add', async (_, path: string, displayOrder?: number) => {
    if (!db) {
      throw new Error('数据库未初始化')
    }
    try {
      return db.addLocalMusicDir(path, displayOrder)
    } catch (error: any) {
      throw new Error(error.message || '添加扫描目录失败')
    }
  })

  ipcMain.handle('local-music-dir:delete', async (_, id: number, options?: { removeScannedFiles?: boolean }) => {
    if (!db) {
      throw new Error('数据库未初始化')
    }
    try {
      return db.deleteLocalMusicDir(id, options)
    } catch (error: any) {
      throw new Error(error.message || '删除扫描目录失败')
    }
  })

  ipcMain.handle('local-music-dir:update', async (_, id: number, updates: {
    path?: string
    display_order?: number
    enabled?: boolean
  }) => {
    if (!db) {
      throw new Error('数据库未初始化')
    }
    try {
      return db.updateLocalMusicDir(id, updates)
    } catch (error: any) {
      throw new Error(error.message || '更新扫描目录失败')
    }
  })

  ipcMain.handle('local-music-dir:get-all', async (_, options?: {
    enabled?: boolean
    sortBy?: 'display_order' | 'created_at' | 'path'
    order?: 'ASC' | 'DESC'
  }) => {
    if (!db) return []
    return db.getAllLocalMusicDirs(options)
  })

  ipcMain.handle('local-music-dir:get-enabled', () => {
    if (!db) return []
    return db.getEnabledLocalMusicDirs()
  })

  ipcMain.handle('local-music-dir:get-by-id', async (_, id: number) => {
    if (!db) return null
    return db.getLocalMusicDirById(id)
  })

  ipcMain.handle('local-music-dir:update-orders', async (_, orders: Record<number, number>) => {
    if (!db) return
    db.updateLocalMusicDirOrders(orders)
  })

  ipcMain.handle('local-music-dir:validate', async (_, path: string) => {
    if (!db) {
      throw new Error('数据库未初始化')
    }
    try {
      await db.validateDirectoryPath(path)
      return { valid: true }
    } catch (error: any) {
      return { valid: false, error: error.message || '路径验证失败' }
    }
  })

  // ========== 音乐目录管理（旧版，保留兼容） ==========

  ipcMain.handle('get-music-directories', () => {
    if (!db) return []
    return db.getMusicDirectories()
  })

  ipcMain.handle('add-music-directory', async (_, directory: any) => {
    if (!db) throw new Error('数据库未初始化')
    return db.addMusicDirectory(directory)
  })

  ipcMain.handle('update-music-directory', async (_, id: string, updates: any) => {
    if (!db) return
    db.updateMusicDirectory(id, updates)
  })

  ipcMain.handle('delete-music-directory', async (_, id: string) => {
    if (!db) return
    db.deleteMusicDirectory(id)
  })

  // 设置（需要数据库，但使用默认值）
  const defaultSettings = {
    theme: 'light',
    language: 'zh',
    volume: 80,
    playMode: 'sequential'
  }

  ipcMain.handle('get-settings', () => {
    let settings: Record<string, any> = {}
    if (db) {
      try {
        settings = db.getAllSettings()
      } catch (error) {
        console.error('读取数据库设置失败，使用文件缓存:', error)
        settings = loadSettingsFromFile()
      }
    } else {
      settings = loadSettingsFromFile()
    }
    return { ...defaultSettings, ...settings }
  })

  ipcMain.handle('save-settings', async (_, settings: any) => {
    try {
      if (db) {
        for (const [key, value] of Object.entries(settings)) {
          db.setSetting(key, value)
        }
        console.log('✅ 设置已保存到数据库:', Object.keys(settings).join(', '))
      } else {
        saveSettingsToFile(settings)
        console.log('✅ 设置已保存到文件:', Object.keys(settings).join(', '))
      }
    } catch (error: any) {
      console.error('❌ 保存设置失败:', error?.message || error)
      throw error
    }
  })

  // ID3标签修复
  const id3Fixer = new ID3Fixer()

  ipcMain.handle('read-raw-id3-tags', async (_, filePath: string) => {
    return await id3Fixer.readRawID3Tags(filePath)
  })

  ipcMain.handle('convert-id3-tags-encoding', async (_, rawTags: any, sourceEncoding: string) => {
    // 验证编码类型
    const validEncodings = ['utf8', 'gbk', 'gb2312', 'big5', 'utf16le', 'latin1'] as const
    if (!validEncodings.includes(sourceEncoding as any)) {
      throw new Error(`不支持的编码类型: ${sourceEncoding}`)
    }
    return id3Fixer.convertID3TagsEncoding(rawTags, sourceEncoding as 'utf8' | 'gbk' | 'gb2312' | 'big5' | 'utf16le' | 'latin1')
  })

  ipcMain.handle('detect-id3-encoding', async (_, filePath: string) => {
    return await id3Fixer.detectEncoding(filePath)
  })

  ipcMain.handle('fix-id3-tags', async (_, filePath: string, sourceEncoding: string, fields?: any) => {
    const result = await id3Fixer.fixID3Tags(filePath, sourceEncoding as any, fields)

    if (result.success && result.fixedTags && db) {
      // 更新数据库
      const yearNum = result.fixedTags.year != null ? parseInt(result.fixedTags.year, 10) : undefined
      db.updateMusicByPath(filePath, {
        title: result.fixedTags.title,
        artist: result.fixedTags.artist,
        album: result.fixedTags.album,
        year: yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined,
        genre: result.fixedTags.genre
      })

      // 通知前端刷新
      mainWindow.webContents.send('music-updated', filePath)
    }

    return result
  })

  ipcMain.handle('fix-id3-tags-batch', async (_, filePaths: string[], sourceEncoding: string, fields?: any) => {
    const result = await id3Fixer.fixID3TagsBatch(filePaths, sourceEncoding as any, fields, (current, total) => {
      mainWindow.webContents.send('id3-fix-progress', { current, total })
    })

    if (db && result.results) {
      // 批量更新数据库
      for (const item of result.results) {
        if (item.success && item.fixedTags) {
          const yearNum = item.fixedTags.year != null ? parseInt(item.fixedTags.year, 10) : undefined
          db.updateMusicByPath(item.filePath, {
            title: item.fixedTags.title,
            artist: item.fixedTags.artist,
            album: item.fixedTags.album,
            year: yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined,
            genre: item.fixedTags.genre
          })
        }
      }

      // 批量操作后通知前端刷新整个列表
      mainWindow.webContents.send('music-list-refresh')
    }

    return result
  })

  // ========== 歌词功能 ==========

  ipcMain.handle('load-lyrics', async (_, musicId: number) => {
    if (!db) {
      console.warn('⚠️ 加载歌词失败：数据库未初始化')
      return null
    }

    const music = db.getMusicById(musicId)
    if (!music) {
      console.warn(`⚠️ 加载歌词失败：音乐记录不存在 (id=${musicId})`)
      return null
    }

    const parseWithOffset = (lyrics: LyricsData): LyricsData => {
      // 用户手动校准的每曲偏移（毫秒）叠加在歌词自带 offset 之上；
      // 读取端也做 NaN 防护 + 钳制，避免库中脏值/异常大值把歌词整体推飞
      const raw = Number(music.lyricsOffset)
      const manualMs = Number.isFinite(raw) ? Math.max(-30000, Math.min(30000, raw)) : 0
      if (!lyrics?.lines || manualMs === 0) return lyrics
      return {
        ...lyrics,
        lines: lyrics.lines.map((l) => ({ ...l, time: l.time + manualMs / 1000 }))
      }
    }

    console.log(`🔍 加载歌词：音乐ID=${musicId}, 文件路径=${music.filePath}`)

    // 1. 如果数据库中有歌词路径，直接使用
    if (music.lyricsPath && existsSync(music.lyricsPath)) {
      console.log(`✅ 使用数据库中的歌词路径: ${music.lyricsPath}`)
      try {
        return parseWithOffset(lyricsService.parseLyrics(music.lyricsPath))
      } catch (error) {
        console.error('❌ 解析歌词文件失败:', error)
        // 如果解析失败，继续尝试自动查找
      }
    }

    // 2. 自动查找同目录下的歌词文件
    if (!music.filePath) {
      console.warn('⚠️ 音乐文件路径为空，无法查找歌词')
      return null
    }

    console.log(`🔍 自动查找歌词文件：${music.filePath}`)
    const lyricsPath = lyricsService.findLyricsFile(music.filePath)
    if (lyricsPath) {
      try {
        console.log(`✅ 找到歌词文件，开始解析: ${lyricsPath}`)
        const lyrics = lyricsService.parseLyrics(lyricsPath)

        // 保存歌词路径到数据库（使用 updateAllMusic 因为这是新架构）
        db.updateAllMusic(musicId, { lyrics_path: lyricsPath })
        console.log(`✅ 歌词已解析并保存到数据库，共 ${lyrics.lines?.length || 0} 行`)
        return parseWithOffset(lyrics)
      } catch (error: any) {
        console.error('❌ 解析歌词文件失败:', error?.message || error)
      }
    } else {
      console.log(`⚠️ 未找到歌词文件：${music.filePath}`)
    }

    return null
  })

  ipcMain.handle('parse-lyrics-file', async (_, filePath: string) => {
    if (!existsSync(filePath)) {
      throw new Error('歌词文件不存在')
    }
    try {
      return lyricsService.parseLyrics(filePath)
    } catch (error: any) {
      throw new Error(`解析歌词文件失败: ${error.message}`)
    }
  })

  ipcMain.handle('update-music-lyrics-path', async (_, musicId: number, lyricsPath: string) => {
    if (!db) return
    db.updateMusic(musicId, { lyricsPath })
  })

  /** 保存用户手动校准的歌词时间偏移（毫秒） */
  ipcMain.handle('update-music-lyrics-offset', async (_, musicId: number, offsetMs: number) => {
    if (!db) return
    const ms = Math.round(Number(offsetMs) || 0)
    db.updateAllMusic(musicId, { lyrics_offset: Math.max(-30000, Math.min(30000, ms)) })
  })

  /** 单曲匹配 / 重新匹配歌词 */
  ipcMain.handle('match-lyrics', async (_, musicId: number, options?: { force?: boolean }) => {
    if (!db) throw new Error('数据库未初始化')
    return withLyricsMatchLock(async () => {
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      return lyricsMatchService.matchOne(db, music, { force: options?.force === true })
    })
  })

  /** 仅关联同目录 .lrc（无在线搜索） */
  ipcMain.handle('link-local-lyrics', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    return withLyricsMatchLock(async () => {
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      return lyricsMatchService.linkLocalLyrics(db, music)
    })
  })

  /** 搜索在线歌词候选（供手动选择；持锁避免与批量/单曲 apply 并发抢服务） */
  ipcMain.handle('search-lyrics-candidates', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    return withLyricsMatchLock(async () => {
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      return {
        hasExistingLyrics: lyricsMatchService.hasExistingLyrics(music),
        candidates: await lyricsMatchService.searchCandidates(music)
      }
    })
  })

  /** 预览候选歌词文本（供选择对话框展示，不写文件/不写库） */
  ipcMain.handle('preview-lyrics-candidate', async (_, songId: number) => {
    return lyricsMatchService.previewLyric(songId)
  })

  /** 应用用户选中的候选歌词 */
  ipcMain.handle('apply-lyrics-candidate', async (_, musicId: number, songId: number) => {
    if (!db) throw new Error('数据库未初始化')
    return withLyricsMatchLock(async () => {
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      return lyricsMatchService.applyCandidate(db, music, songId)
    })
  })

  /** 统计本地库中无歌词歌曲数量 */
  ipcMain.handle('get-music-without-lyrics-count', async () => {
    if (!db) return 0
    return db.getMusicWithoutLyricsCount()
  })

  /**
   * 批量匹配本地库全部无歌词歌曲
   * 进度通过 lyrics-match-progress 事件推送；结束发 lyrics-match-finished
   */
  ipcMain.handle('batch-match-missing-lyrics', async () => {
    if (!db) throw new Error('数据库未初始化')
    return withLyricsMatchLock(async () => {
      lyricsMatchService.resetCancel()
      batchLyricsMatchActive = true
      lyricsMatchLastProgress = null

      try {
        const pageSize = 100
        const songs: MusicItem[] = []
        const seen = new Set<number>()

        let offset = 0
        while (true) {
          const page = db.getMusicWithoutLyrics(offset, pageSize)
          if (page.length === 0) break
          for (const m of page) {
            if (!seen.has(m.id)) {
              seen.add(m.id)
              songs.push(m)
            }
          }
          offset += page.length
          if (page.length < pageSize) break
        }

        // 路径写在库里但文件已丢失 → 一并纳入批量匹配
        offset = 0
        while (true) {
          const page = db.getMusicWithClaimedLyricsPath(offset, pageSize)
          if (page.length === 0) break
          for (const m of page) {
            if (seen.has(m.id)) continue
            if (m.lyricsPath && !existsSync(m.lyricsPath)) {
              seen.add(m.id)
              songs.push(m)
            }
          }
          offset += page.length
          if (page.length < pageSize) break
        }

        if (songs.length === 0) {
          const empty: LyricsMatchSummary = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            cancelled: false,
            results: []
          }
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lyrics-match-finished', empty)
          }
          return empty
        }

        const summary = await lyricsMatchService.matchBatch(db, songs, {
          force: false,
          onProgress: (progress: LyricsMatchProgress) => {
            lyricsMatchLastProgress = progress
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('lyrics-match-progress', progress)
            }
          }
        })

        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('music-list-refresh')
          mainWindow.webContents.send('lyrics-match-finished', summary)
        }
        return summary
      } finally {
        batchLyricsMatchActive = false
        lyricsMatchLastProgress = null
      }
    })
  })

  ipcMain.handle('get-lyrics-match-state', async () => {
    return {
      isRunning: batchLyricsMatchActive,
      progress: lyricsMatchLastProgress
    }
  })

  ipcMain.handle('cancel-lyrics-match', async () => {
    lyricsMatchService.cancel()
    return true
  })

  /** 单曲自动匹配封面（≥50；列表右键已改走候选弹窗） */
  ipcMain.handle('match-cover', async (_, musicId: number, options?: { force?: boolean }) => {
    if (!db) throw new Error('数据库未初始化')
    return withCoverMatchLock(async () => {
      // 清除可能残留的批量取消标志，避免单曲匹配被误中止
      coverMatchService.resetCancel()
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      const result = await coverMatchService.matchOne(db, music, { force: options?.force === true })
      if (result.status === 'matched' && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('music-list-refresh')
        mainWindow.webContents.send('cover-matched', {
          musicId: result.musicId,
          coverPath: result.coverPath,
          fileNotUpdated: result.fileNotUpdated === true
        })
      }
      return result
    })
  })

  /** 单曲是否有有效封面（路径存在且可读） */
  ipcMain.handle('has-valid-cover', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    const music = db.getMusicById(musicId)
    if (!music) throw new Error('音乐不存在')
    return coverMatchService.hasValidCover(music)
  })

  /** 列出封面候选（不设相似度下限；持锁避免与批量/单曲 apply 并发抢服务） */
  ipcMain.handle('list-cover-candidates', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    return withCoverMatchLock(async () => {
      const music = db.getMusicById(musicId)
      if (!music) throw new Error('音乐不存在')
      return {
        hasValidCover: coverMatchService.hasValidCover(music),
        candidates: await coverMatchService.searchCandidates(music)
      }
    })
  })

  /** 应用用户选中的封面候选 */
  ipcMain.handle(
    'apply-cover-candidate',
    async (
      _,
      musicId: number,
      songId: number,
      options?: { coverUrl?: string; force?: boolean }
    ) => {
      if (!db) throw new Error('数据库未初始化')
      return withCoverMatchLock(async () => {
        // 清除可能残留的批量取消标志，避免候选应用被误中止
        coverMatchService.resetCancel()
        const music = db.getMusicById(musicId)
        if (!music) throw new Error('音乐不存在')
        const result: CoverMatchResult = await coverMatchService.applyCandidate(
          db,
          music,
          songId,
          options || {}
        )
        if (result.status === 'matched' && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('music-list-refresh')
          mainWindow.webContents.send('cover-matched', {
            musicId: result.musicId,
            coverPath: result.coverPath,
            fileNotUpdated: result.fileNotUpdated === true
          })
        }
        return result
      })
    }
  )

  /** 应用用户选择的本地图片为封面 */
  ipcMain.handle(
    'apply-local-cover',
    async (_, musicId: number, localPath: string, options?: { force?: boolean }) => {
      if (!db) throw new Error('数据库未初始化')
      return withCoverMatchLock(async () => {
        coverMatchService.resetCancel()
        const music = db.getMusicById(musicId)
        if (!music) throw new Error('音乐不存在')
        const result: CoverMatchResult = await coverMatchService.applyLocalFile(
          db,
          music,
          localPath,
          options || {}
        )
        if (result.status === 'matched' && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('music-list-refresh')
          mainWindow.webContents.send('cover-matched', {
            musicId: result.musicId,
            coverPath: result.coverPath,
            fileNotUpdated: result.fileNotUpdated === true
          })
        }
        return result
      })
    }
  )

  /** 统计无有效封面歌曲数 */
  ipcMain.handle('get-music-without-cover-count', async () => {
    if (!db) return 0
    return db.getMusicWithoutCoverCount()
  })

  /**
   * 批量匹配本地库全部无有效封面歌曲
   * 进度 cover-match-progress；结束 cover-match-finished
   */
  ipcMain.handle('batch-match-missing-covers', async () => {
    if (!db) throw new Error('数据库未初始化')
    return withCoverMatchLock(async () => {
      coverMatchService.resetCancel()
      batchCoverMatchActive = true
      coverMatchLastProgress = null

      const sendCancelledSummary = (): CoverMatchSummary => {
        const cancelled: CoverMatchSummary = {
          total: 0,
          success: 0,
          failed: 0,
          skipped: 0,
          writtenToFile: 0,
          dbOnly: 0,
          cancelled: true,
          results: []
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cover-match-finished', cancelled)
        }
        return cancelled
      }

      try {
        const pageSize = 100
        const songs: MusicItem[] = []
        const seen = new Set<number>()

        // 阶段一：cover_path 为空的歌曲
        let offset = 0
        while (true) {
          if (coverMatchService.isCancelled()) return sendCancelledSummary()
          const page = db.getMusicWithoutCover(offset, pageSize)
          if (page.length === 0) break
          for (const m of page) {
            if (!seen.has(m.id)) {
              seen.add(m.id)
              songs.push(m)
            }
          }
          offset += page.length
          if (page.length < pageSize) break
        }

        // 阶段二：库里有 cover_path 但磁盘文件已丢失
        offset = 0
        while (true) {
          if (coverMatchService.isCancelled()) return sendCancelledSummary()
          const page = db.getMusicWithClaimedCoverPath(offset, pageSize)
          if (page.length === 0) break
          for (const m of page) {
            if (seen.has(m.id)) continue
            if (m.coverPath && !existsSync(m.coverPath)) {
              seen.add(m.id)
              songs.push(m)
            }
          }
          offset += page.length
          if (page.length < pageSize) break
        }

        if (coverMatchService.isCancelled()) return sendCancelledSummary()

        if (songs.length === 0) {
          const empty: CoverMatchSummary = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            writtenToFile: 0,
            dbOnly: 0,
            cancelled: false,
            results: []
          }
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cover-match-finished', empty)
          }
          return empty
        }

        // 枚举阶段用户可能已 cancel；resetCancel: false 保留取消标志，避免 matchBatch 开头清掉
        const summary = await coverMatchService.matchBatch(db, songs, {
          force: false,
          resetCancel: false,
          onProgress: (progress: CoverMatchProgress) => {
            coverMatchLastProgress = progress
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('cover-match-progress', progress)
            }
          }
        })

        if (!mainWindow.isDestroyed()) {
          // 逐条通知渲染进程刷新封面（playerStore 仅更新 id 匹配的当前曲/队列项）
          for (const r of summary.results) {
            if (r.status === 'matched' && r.coverPath) {
              mainWindow.webContents.send('cover-matched', {
                musicId: r.musicId,
                coverPath: r.coverPath,
                fileNotUpdated: r.fileNotUpdated === true
              })
            }
          }
          mainWindow.webContents.send('music-list-refresh')
          mainWindow.webContents.send('cover-match-finished', summary)
        }
        return summary
      } finally {
        batchCoverMatchActive = false
        coverMatchLastProgress = null
      }
    })
  })

  ipcMain.handle('get-cover-match-state', async () => {
    return {
      isRunning: batchCoverMatchActive,
      progress: coverMatchLastProgress
    }
  })

  ipcMain.handle('cancel-cover-match', async () => {
    coverMatchService.cancel()
    return true
  })

  ipcMain.handle('delete-music-file', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    const music = db.getMusicById(musicId)
    if (!music) throw new Error('音乐不存在')

    // 仅允许删除已登记扫描目录下的文件
    const dirs = db.getAllLocalMusicDirs()
    const { resolve, normalize, sep } = await import('path')
    const resolved = normalize(resolve(music.filePath))
    const allowed = dirs.some((d) => {
      if (!d.path) return false
      const root = normalize(resolve(d.path))
      const fileCmp = process.platform === 'win32' ? resolved.toLowerCase() : resolved
      const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root
      return fileCmp === rootCmp || fileCmp.startsWith(rootCmp.endsWith(sep) ? rootCmp : rootCmp + sep)
    })
    if (!allowed) {
      throw new Error('文件不在已登记的扫描目录内，拒绝删除')
    }

    const { unlink } = await import('fs/promises')
    try {
      await unlink(music.filePath)
    } catch (error: any) {
      throw new Error(`删除文件失败: ${error.message}`)
    }

    db.deleteAllMusic(musicId)
    return true
  })

  // 导出音乐文件
  ipcMain.handle('export-music-files', async (_, musicIds: number[], options?: any) => {
    if (!db) throw new Error('数据库未初始化')

    let targetDir = options?.targetDir as string | undefined

    // 未指定目录时弹出选择框
    if (!targetDir) {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择导出目录'
      })

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null
      }
      targetDir = result.filePaths[0]
    }

    const exporter = new FileExporter(db)
    const exportResult = await exporter.exportMusicFiles(musicIds, targetDir, {
      organizeBy: options?.organizeBy,
      conflictAction: options?.conflictAction ?? 'overwrite',
      onProgress: (progress) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('export-music-progress', progress)
        }
      }
    })

    return exportResult
  })

  // 快捷键管理
  if (shortcutManager) {
    // 初始化快捷键（从设置中加载）
    ipcMain.handle('get-shortcut-config', async () => {
      let settings: Record<string, any> = {}
      if (db) {
        try {
          settings = db.getAllSettings()
        } catch (error) {
          settings = loadSettingsFromFile()
        }
      } else {
        settings = loadSettingsFromFile()
      }
      return settings.shortcuts || {}
    })

    ipcMain.handle('save-shortcut-config', async (_, shortcuts: ShortcutConfig) => {
      if (db) {
        db.setSetting('shortcuts', shortcuts)
      } else {
        const settings = loadSettingsFromFile()
        settings.shortcuts = shortcuts
        saveSettingsToFile(settings)
      }
    })

    ipcMain.handle('get-default-shortcuts', () => {
      return shortcutManager.getDefaultShortcuts()
    })

    ipcMain.handle('register-shortcut', async (_, action: string, accelerator: string) => {
      if (!shortcutManager) return false

      // 解析 accelerator（从显示格式转换为 Electron 格式）
      const parsedAccelerator = shortcutManager.parseAccelerator(accelerator)

      // 创建处理函数
      const handler = () => {
        // 发送消息到渲染进程来执行操作
        mainWindow?.webContents.send('shortcut-action', action)
      }

      return shortcutManager.register(action, parsedAccelerator, handler)
    })

    ipcMain.handle('unregister-shortcut', async (_, action: string) => {
      if (!shortcutManager) return
      shortcutManager.unregister(action)
    })

    ipcMain.handle('register-all-shortcuts', async (_, shortcuts: ShortcutConfig) => {
      if (!shortcutManager) {
        console.warn('⚠️ [注册快捷键] shortcutManager 未初始化')
        return false
      }

      console.log(`📝 [注册快捷键] 开始注册 ${Object.keys(shortcuts).length} 个快捷键`)

      // 创建处理函数映射
      const handlers: Record<string, () => void> = {
        'play-pause': () => {
          console.log(`📤 [IPC发送] shortcut-action: play-pause`)
          mainWindow?.webContents.send('shortcut-action', 'play-pause')
        },
        'previous': () => {
          console.log(`📤 [IPC发送] shortcut-action: previous`)
          mainWindow?.webContents.send('shortcut-action', 'previous')
        },
        'next': () => {
          console.log(`📤 [IPC发送] shortcut-action: next`)
          mainWindow?.webContents.send('shortcut-action', 'next')
        },
        'toggle-favorite': () => {
          console.log(`📤 [IPC发送] shortcut-action: toggle-favorite`)
          mainWindow?.webContents.send('shortcut-action', 'toggle-favorite')
        }
      }

      // 转换快捷键格式
      const parsedShortcuts: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(shortcuts)) {
        if (!APP_SHORTCUT_ACTIONS.includes(action as any)) continue
        if (accelerator) {
          parsedShortcuts[action] = shortcutManager.parseAccelerator(accelerator)
        }
      }

      shortcutManager.registerAll(parsedShortcuts, handlers)

      // 保存配置
      if (db) {
        db.setSetting('shortcuts', shortcuts)
      } else {
        const settings = loadSettingsFromFile()
        settings.shortcuts = shortcuts
        saveSettingsToFile(settings)
      }

      return true
    })

    ipcMain.handle('check-shortcut-available', async (_, accelerator: string) => {
      if (!shortcutManager) return false
      const parsedAccelerator = shortcutManager.parseAccelerator(accelerator)
      return shortcutManager.isAvailable(parsedAccelerator)
    })

    // 加载并注册保存的快捷键
    ipcMain.handle('load-shortcuts', async () => {
      if (!shortcutManager) {
        console.warn('⚠️ [加载快捷键] shortcutManager 未初始化')
        return false
      }

      console.log('📥 [加载快捷键] 开始加载快捷键配置...')

      let shortcuts: ShortcutConfig = {}
      let settings: any = {}
      if (db) {
        try {
          settings = db.getAllSettings()
          console.log('📥 [加载快捷键] 从数据库加载设置')
        } catch (error) {
          settings = loadSettingsFromFile()
          console.log('📥 [加载快捷键] 从文件加载设置')
        }
      } else {
        settings = loadSettingsFromFile()
        console.log('📥 [加载快捷键] 从文件加载设置（数据库未初始化）')
      }

      if (settings.shortcuts) {
        shortcuts = settings.shortcuts
        console.log(`📥 [加载快捷键] 使用保存的快捷键配置，共 ${Object.keys(shortcuts).length} 个`)
      } else {
        shortcuts = await shortcutManager.getDefaultShortcuts()
        console.log(`📥 [加载快捷键] 使用默认快捷键配置，共 ${Object.keys(shortcuts).length} 个`)
      }

      // 注册快捷键
      const handlers: Record<string, () => void> = {
        'play-pause': () => {
          console.log(`📤 [IPC发送] shortcut-action: play-pause`)
          mainWindow?.webContents.send('shortcut-action', 'play-pause')
        },
        'previous': () => {
          console.log(`📤 [IPC发送] shortcut-action: previous`)
          mainWindow?.webContents.send('shortcut-action', 'previous')
        },
        'next': () => {
          console.log(`📤 [IPC发送] shortcut-action: next`)
          mainWindow?.webContents.send('shortcut-action', 'next')
        },
        'toggle-favorite': () => {
          console.log(`📤 [IPC发送] shortcut-action: toggle-favorite`)
          mainWindow?.webContents.send('shortcut-action', 'toggle-favorite')
        }
      }

      const parsedShortcuts: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(shortcuts)) {
        if (!APP_SHORTCUT_ACTIONS.includes(action as any)) continue
        if (accelerator) {
          parsedShortcuts[action] = shortcutManager.parseAccelerator(accelerator)
        }
      }

      return shortcutManager.registerAll(parsedShortcuts, handlers)
    })
  }

  // 缓存管理
  ipcMain.handle('clear-cache', async () => {
    try {
      if (mainWindow) {
        await mainWindow.webContents.session.clearCache()
        await mainWindow.webContents.session.clearStorageData({
          storages: ['cachestorage', 'shadercache', 'serviceworkers']
        })
      }
      return true
    } catch (error) {
      console.error('清除缓存失败:', error)
      throw error
    }
  })


  // ========== 系统托盘功能 ==========
  if (trayService) {
    // 监听播放状态变化
    ipcMain.on('update-tray-play-state', (_, isPlaying: boolean) => {
      trayService.updatePlayState(isPlaying)
    })

    // 监听当前音乐变化
    ipcMain.on('update-tray-current-music', (_, music: { title: string; artist: string } | null) => {
      trayService.updateCurrentMusic(music)
    })

    // 监听托盘操作（通过webContents发送）
    mainWindow.webContents.on('did-finish-load', () => {
      // 这个事件监听器会在渲染进程发送消息时触发
    })
  }

  // ========== 元数据编辑功能 ==========
  ipcMain.handle('update-music-metadata', async (_, musicId: number, updates: any) => {
    if (!db) throw new Error('数据库未初始化')

    const music = db.getMusicById(musicId)
    if (!music) throw new Error('音乐不存在')

    try {
      // 更新文件中的 ID3 标签
      await metadataEditor.updateMetadata(music.filePath, updates)

      // 更新数据库（使用 all_music 表）
      const dbUpdates: any = {}
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.artist !== undefined) dbUpdates.artist = updates.artist
      if (updates.album !== undefined) dbUpdates.album = updates.album
      if (updates.year !== undefined) dbUpdates.year = updates.year
      if (updates.genre !== undefined) dbUpdates.genre = updates.genre
      if (updates.coverPath !== undefined) dbUpdates.cover_path = updates.coverPath

      if (Object.keys(dbUpdates).length > 0) {
        db.updateAllMusic(musicId, dbUpdates)
      }

      return true
    } catch (error: any) {
      throw new Error(`更新元数据失败: ${error.message}`)
    }
  })

  ipcMain.handle('batch-update-music-metadata', async (_, musicIds: number[], updates: any) => {
    if (!db) throw new Error('数据库未初始化')

    const filePaths: string[] = []
    for (const id of musicIds) {
      const music = db.getMusicById(id)
      if (music) {
        filePaths.push(music.filePath)
      }
    }

    if (filePaths.length === 0) {
      throw new Error('没有可更新的音乐')
    }

    try {
      // 批量更新文件中的 ID3 标签
      const result = await metadataEditor.batchUpdateMetadata(filePaths, updates, (current, total) => {
        mainWindow.webContents.send('batch-update-metadata-progress', { current, total })
      })

      // 更新数据库（使用 all_music 表）
      const dbUpdates: any = {}
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.artist !== undefined) dbUpdates.artist = updates.artist
      if (updates.album !== undefined) dbUpdates.album = updates.album
      if (updates.year !== undefined) dbUpdates.year = updates.year
      if (updates.genre !== undefined) dbUpdates.genre = updates.genre
      if (updates.coverPath !== undefined) dbUpdates.cover_path = updates.coverPath

      if (Object.keys(dbUpdates).length > 0) {
        for (const id of musicIds) {
          db.updateAllMusic(id, dbUpdates)
        }
      }

      return result
    } catch (error: any) {
      throw new Error(`批量更新元数据失败: ${error.message}`)
    }
  })

  // 仅同步元数据到数据库（不改写文件 ID3）
  // 用于列表显示乱码、但文件名/ID3 本身正确的场景
  ipcMain.handle('sync-music-metadata-to-db', async (_, musicId: number, updates: any) => {
    if (!db) throw new Error('数据库未初始化')
    try {
      return syncMusicMetadataToDb(db, musicId, {
        title: updates?.title,
        artist: updates?.artist,
        album: updates?.album,
        year: updates?.year,
        genre: updates?.genre
      })
    } catch (error: any) {
      throw new Error(`同步到数据库失败: ${error.message}`)
    }
  })

  // 批量：自动从文件名/ID3 解析后写入数据库
  ipcMain.handle('batch-sync-music-metadata-to-db', async (_, musicIds: number[]) => {
    if (!db) throw new Error('数据库未初始化')
    if (!Array.isArray(musicIds) || musicIds.length === 0) {
      throw new Error('没有可同步的音乐')
    }
    try {
      return await batchSyncMusicMetadataToDb(db, musicIds)
    } catch (error: any) {
      throw new Error(`批量同步到数据库失败: ${error.message}`)
    }
  })

  // 更新音乐播放状态（标记为不可播放及原因）
  ipcMain.handle('update-music-play-status', async (_, musicId: number, isPlayable: boolean, errorReason?: string) => {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    try {
      const updates: any = {
        is_playable: isPlayable ? 1 : 0,
        play_error_reason: errorReason || null,
        is_corrupted: isPlayable ? 0 : 1 // 如果不可播放，标记为损坏
      }

      db.updateAllMusic(musicId, updates)
      return { success: true }
    } catch (error: any) {
      console.error('更新播放状态失败:', error)
      throw new Error(`更新播放状态失败: ${error.message}`)
    }
  })

  ipcMain.handle('extract-music-cover', async (_, musicId: number, outputPath: string) => {
    if (!db) throw new Error('数据库未初始化')

    const music = db.getMusicById(musicId)
    if (!music) throw new Error('音乐不存在')

    try {
      await metadataEditor.extractCover(music.filePath, outputPath)
      return true
    } catch (error: any) {
      throw new Error(`提取封面失败: ${error.message}`)
    }
  })
}
