import type { MusicItem } from '@shared/types/music'

export interface DesktopLyricsState {
  music: { id: number; title: string; artist: string } | null
  currentTime: number
  isPlaying: boolean
}

export interface ElectronAPI {
  // 窗口控制
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => void
  closeWindow: () => void
  setMiniMode: (enabled: boolean) => Promise<void>
  setWindowTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>
  toggleDesktopLyrics: () => Promise<boolean>
  setDesktopLyricsLocked: (locked: boolean) => Promise<void>
  isDesktopLyricsOpen: () => Promise<boolean>
  sendDesktopLyricsState: (state: DesktopLyricsState) => void
  notifyDesktopLyricsReady: () => void
  onDesktopLyricsState: (callback: (state: DesktopLyricsState) => void) => void
  onDesktopLyricsRequestState: (callback: () => void) => void
  onDesktopLyricsVisibility: (callback: (open: boolean) => void) => void
  removeDesktopLyricsListeners: () => void

  // 文件操作
  selectMusicFolder: () => Promise<string[]>
  selectMusicFile: () => Promise<string | null>
  selectMusicFiles: () => Promise<string[]>
  selectImageFile: () => Promise<string | null>
  selectFolder: (title?: string) => Promise<string | null>
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
  addSearchHistory: (query: string) => Promise<void>
  clearSearchHistory: () => Promise<void>
  getSearchSuggestions: (query: string) => Promise<string[]>
  getMusicById: (id: number) => Promise<any>
  toggleFavorite: (musicId: number) => Promise<boolean>
  isFileFavorite: (musicId: number) => Promise<boolean>
  recordPlay: (musicId: number) => Promise<void>

  // 播放列表
  createPlaylist: (name: string, description?: string) => Promise<number>
  updatePlaylist: (id: number, updates: any) => Promise<void>
  setPlaylistCover: (playlistId: number, source: { type: 'file' | 'music' | 'default'; filePath?: string; musicId?: number }) => Promise<string | null>
  getPlaylistCoverCandidates: (playlistId: number, options?: { page?: number; pageSize?: number }) => Promise<{
    items: Array<{ musicId: number; title: string; artist: string; coverPath: string }>
    page: number
    pageSize: number
    hasMore: boolean
  }>
  deletePlaylist: (id: number) => Promise<void>
  getPlaylists: () => Promise<any[]>
  updatePlaylistOrder: (playlistIds: number[]) => Promise<void>
  addToPlaylist: (playlistId: number, musicId: number) => Promise<void>
  batchAddToPlaylist: (playlistId: number, musicIds: number[]) => Promise<{ success: boolean; added: number; skipped: number; total: number }>
  batchRemoveFromPlaylist: (playlistId: number, musicIds: number[]) => Promise<{ success: boolean; removed: number }>
  isFileInPlaylist: (musicId: number, playlistId?: number) => Promise<boolean>
  getPlaylistsForFile: (musicId: number) => Promise<number[]>
  removeFromPlaylistByPath: (playlistId: number, musicId: number) => Promise<void>
  getPlaylistSongs: (playlistId: number) => Promise<any[]>
  getPlaylistSongsPaginated: (playlistId: number, offset: number, limit: number) => Promise<any[]>
  getPlaylistSongsCount: (playlistId: number) => Promise<number>
  clearPlaylist: (playlistId: number) => Promise<void>
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
  getAppVersion: () => Promise<string>

  // ID3标签修复
  readRawID3Tags: (filePath: string) => Promise<{ title: string; artist: string; album: string; year?: string; genre?: string } | null>
  convertID3TagsEncoding: (rawTags: { title: string; artist: string; album: string; year?: string; genre?: string }, sourceEncoding: string) => Promise<{ title: string; artist: string; album: string; year?: string; genre?: string }>
  detectID3Encoding: (filePath: string) => Promise<any[]>
  fixID3Tags: (filePath: string, sourceEncoding: string, fields?: any) => Promise<any>
  fixID3TagsBatch: (filePaths: string[], sourceEncoding: string, fields?: any) => Promise<any>

  // 重复音乐检测
  getDuplicateGroups: () => Promise<any[]>
  deleteMusicFile: (musicId: number) => Promise<boolean>
  getSimilarMusic: (musicId: number, limit?: number, minSimilarity?: number) => Promise<any[]>
  clearAllMusic: () => Promise<boolean>

  // Excel导出
  exportMusicToExcel: (musicIds: number[], options?: any) => Promise<string | null>
  exportMusicFiles: (musicIds: number[], options?: any) => Promise<any>
  onExportMusicProgress: (callback: (progress: {
    current: number
    total: number
    fileName: string
    success: number
    failed: number
    skipped: number
  }) => void) => any
  offExportMusicProgress: (handler: any) => void

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
  onBatchAddProgress: (callback: (event: any, progress: { current: number; total: number; added: number; skipped: number }) => void) => void
  offBatchAddProgress: (callback: any) => void
  onShortcutAction: (callback: (action: string) => void) => void
  removeShortcutAction: () => void

  // 歌词功能
  loadLyrics: (musicId: number) => Promise<{
    title?: string
    artist?: string
    album?: string
    offset?: number
    lines: { time: number; text: string }[]
  } | null>
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
  /** 仅把元数据写入数据库，不改文件 ID3 */
  syncMusicMetadataToDb: (musicId: number, updates: {
    title?: string
    artist?: string
    album?: string | null
    year?: number | null
    genre?: string | null
  }) => Promise<MusicItem>
  /** 批量：从文件名/ID3 自动解析后写入数据库 */
  batchSyncMusicMetadataToDb: (musicIds: number[]) => Promise<{
    success: number
    unchanged: number
    failed: number
    updated: MusicItem[]
    errors: Array<{ id: number; file: string; error: string }>
  }>
  getMusicAudioInfo: (musicId: number) => Promise<{
    bitrate: number
    sampleRate: number
    channels: number
    isVBR: boolean
    codecProfile: string | null
  } | null>
  extractMusicCover: (musicId: number, outputPath: string) => Promise<boolean>

  // 事件监听
  on: (channel: string, listener: (...args: any[]) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
