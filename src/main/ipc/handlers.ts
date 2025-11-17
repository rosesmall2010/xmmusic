import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import MusicDatabase from '../database/db'
import FileScanner from '../services/fileScanner'
import ID3Fixer from '../services/id3Fixer'
import ExcelExporter from '../services/excelExporter'
import FileExporter from '../services/fileExporter'
import FileMonitor from '../services/fileMonitor'
import { loadSettingsFromFile, saveSettingsToFile } from '../services/settingsStore'
import type { ScanProgress, MusicItem } from '../../shared/types/music'

export function setupIPC(db: MusicDatabase | null, mainWindow: BrowserWindow, fileMonitor: FileMonitor | null = null) {
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

  ipcMain.handle('scan-music-folder', async (_, path: string) => {
    if (!db) {
      throw new Error('数据库未初始化，无法扫描音乐。请查看控制台错误信息。')
    }
    const scanner = new FileScanner(db)
    const result = await scanner.scanDirectory(path, {
      recursive: true,
      fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
      excludePaths: [],
      onProgress: (progress: ScanProgress) => {
        mainWindow.webContents.send('scan-progress', progress)
      }
    })
    return result
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
    return db.searchMusic(query)
  })

  ipcMain.handle('advanced-search', async (_, criteria: any) => {
    if (!db) return []
    return db.advancedSearch(criteria)
  })

  ipcMain.handle('get-music-by-id', async (_, id: number) => {
    if (!db) return null
    return db.getMusicById(id)
  })

  ipcMain.handle('toggle-favorite', async (_, id: number) => {
    if (!db) return
    db.toggleFavorite(id)
  })

  ipcMain.handle('record-play', async (_, id: number) => {
    if (!db) return
    db.recordPlay(id)
  })

  ipcMain.handle('get-similar-music', async (_, musicId: number, limit?: number) => {
    if (!db) return []
    return db.getSimilarMusic(musicId, limit || 20)
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

  ipcMain.handle('add-to-playlist', async (_, playlistId: number, musicId: number) => {
    if (!db) return
    db.addToPlaylist(playlistId, musicId)
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
      if (song.fileHash) {
        const matches = db.getMusicByHash(song.fileHash)
        music = matches.length > 0 ? matches[0] : null
      }
      if (!music && song.filePath) {
        music = db.getMusicByPath(song.filePath)
      }

      if (music) {
        db.addToPlaylist(playlistId, music.id)
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
  ipcMain.handle('get-favorites', () => {
    if (!db) return []
    return db.getFavorites()
  })

  // 播放历史
  ipcMain.handle('get-play-history', () => {
    if (!db) return []
    return db.getPlayHistory()
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
}
