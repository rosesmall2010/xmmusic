export interface ElectronAPI {
  // 窗口控制
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => void
  closeWindow: () => void
  setMiniMode: (enabled: boolean) => Promise<void>

  // 文件操作
  selectMusicFolder: () => Promise<string[]>
  selectMusicFile: () => Promise<string | null>
  selectMusicFiles: () => Promise<string[]>
  selectImageFile: () => Promise<string | null>
  scanMusicFolder: (path: string) => Promise<any>
  pauseScan: () => Promise<boolean>
  resumeScan: () => Promise<boolean>
  cancelScan: () => Promise<boolean>
  getScanState: () => Promise<any>

  // 数据库操作
  getMusicList: (offset: number, limit: number) => Promise<any[]>
  getMusicTotalCount: () => Promise<number>
  searchMusic: (query: string) => Promise<any[]>
  advancedSearch: (criteria: any) => Promise<any[]>
  getSearchHistory: () => Promise<any[]>
  clearSearchHistory: () => Promise<void>
  getSearchSuggestions: (query: string) => Promise<string[]>
  getMusicById: (id: number) => Promise<any>
  toggleFavorite: (filePath: string) => Promise<void>
  isFileFavorite: (filePath: string) => Promise<boolean>
  recordPlay: (id: number) => Promise<void>

  // 播放列表
  createPlaylist: (name: string, description?: string) => Promise<number>
  updatePlaylist: (id: number, updates: any) => Promise<void>
  deletePlaylist: (id: number) => Promise<void>
  getPlaylists: () => Promise<any[]>
  addToPlaylist: (playlistId: number, filePath: string) => Promise<void>
  isFileInPlaylist: (filePath: string, playlistId?: number) => Promise<boolean>
  getPlaylistsForFile: (filePath: string) => Promise<number[]>
  removeFromPlaylistByPath: (playlistId: number, filePath: string) => Promise<void>
  getPlaylistSongs: (playlistId: number) => Promise<any[]>
  exportPlaylistJSON: (playlistId: number) => Promise<string | null>
  importPlaylistJSON: () => Promise<any>

  // 收藏
  getFavorites: () => Promise<any[]>

  // 播放历史
  getPlayHistory: () => Promise<any[]>
  getRecentPlays: (limit?: number) => Promise<any[]>
  clearPlayHistory: () => Promise<void>

  // 音乐目录
  getMusicDirectories: () => Promise<any[]>
  addMusicDirectory: (directory: any) => Promise<string>
  updateMusicDirectory: (id: string, updates: any) => Promise<void>
  deleteMusicDirectory: (id: string) => Promise<void>

  // 设置
  getSettings: () => Promise<any>
  saveSettings: (settings: any) => Promise<void>
  clearCache: () => Promise<boolean>

  // ID3标签修复
  detectID3Encoding: (filePath: string) => Promise<any[]>
  fixID3Tags: (filePath: string, sourceEncoding: string, fields?: any) => Promise<any>
  fixID3TagsBatch: (filePaths: string[], sourceEncoding: string, fields?: any) => Promise<any>

  // 重复音乐检测
  getDuplicateGroups: () => Promise<any[]>
  deleteMusicFile: (musicId: number) => Promise<boolean>
  getSimilarMusic: (musicId: number, limit?: number, minSimilarity?: number) => Promise<any[]>

  // Excel导出
  exportMusicToExcel: (musicIds: number[], options?: any) => Promise<string | null>
  exportMusicFiles: (musicIds: number[], options?: any) => Promise<any>

  // 文件监控
  startFileMonitor: (directoryPath: string, options?: any) => Promise<boolean>
  stopFileMonitor: (directoryPath: string) => Promise<boolean>
  stopAllFileMonitors: () => Promise<boolean>

  // 快捷键管理
  getShortcutConfig: () => Promise<any>
  saveShortcutConfig: (shortcuts: any) => Promise<void>
  getDefaultShortcuts: () => Promise<any>
  registerShortcut: (action: string, accelerator: string) => Promise<boolean>
  unregisterShortcut: (action: string) => Promise<void>
  registerAllShortcuts: (shortcuts: any) => Promise<boolean>
  checkShortcutAvailable: (accelerator: string) => Promise<boolean>
  loadShortcuts: () => Promise<boolean>

  // 文件操作（用于导入/导出快捷键配置）
  readFile: (filePath: string, encoding: string) => Promise<string>
  writeFile: (filePath: string, content: string, encoding: string) => Promise<void>
  showSaveDialog: (options: any) => Promise<string | null>

  // 事件监听
  onScanProgress: (callback: (progress: any) => void) => void
  removeScanProgress: () => void
  onScanStateChanged: (callback: (state: { isScanning: boolean; isPaused: boolean }) => void) => void
  removeScanStateChanged: () => void
  onID3FixProgress: (callback: (progress: { current: number; total: number }) => void) => void
  removeID3FixProgress: () => void
  onShortcutAction: (callback: (action: string) => void) => void
  removeShortcutAction: () => void

  // 歌词功能
  loadLyrics: (musicId: number) => Promise<any>
  parseLyricsFile: (filePath: string) => Promise<any>
  updateMusicLyricsPath: (musicId: number, lyricsPath: string) => Promise<void>

  // 系统托盘
  updateTrayPlayState: (isPlaying: boolean) => void
  updateTrayCurrentMusic: (music: { title: string; artist: string } | null) => void
  onTrayAction: (callback: (action: string) => void) => void
  removeTrayAction: () => void

  // 统计
  getOverallStatistics: () => Promise<any>
  getTopPlayedSongs: (limit?: number) => Promise<any[]>
  getPlayTrend: (days?: number) => Promise<any[]>
  getArtistStatistics: (limit?: number) => Promise<any[]>

  // 元数据
  updateMusicMetadata: (musicId: number, updates: any) => Promise<boolean>
  batchUpdateMusicMetadata: (musicIds: number[], updates: any) => Promise<any>
  extractMusicCover: (musicId: number, outputPath: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
