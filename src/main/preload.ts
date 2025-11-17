import { contextBridge, ipcRenderer } from 'electron'
import type {
  MusicItem,
  ScanProgress,
  ScanResult,
  AdvancedSearchCriteria,
  PlaylistImportResult
} from '@shared/types/music'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // 文件操作
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  selectMusicFile: () => ipcRenderer.invoke('select-music-file'),
  selectMusicFiles: () => ipcRenderer.invoke('select-music-files'),
  scanMusicFolder: (path: string) => ipcRenderer.invoke('scan-music-folder', path),

  // 数据库操作
  getMusicList: (offset: number, limit: number) =>
    ipcRenderer.invoke('get-music-list', offset, limit),
  getMusicTotalCount: () => ipcRenderer.invoke('get-music-total-count'),
  searchMusic: (query: string) => ipcRenderer.invoke('search-music', query),
  advancedSearch: (criteria: AdvancedSearchCriteria) => ipcRenderer.invoke('advanced-search', criteria),
  getMusicById: (id: number) => ipcRenderer.invoke('get-music-by-id', id),
  toggleFavorite: (id: number) => ipcRenderer.invoke('toggle-favorite', id),
  recordPlay: (id: number) => ipcRenderer.invoke('record-play', id),

  // 播放列表
  createPlaylist: (name: string, description?: string) =>
    ipcRenderer.invoke('create-playlist', name, description),
  updatePlaylist: (id: number, updates: any) =>
    ipcRenderer.invoke('update-playlist', id, updates),
  deletePlaylist: (id: number) =>
    ipcRenderer.invoke('delete-playlist', id),
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  addToPlaylist: (playlistId: number, musicId: number) =>
    ipcRenderer.invoke('add-to-playlist', playlistId, musicId),
  getPlaylistSongs: (playlistId: number) =>
    ipcRenderer.invoke('get-playlist-songs', playlistId),
  exportPlaylistJSON: (playlistId: number) =>
    ipcRenderer.invoke('export-playlist-json', playlistId),
  importPlaylistJSON: () => ipcRenderer.invoke('import-playlist-json'),

  // 收藏
  getFavorites: () => ipcRenderer.invoke('get-favorites'),

  // 播放历史
  getPlayHistory: () => ipcRenderer.invoke('get-play-history'),
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
  getSimilarMusic: (musicId: number, limit?: number) =>
    ipcRenderer.invoke('get-similar-music', musicId, limit),

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

  // 事件监听
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    ipcRenderer.on('scan-progress', (_, progress) => callback(progress))
  },
  removeScanProgress: () => {
    ipcRenderer.removeAllListeners('scan-progress')
  },
  onID3FixProgress: (callback: (progress: { current: number; total: number }) => void) => {
    ipcRenderer.on('id3-fix-progress', (_, progress) => callback(progress))
  },
  removeID3FixProgress: () => {
    ipcRenderer.removeAllListeners('id3-fix-progress')
  }
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
      scanMusicFolder: (path: string) => Promise<ScanResult>
      getMusicList: (offset: number, limit: number) => Promise<MusicItem[]>
      getMusicTotalCount: () => Promise<number>
      searchMusic: (query: string) => Promise<MusicItem[]>
      advancedSearch: (criteria: AdvancedSearchCriteria) => Promise<MusicItem[]>
      getMusicById: (id: number) => Promise<MusicItem | null>
      toggleFavorite: (id: number) => Promise<void>
      recordPlay: (id: number) => Promise<void>
      createPlaylist: (name: string, description?: string) => Promise<number>
      updatePlaylist: (id: number, updates: any) => Promise<void>
      deletePlaylist: (id: number) => Promise<void>
      getPlaylists: () => Promise<any[]>
      addToPlaylist: (playlistId: number, musicId: number) => Promise<void>
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
      detectID3Encoding: (filePath: string) => Promise<any[]>
      fixID3Tags: (filePath: string, sourceEncoding: string, fields?: any) => Promise<any>
      fixID3TagsBatch: (filePaths: string[], sourceEncoding: string, fields?: any) => Promise<any>
      getDuplicateGroups: () => Promise<any[]>
      deleteMusicFile: (musicId: number) => Promise<boolean>
      getSimilarMusic: (musicId: number, limit?: number) => Promise<MusicItem[]>
      exportMusicToExcel: (musicIds: number[], options?: any) => Promise<string | null>
      exportMusicFiles: (musicIds: number[], options?: any) => Promise<any>
      startFileMonitor: (directoryPath: string, options?: any) => Promise<boolean>
      stopFileMonitor: (directoryPath: string) => Promise<boolean>
      stopAllFileMonitors: () => Promise<boolean>
      onScanProgress: (callback: (progress: ScanProgress) => void) => void
      removeScanProgress: () => void
      onID3FixProgress: (callback: (progress: { current: number; total: number }) => void) => void
      removeID3FixProgress: () => void
    }
  }
}
