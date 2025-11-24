import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import MusicDatabase from '../database/db'
import FileScanner from '../services/fileScanner'
import ID3Fixer from '../services/id3Fixer'
import ExcelExporter from '../services/excelExporter'
import FileExporter from '../services/fileExporter'
import FileMonitor from '../services/fileMonitor'
import ShortcutManager from '../services/shortcutManager'
import LyricsService from '../services/lyricsService'
import TrayService from '../services/trayService'
import MetadataEditor from '../services/metadataEditor'
import { loadSettingsFromFile, saveSettingsToFile } from '../services/settingsStore'
import scanManager from '../services/scanManager'
import * as desktopLyrics from '../windows/desktopLyrics'
import type { ScanProgress, MusicItem } from '../../shared/types/music'
import type { ShortcutConfig } from '../../shared/types/settings'
import type { LyricsData } from '../../shared/types/lyrics'

export function setupIPC(db: MusicDatabase | null, mainWindow: BrowserWindow, fileMonitor: FileMonitor | null = null, shortcutManager: ShortcutManager | null = null, trayService: TrayService | null = null) {
  const lyricsService = new LyricsService()
  const metadataEditor = new MetadataEditor()
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

  ipcMain.handle('set-mini-mode', async (_, enabled: boolean) => {
    if (enabled) {
      // 进入迷你模式 - 只在normalBounds为null时保存当前窗口尺寸
      if (!normalBounds && !mainWindow.isFullScreen()) {
        normalBounds = mainWindow.getBounds()
      }
      mainWindow.setMinimumSize(300, 100)
      mainWindow.setSize(320, 480, true)
      mainWindow.setAlwaysOnTop(true)
    } else {
      // 退出迷你模式
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setMinimumSize(800, 600)
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

  // 文件操作（部分不依赖数据库）
  ipcMain.handle('select-music-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'multiSelections']
    })
    return result.filePaths
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

  // 文件读写（用于快捷键配置导入/导出）
  ipcMain.handle('read-file', async (_, filePath: string, encoding: string = 'utf-8') => {
    return readFileSync(filePath, encoding as BufferEncoding)
  })

  ipcMain.handle('write-file', async (_, filePath: string, content: string, encoding: string = 'utf-8') => {
    writeFileSync(filePath, content, encoding as BufferEncoding)
  })

  ipcMain.handle('show-save-dialog', async (_, options: any) => {
    const result = await dialog.showSaveDialog(mainWindow, options)
    return result.canceled ? null : result.filePath
  })

  // 扫描管理器状态
  let currentScanner: FileScanner | null = null

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
      return result
    } catch (error: any) {
      scanManager.setScanning(false)
      currentScanner = null
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
      if (currentScanner) {
        currentScanner.setPaused(true)
      }
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: true })
      return true
    }
    return false
  })

  ipcMain.handle('resume-scan', async () => {
    const state = scanManager.getState()
    if (state.isScanning && state.isPaused) {
      scanManager.resume()
      if (currentScanner) {
        currentScanner.setPaused(false)
      }
      mainWindow.webContents.send('scan-state-changed', { isScanning: true, isPaused: false })
      return true
    }
    return false
  })

  ipcMain.handle('cancel-scan', async () => {
    const state = scanManager.getState()
    if (state.isScanning) {
      scanManager.cancel()
      if (currentScanner) {
        currentScanner.setCancelled(true)
      }
      currentScanner = null
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
    return db.getMusicList(offset, limit)
  })

  ipcMain.handle('get-music-total-count', () => {
    if (!db) return 0
    return db.getMusicTotalCount()
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
    // 记录搜索历史
    const query = criteria.keyword || '高级搜索'
    db.addSearchHistory(query, 'advanced', criteria)
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

  ipcMain.handle('record-play', async (_, id: number) => {
    if (!db) return
    db.recordPlay(id)
  })

  ipcMain.handle('get-similar-music', async (_, musicId: number, limit?: number, minSimilarity?: number) => {
    if (!db) return []
    return db.getSimilarMusic(musicId, limit || 20, minSimilarity || 0.5)
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

  ipcMain.handle('add-to-playlist', async (_, playlistId: number, filePath: string) => {
    if (!db) return
    db.addToPlaylist(playlistId, filePath)
  })

  // 批量添加到歌单
  ipcMain.handle('batch-add-to-playlist', async (_, playlistId: number, filePaths: string[]) => {
    if (!db) return { success: false, added: 0 }
    let added = 0
    filePaths.forEach(filePath => {
      try {
        db.addToPlaylist(playlistId, filePath)
        added++
      } catch (error) {
        // 跳过已存在的歌曲
        console.log(`Skipped existing: ${filePath}`)
      }
    })
    return { success: true, added }
  })

  // 批量从歌单删除
  ipcMain.handle('batch-remove-from-playlist', async (_, playlistId: number, filePaths: string[]) => {
    if (!db) return { success: false, removed: 0 }
    let removed = 0
    filePaths.forEach(filePath => {
      try {
        db.removeFromPlaylistByPath(playlistId, filePath)
        removed++
      } catch (error) {
        console.error(`Failed to remove: ${filePath}`, error)
      }
    })
    return { success: true, removed }
  })

  ipcMain.handle('is-file-in-playlist', async (_, filePath: string, playlistId?: number) => {
    if (!db) return false
    return db.isFileInPlaylist(filePath, playlistId)
  })

  ipcMain.handle('get-playlists-for-file', async (_, filePath: string) => {
    if (!db) return []
    return db.getPlaylistsForFile(filePath)
  })

  ipcMain.handle('remove-from-playlist-by-path', async (_, playlistId: number, filePath: string) => {
    if (!db) return
    db.removeFromPlaylistByPath(playlistId, filePath)
  })

  ipcMain.handle('get-playlist-songs', async (_, playlistId: number) => {
    if (!db) return []
    return db.getPlaylistSongs(playlistId)
  })

  ipcMain.handle('export-playlist-json', async (_, playlistId: number) => {
    if (!db) throw new Error('数据库未初始化')
    const playlist = db.getPlaylistById(playlistId)
    if (!playlist) {
      throw new Error('歌单不存在')
    }

    const songs = db.getPlaylistSongs(playlistId)
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      playlist,
      songs: songs.map(song => ({
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        filePath: song.filePath,
        fileName: song.fileName,
        fileHash: song.fileHash
      }))
    }

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: '导出歌单 (JSON)',
      defaultPath: `${playlist.name}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return null
    }

    writeFileSync(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return saveResult.filePath
  })

  ipcMain.handle('import-playlist-json', async () => {
    if (!db) throw new Error('数据库未初始化')

    const openResult = await dialog.showOpenDialog(mainWindow, {
      title: '导入歌单 (JSON)',
      properties: ['openFile'],
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return null
    }

    const filePath = openResult.filePaths[0]
    const raw = readFileSync(filePath, 'utf-8')

    let data: any
    try {
      data = JSON.parse(raw)
    } catch (error) {
      throw new Error('JSON 文件格式错误')
    }

    const sourcePlaylist = data.playlist || {}
    const playlistName = sourcePlaylist.name
      ? `${sourcePlaylist.name} (导入于${new Date().toLocaleDateString()})`
      : `导入歌单_${Date.now()}`

    const playlistId = db.createPlaylist(playlistName, sourcePlaylist.description)
    let added = 0
    const missing: Array<{ title: string; artist?: string; filePath?: string; fileHash?: string }> = []

    for (const song of data.songs || []) {
      let music: MusicItem | null = null

      // 1. 优先通过 fileHash 匹配（最准确）
      if (song.fileHash) {
        const matches = db.getMusicByHash(song.fileHash)
        music = matches.length > 0 ? matches[0] : null
      }

      // 2. 通过 filePath 匹配
      if (!music && song.filePath) {
        music = db.getMusicByPath(song.filePath)
      }

      // 3. 通过标题和艺术家模糊匹配（改进的自动匹配）
      if (!music && song.title && song.artist) {
        // 使用高级搜索来匹配标题和艺术家
        const results = db.advancedSearch({
          keyword: song.title.trim(),
          artist: song.artist.trim(),
          limit: 10
        })
        if (results.length > 0) {
          // 找到最匹配的（标题和艺术家都匹配）
          const match = results.find(m =>
            m.title.toLowerCase().includes(song.title.trim().toLowerCase()) &&
            m.artist.toLowerCase().includes(song.artist.trim().toLowerCase())
          )
          if (match) {
            music = match
          } else {
            music = results[0]
          }
        }
      }

      // 4. 仅通过标题匹配（如果艺术家不匹配）
      if (!music && song.title) {
        const results = db.searchMusic(song.title.trim(), 5)
        if (results.length > 0) {
          music = results[0]
        }
      }

      if (music) {
        db.addToPlaylist(playlistId, music.filePath)
        added += 1
      } else if (song.filePath) {
        // 即使 music 表中没有，也添加到播放列表（基于文件路径）
        db.addToPlaylist(playlistId, song.filePath)
        added += 1
      } else {
        missing.push({
          title: song.title,
          artist: song.artist,
          filePath: song.filePath,
          fileHash: song.fileHash
        })
      }
    }

    return {
      playlistId,
      added,
      missing
    }
  })

  // 收藏
  ipcMain.handle('toggle-favorite', async (_, filePath: string) => {
    if (!db) return
    db.toggleFavorite(filePath)
  })

  ipcMain.handle('is-file-favorite', async (_, filePath: string) => {
    if (!db) return false
    return db.isFileFavorite(filePath)
  })

  ipcMain.handle('get-favorites', () => {
    if (!db) return []
    return db.getFavorites()
  })

  // 播放历史
  ipcMain.handle('get-play-history', () => {
    if (!db) return []
    return db.getPlayHistory()
  })

  ipcMain.handle('get-recent-plays', (_, limit?: number) => {
    if (!db) return []
    return db.getPlayHistory(limit)
  })

  ipcMain.handle('clear-play-history', async () => {
    if (!db) return
    db.clearPlayHistory()
  })

  // 音乐目录
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
    if (db) {
      for (const [key, value] of Object.entries(settings)) {
        db.setSetting(key, value)
      }
    } else {
      saveSettingsToFile(settings)
    }
  })

  // ID3标签修复
  const id3Fixer = new ID3Fixer()

  ipcMain.handle('detect-id3-encoding', async (_, filePath: string) => {
    return await id3Fixer.detectEncoding(filePath)
  })

  ipcMain.handle('fix-id3-tags', async (_, filePath: string, sourceEncoding: string, fields?: any) => {
    return await id3Fixer.fixID3Tags(filePath, sourceEncoding as any, fields)
  })

  ipcMain.handle('fix-id3-tags-batch', async (_, filePaths: string[], sourceEncoding: string, fields?: any) => {
    return await id3Fixer.fixID3TagsBatch(filePaths, sourceEncoding as any, fields, (current, total) => {
      mainWindow.webContents.send('id3-fix-progress', { current, total })
    })
  })

  // 重复音乐检测
  ipcMain.handle('get-duplicate-groups', () => {
    if (!db) return []
    return db.getDuplicateGroups()
  })

  // ========== 歌词功能 ==========

  ipcMain.handle('load-lyrics', async (_, musicId: number) => {
    if (!db) return null
    const music = db.getMusicById(musicId)
    if (!music) return null

    // 1. 如果数据库中有歌词路径，直接使用
    if (music.lyricsPath && existsSync(music.lyricsPath)) {
      try {
        return lyricsService.parseLyrics(music.lyricsPath)
      } catch (error) {
        console.error('解析歌词文件失败:', error)
      }
    }

    // 2. 自动查找同目录下的歌词文件
    const lyricsPath = lyricsService.findLyricsFile(music.filePath)
    if (lyricsPath) {
      try {
        const lyrics = lyricsService.parseLyrics(lyricsPath)
        // 保存歌词路径到数据库
        db.updateMusic(musicId, { lyricsPath })
        return lyrics
      } catch (error) {
        console.error('解析歌词文件失败:', error)
      }
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

  ipcMain.handle('delete-music-file', async (_, musicId: number) => {
    if (!db) throw new Error('数据库未初始化')
    const music = db.getMusicById(musicId)
    if (!music) throw new Error('音乐不存在')

    // 删除文件
    const { unlink } = await import('fs/promises')
    try {
      await unlink(music.filePath)
    } catch (error: any) {
      throw new Error(`删除文件失败: ${error.message}`)
    }

    // 从数据库删除
    db.deleteMusic(musicId)
    return true
  })

  // Excel导出
  ipcMain.handle('export-music-to-excel', async (_, musicIds: number[], options?: any) => {
    if (!db) throw new Error('数据库未初始化')

    // 获取音乐列表
    const musicList: any[] = []
    for (const id of musicIds) {
      const music = db.getMusicById(id)
      if (music) musicList.push(music)
    }

    if (musicList.length === 0) {
      throw new Error('没有可导出的音乐')
    }

    // 导出
    const exporter = new ExcelExporter(db)
    const result = await exporter.exportMusicList(musicList, options) as { type: string; data: any }

    // 保存文件
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: '保存Excel文件',
      defaultPath: `音乐列表_${new Date().toISOString().slice(0, 10)}.${result.type === 'csv' ? 'csv' : 'xlsx'}`,
      filters: [
        { name: 'Excel文件', extensions: ['xlsx'] },
        { name: 'CSV文件', extensions: ['csv'] }
      ]
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return null
    }

    if (result.type === 'csv' || saveResult.filePath.endsWith('.csv')) {
      writeFileSync(saveResult.filePath, result.data, 'utf8')
    } else {
      writeFileSync(saveResult.filePath, Buffer.from(result.data))
    }

    return saveResult.filePath
  })

  // 导出音乐文件
  ipcMain.handle('export-music-files', async (_, musicIds: number[], options?: any) => {
    if (!db) throw new Error('数据库未初始化')

    // 选择目标目录
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择导出目录'
    })

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null
    }

    const targetDir = result.filePaths[0]
    const exporter = new FileExporter(db)
    const exportResult = await exporter.exportMusicFiles(musicIds, targetDir, options)

    return exportResult
  })

  // 文件监控
  if (fileMonitor) {
    ipcMain.handle('start-file-monitor', async (_, directoryPath: string, options?: any) => {
      if (!fileMonitor) throw new Error('文件监控未初始化')
      fileMonitor.watchDirectory(directoryPath, options)
      return true
    })

    ipcMain.handle('stop-file-monitor', async (_, directoryPath: string) => {
      if (!fileMonitor) throw new Error('文件监控未初始化')
      fileMonitor.unwatchDirectory(directoryPath)
      return true
    })

    ipcMain.handle('stop-all-file-monitors', async () => {
      if (!fileMonitor) throw new Error('文件监控未初始化')
      fileMonitor.stopAll()
      return true
    })
  }

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
      if (!shortcutManager) return false

      // 创建处理函数映射
      const handlers: Record<string, () => void> = {
        'play-pause': () => mainWindow?.webContents.send('shortcut-action', 'play-pause'),
        'previous': () => mainWindow?.webContents.send('shortcut-action', 'previous'),
        'next': () => mainWindow?.webContents.send('shortcut-action', 'next'),
        'volume-up': () => mainWindow?.webContents.send('shortcut-action', 'volume-up'),
        'volume-down': () => mainWindow?.webContents.send('shortcut-action', 'volume-down'),
        'toggle-window': () => {
          if (mainWindow?.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        'toggle-favorite': () => mainWindow?.webContents.send('shortcut-action', 'toggle-favorite')
      }

      // 转换快捷键格式
      const parsedShortcuts: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(shortcuts)) {
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
      if (!shortcutManager) return false

      let shortcuts: ShortcutConfig = {}
      let settings: any = {}
      if (db) {
        try {
          settings = db.getAllSettings()
        } catch (error) {
          settings = loadSettingsFromFile()
        }
      } else {
        settings = loadSettingsFromFile()
      }

      if (settings.shortcuts) {
        shortcuts = settings.shortcuts
      } else {
        shortcuts = await shortcutManager.getDefaultShortcuts()
      }

      // 注册快捷键
      const handlers: Record<string, () => void> = {
        'play-pause': () => mainWindow?.webContents.send('shortcut-action', 'play-pause'),
        'previous': () => mainWindow?.webContents.send('shortcut-action', 'previous'),
        'next': () => mainWindow?.webContents.send('shortcut-action', 'next'),
        'volume-up': () => mainWindow?.webContents.send('shortcut-action', 'volume-up'),
        'volume-down': () => mainWindow?.webContents.send('shortcut-action', 'volume-down'),
        'toggle-window': () => {
          if (mainWindow?.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        'toggle-favorite': () => mainWindow?.webContents.send('shortcut-action', 'toggle-favorite')
      }

      const parsedShortcuts: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(shortcuts)) {
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

  // ========== 播放统计功能 ==========
  if (db) {
    ipcMain.handle('get-overall-statistics', () => {
      return db.getOverallStatistics()
    })

    ipcMain.handle('get-top-played-songs', async (_, limit: number = 20) => {
      return db.getTopPlayedSongs(limit)
    })

    ipcMain.handle('get-play-trend', async (_, days: number = 30) => {
      return db.getPlayTrend(days)
    })

    ipcMain.handle('get-artist-statistics', async (_, limit: number = 20) => {
      return db.getArtistStatistics(limit)
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

      // 更新数据库
      const dbUpdates: any = {}
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.artist !== undefined) dbUpdates.artist = updates.artist
      if (updates.album !== undefined) dbUpdates.album = updates.album
      if (updates.year !== undefined) dbUpdates.year = updates.year
      if (updates.genre !== undefined) dbUpdates.genre = updates.genre
      if (updates.coverPath !== undefined) dbUpdates.coverPath = updates.coverPath

      if (Object.keys(dbUpdates).length > 0) {
        db.updateMusic(musicId, dbUpdates)
      }

      return true
    } catch (error: any) {
      throw new Error(`更新元数据失败: ${error.message}`)
    }
  })

  ipcMain.handle('batch-update-music-metadata', async (_, musicIds: number[], updates: any, onProgress?: (current: number, total: number) => void) => {
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
      const result = await metadataEditor.batchUpdateMetadata(filePaths, updates, onProgress)

      // 更新数据库
      const dbUpdates: any = {}
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.artist !== undefined) dbUpdates.artist = updates.artist
      if (updates.album !== undefined) dbUpdates.album = updates.album
      if (updates.year !== undefined) dbUpdates.year = updates.year
      if (updates.genre !== undefined) dbUpdates.genre = updates.genre
      if (updates.coverPath !== undefined) dbUpdates.coverPath = updates.coverPath

      if (Object.keys(dbUpdates).length > 0) {
        for (const id of musicIds) {
          db.updateMusic(id, dbUpdates)
        }
      }

      return result
    } catch (error: any) {
      throw new Error(`批量更新元数据失败: ${error.message}`)
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
