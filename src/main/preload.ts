import { contextBridge, ipcRenderer } from 'electron'
import type {
  MusicItem,
  ScanProgress,
  ScanResult,
  ScanState,
  AdvancedSearchCriteria,
  PlaylistImportResult
} from '@shared/types/music'
import type { ShortcutConfig } from '@shared/types/settings'
import type { LyricsData } from '@shared/types/lyrics'
import type { PlayStatistics, TopPlayedSong, PlayTrendData } from '@shared/types/statistics'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  setMiniMode: (enabled: boolean) => ipcRenderer.invoke('set-mini-mode', enabled),
  toggleDesktopLyrics: () => ipcRenderer.invoke('toggle-desktop-lyrics'),
  setDesktopLyricsLocked: (locked: boolean) => ipcRenderer.invoke('set-desktop-lyrics-locked', locked),
  isDesktopLyricsOpen: () => ipcRenderer.invoke('is-desktop-lyrics-open'),

  // 文件操作
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  selectMusicFile: () => ipcRenderer.invoke('select-music-file'),
  selectMusicFiles: () => ipcRenderer.invoke('select-music-files'),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
        scanMusicFolder: (path: string) => ipcRenderer.invoke('scan-music-folder', path),
        pauseScan: () => ipcRenderer.invoke('pause-scan'),
        resumeScan: () => ipcRenderer.invoke('resume-scan'),
        cancelScan: () => ipcRenderer.invoke('cancel-scan'),
        getScanState: () => ipcRenderer.invoke('get-scan-state'),

  // 数据库操作
  getMusicList: (offset: number, limit: number) =>
    ipcRenderer.invoke('get-music-list', offset, limit),
  getMusicTotalCount: () => ipcRenderer.invoke('get-music-total-count'),
  searchMusic: (query: string) => ipcRenderer.invoke('search-music', query),
  advancedSearch: (criteria: AdvancedSearchCriteria) => ipcRenderer.invoke('advanced-search', criteria),
  getSearchHistory: () => ipcRenderer.invoke('get-search-history'),
  clearSearchHistory: () => ipcRenderer.invoke('clear-search-history'),
  getSearchSuggestions: (query: string) => ipcRenderer.invoke('get-search-suggestions', query),
  getMusicById: (id: number) => ipcRenderer.invoke('get-music-by-id', id),
  toggleFavorite: (filePath: string) => ipcRenderer.invoke('toggle-favorite', filePath),
  isFileFavorite: (filePath: string) => ipcRenderer.invoke('is-file-favorite', filePath),
  recordPlay: (id: number) => ipcRenderer.invoke('record-play', id),

  // 播放列表
  createPlaylist: (name: string, description?: string) =>
    ipcRenderer.invoke('create-playlist', name, description),
  updatePlaylist: (id: number, updates: any) =>
    ipcRenderer.invoke('update-playlist', id, updates),
  deletePlaylist: (id: number) =>
    ipcRenderer.invoke('delete-playlist', id),
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  addToPlaylist: (playlistId: number, filePath: string) =>
    ipcRenderer.invoke('add-to-playlist', playlistId, filePath),
  isFileInPlaylist: (filePath: string, playlistId?: number) =>
    ipcRenderer.invoke('is-file-in-playlist', filePath, playlistId),
  getPlaylistsForFile: (filePath: string) =>
    ipcRenderer.invoke('get-playlists-for-file', filePath),
  removeFromPlaylistByPath: (playlistId: number, filePath: string) =>
    ipcRenderer.invoke('remove-from-playlist-by-path', playlistId, filePath),
  getPlaylistSongs: (playlistId: number) =>
    ipcRenderer.invoke('get-playlist-songs', playlistId),
  exportPlaylistJSON: (playlistId: number) =>
    ipcRenderer.invoke('export-playlist-json', playlistId),
  importPlaylistJSON: () => ipcRenderer.invoke('import-playlist-json'),

  // 收藏
  getFavorites: () => ipcRenderer.invoke('get-favorites'),

  // 播放历史
  getPlayHistory: () => ipcRenderer.invoke('get-play-history'),
  getRecentPlays: (limit?: number) => ipcRenderer.invoke('get-recent-plays', limit),
  clearPlayHistory: () => ipcRenderer.invoke('clear-play-history'),

  // 音乐目录
  getMusicDirectories: () => ipcRenderer.invoke('get-music-directories'),
  addMusicDirectory: (directory: any) =>
    ipcRenderer.invoke('add-music-directory', directory),
  updateMusicDirectory: (id: string, updates: any) =>
    ipcRenderer.invoke('update-music-directory', id, updates),
  deleteMusicDirectory: (id: string) =>
    ipcRenderer.invoke('delete-music-directory', id),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // ID3标签修复
  detectID3Encoding: (filePath: string) =>
    ipcRenderer.invoke('detect-id3-encoding', filePath),
  fixID3Tags: (filePath: string, sourceEncoding: string, fields?: any) =>
    ipcRenderer.invoke('fix-id3-tags', filePath, sourceEncoding, fields),
  fixID3TagsBatch: (filePaths: string[], sourceEncoding: string, fields?: any) =>
    ipcRenderer.invoke('fix-id3-tags-batch', filePaths, sourceEncoding, fields),

  // 重复音乐检测
  getDuplicateGroups: () => ipcRenderer.invoke('get-duplicate-groups'),
  deleteMusicFile: (musicId: number) => ipcRenderer.invoke('delete-music-file', musicId),
  getSimilarMusic: (musicId: number, limit?: number, minSimilarity?: number) =>
    ipcRenderer.invoke('get-similar-music', musicId, limit, minSimilarity),

  // Excel导出
  exportMusicToExcel: (musicIds: number[], options?: any) =>
    ipcRenderer.invoke('export-music-to-excel', musicIds, options),

  // 导出音乐文件
  exportMusicFiles: (musicIds: number[], options?: any) =>
    ipcRenderer.invoke('export-music-files', musicIds, options),

  // 文件监控
  startFileMonitor: (directoryPath: string, options?: any) =>
    ipcRenderer.invoke('start-file-monitor', directoryPath, options),
  stopFileMonitor: (directoryPath: string) =>
    ipcRenderer.invoke('stop-file-monitor', directoryPath),
  stopAllFileMonitors: () =>
    ipcRenderer.invoke('stop-all-file-monitors'),

  // 快捷键管理
  getShortcutConfig: () => ipcRenderer.invoke('get-shortcut-config'),
  saveShortcutConfig: (shortcuts: ShortcutConfig) => ipcRenderer.invoke('save-shortcut-config', shortcuts),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  registerShortcut: (action: string, accelerator: string) => ipcRenderer.invoke('register-shortcut', action, accelerator),
  unregisterShortcut: (action: string) => ipcRenderer.invoke('unregister-shortcut', action),
  registerAllShortcuts: (shortcuts: ShortcutConfig) => ipcRenderer.invoke('register-all-shortcuts', shortcuts),
  checkShortcutAvailable: (accelerator: string) => ipcRenderer.invoke('check-shortcut-available', accelerator),
  loadShortcuts: () => ipcRenderer.invoke('load-shortcuts'),

  // 文件操作（用于导入/导出快捷键配置）
  readFile: (filePath: string, encoding: string) => ipcRenderer.invoke('read-file', filePath, encoding),
  writeFile: (filePath: string, content: string, encoding: string) => ipcRenderer.invoke('write-file', filePath, content, encoding),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),

  // 事件监听
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    ipcRenderer.on('scan-progress', (_, progress) => callback(progress))
  },
  removeScanProgress: () => {
    ipcRenderer.removeAllListeners('scan-progress')
  },
  onScanStateChanged: (callback: (state: { isScanning: boolean; isPaused: boolean }) => void) => {
    ipcRenderer.on('scan-state-changed', (_, state) => callback(state))
  },
  removeScanStateChanged: () => {
    ipcRenderer.removeAllListeners('scan-state-changed')
  },
  onID3FixProgress: (callback: (progress: { current: number; total: number }) => void) => {
    ipcRenderer.on('id3-fix-progress', (_, progress) => callback(progress))
  },
  removeID3FixProgress: () => {
    ipcRenderer.removeAllListeners('id3-fix-progress')
  },
  onShortcutAction: (callback: (action: string) => void) => {
    ipcRenderer.on('shortcut-action', (_, action) => callback(action))
  },
  removeShortcutAction: () => {
    ipcRenderer.removeAllListeners('shortcut-action')
  },
  // 歌词功能
  loadLyrics: (musicId: number) => ipcRenderer.invoke('load-lyrics', musicId),
  parseLyricsFile: (filePath: string) => ipcRenderer.invoke('parse-lyrics-file', filePath),
  updateMusicLyricsPath: (musicId: number, lyricsPath: string) =>
    ipcRenderer.invoke('update-music-lyrics-path', musicId, lyricsPath),
  // 系统托盘功能
  updateTrayPlayState: (isPlaying: boolean) => ipcRenderer.send('update-tray-play-state', isPlaying),
  updateTrayCurrentMusic: (music: { title: string; artist: string } | null) => ipcRenderer.send('update-tray-current-music', music),
  onTrayAction: (callback: (action: string) => void) => {
    ipcRenderer.on('tray-action', (_, action) => callback(action))
  },
  removeTrayAction: () => {
    ipcRenderer.removeAllListeners('tray-action')
  },
  // 播放统计功能
  getOverallStatistics: () => ipcRenderer.invoke('get-overall-statistics'),
  getTopPlayedSongs: (limit?: number) => ipcRenderer.invoke('get-top-played-songs', limit),
  getPlayTrend: (days?: number) => ipcRenderer.invoke('get-play-trend', days),
  getArtistStatistics: (limit?: number) => ipcRenderer.invoke('get-artist-statistics', limit),
  // 元数据编辑功能
  updateMusicMetadata: (musicId: number, updates: any) => ipcRenderer.invoke('update-music-metadata', musicId, updates),
  batchUpdateMusicMetadata: (musicIds: number[], updates: any) => ipcRenderer.invoke('batch-update-music-metadata', musicIds, updates),
  extractMusicCover: (musicId: number, outputPath: string) => ipcRenderer.invoke('extract-music-cover', musicId, outputPath)
})

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      selectMusicFolder: () => Promise<string[]>
      selectMusicFile: () => Promise<string | null>
      selectMusicFiles: () => Promise<string[]>
      selectImageFile: () => Promise<string | null>
      scanMusicFolder: (path: string) => Promise<ScanResult>
      getMusicList: (offset: number, limit: number) => Promise<MusicItem[]>
      getMusicTotalCount: () => Promise<number>
      searchMusic: (query: string) => Promise<MusicItem[]>
      advancedSearch: (criteria: AdvancedSearchCriteria) => Promise<MusicItem[]>
      getSearchHistory: () => Promise<Array<{ query: string; searchType: string; createdAt: string }>>
      clearSearchHistory: () => Promise<void>
      getSearchSuggestions: (query: string) => Promise<string[]>
      getMusicById: (id: number) => Promise<MusicItem | null>
      toggleFavorite: (filePath: string) => Promise<void>
      isFileFavorite: (filePath: string) => Promise<boolean>
      recordPlay: (id: number) => Promise<void>
      createPlaylist: (name: string, description?: string) => Promise<number>
      updatePlaylist: (id: number, updates: any) => Promise<void>
      deletePlaylist: (id: number) => Promise<void>
      getPlaylists: () => Promise<any[]>
      addToPlaylist: (playlistId: number, filePath: string) => Promise<void>
      isFileInPlaylist: (filePath: string, playlistId?: number) => Promise<boolean>
      getPlaylistsForFile: (filePath: string) => Promise<number[]>
      removeFromPlaylistByPath: (playlistId: number, filePath: string) => Promise<void>
      getPlaylistSongs: (playlistId: number) => Promise<MusicItem[]>
      exportPlaylistJSON: (playlistId: number) => Promise<string | null>
      importPlaylistJSON: () => Promise<PlaylistImportResult | null>
      getFavorites: () => Promise<MusicItem[]>
      getPlayHistory: () => Promise<MusicItem[]>
      clearPlayHistory: () => Promise<void>
      getMusicDirectories: () => Promise<any[]>
      addMusicDirectory: (directory: any) => Promise<string>
      updateMusicDirectory: (id: string, updates: any) => Promise<void>
      deleteMusicDirectory: (id: string) => Promise<void>
      getSettings: () => Promise<any>
      saveSettings: (settings: any) => Promise<void>
      clearCache: () => Promise<boolean>
      detectID3Encoding: (filePath: string) => Promise<any[]>
      fixID3Tags: (filePath: string, sourceEncoding: string, fields?: any) => Promise<any>
      fixID3TagsBatch: (filePaths: string[], sourceEncoding: string, fields?: any) => Promise<any>
      getDuplicateGroups: () => Promise<any[]>
      deleteMusicFile: (musicId: number) => Promise<boolean>
      getSimilarMusic: (musicId: number, limit?: number, minSimilarity?: number) => Promise<Array<MusicItem & { similarity?: number }>>
      exportMusicToExcel: (musicIds: number[], options?: any) => Promise<string | null>
      exportMusicFiles: (musicIds: number[], options?: any) => Promise<any>
      startFileMonitor: (directoryPath: string, options?: any) => Promise<boolean>
      stopFileMonitor: (directoryPath: string) => Promise<boolean>
      stopAllFileMonitors: () => Promise<boolean>
      getShortcutConfig: () => Promise<ShortcutConfig>
      saveShortcutConfig: (shortcuts: ShortcutConfig) => Promise<void>
      getDefaultShortcuts: () => Promise<ShortcutConfig>
      registerShortcut: (action: string, accelerator: string) => Promise<boolean>
      unregisterShortcut: (action: string) => Promise<void>
      registerAllShortcuts: (shortcuts: ShortcutConfig) => Promise<boolean>
      checkShortcutAvailable: (accelerator: string) => Promise<boolean>
      loadShortcuts: () => Promise<boolean>
      readFile: (filePath: string, encoding: string) => Promise<string>
      writeFile: (filePath: string, content: string, encoding: string) => Promise<void>
      showSaveDialog: (options: any) => Promise<string | null>
      onScanProgress: (callback: (progress: ScanProgress) => void) => void
      removeScanProgress: () => void
      onScanStateChanged: (callback: (state: { isScanning: boolean; isPaused: boolean }) => void) => void
      removeScanStateChanged: () => void
      pauseScan: () => Promise<boolean>
      resumeScan: () => Promise<boolean>
      cancelScan: () => Promise<boolean>
      getScanState: () => Promise<ScanState>
      onID3FixProgress: (callback: (progress: { current: number; total: number }) => void) => void
      removeID3FixProgress: () => void
      onShortcutAction: (callback: (action: string) => void) => void
      removeShortcutAction: () => void
      loadLyrics: (musicId: number) => Promise<LyricsData | null>
      parseLyricsFile: (filePath: string) => Promise<LyricsData>
      updateMusicLyricsPath: (musicId: number, lyricsPath: string) => Promise<void>
      updateTrayPlayState: (isPlaying: boolean) => void
      updateTrayCurrentMusic: (music: { title: string; artist: string } | null) => void
      onTrayAction: (callback: (action: string) => void) => void
      removeTrayAction: () => void
      getOverallStatistics: () => Promise<PlayStatistics>
      getTopPlayedSongs: (limit?: number) => Promise<TopPlayedSong[]>
      getPlayTrend: (days?: number) => Promise<PlayTrendData[]>
      getArtistStatistics: (limit?: number) => Promise<Array<{ artist: string; playCount: number; songCount: number }>>
      updateMusicMetadata: (musicId: number, updates: any) => Promise<boolean>
      batchUpdateMusicMetadata: (musicIds: number[], updates: any) => Promise<{ success: number; failed: number; errors: Array<{ file: string; error: string }> }>
      extractMusicCover: (musicId: number, outputPath: string) => Promise<boolean>
    }
  }
}
