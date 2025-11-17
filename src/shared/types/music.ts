/**
 * 音乐相关类型定义
 */

export interface MusicItem {
  id: number
  title: string
  artist: string
  album: string | null
  year: number | null
  genre: string | null
  filePath: string
  fileName: string
  fileSize: number
  fileHash: string
  fileExtension: string
  duration: number
  bitrate: number
  sampleRate: number
  channels: number
  coverPath: string | null
  lyricsPath: string | null
  playCount: number
  lastPlayedAt: string | null
  favorite: boolean
  addedAt: string
  updatedAt: string
  isCorrupted: boolean
  isDuplicate: boolean
  duplicateCount?: number
}

export interface MusicDirectory {
  id: string
  path: string
  name: string
  enabled: boolean
  autoScan: boolean
  scanDepth: 'current' | 'recursive'
  fileTypes: string[]
  excludePaths: string[]
  priority: number
  songCount: number
  lastScannedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Playlist {
  id: number
  name: string
  description: string | null
  coverPath: string | null
  songCount: number
  totalDuration: number
  createdAt: string
  updatedAt: string
}

export interface PlaylistItem {
  id: number
  playlistId: number
  musicId: number
  position: number
  addedAt: string
}

export interface PlayHistory {
  id: number
  musicId: number
  playedAt: string
}

export interface CorruptedFile {
  id: number
  filePath: string
  fileName: string
  error: string
  detectedAt: string
  resolved: boolean
}

export interface ID3Backup {
  id: number
  filePath: string
  backupPath: string
  createdAt: string
}

export interface DuplicateGroup {
  fileHash: string
  count: number
  files: MusicItem[]
}

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  speed: number
  percentage: number
}

export interface ScanResult {
  success: number
  failed: number
  corrupted: number
  skipped: number
  duration: number
  errors: Array<{ file: string; error: string }>
}

export interface ScanOptions {
  recursive: boolean
  fileTypes: string[]
  excludePaths: string[]
  onProgress?: (progress: ScanProgress) => void
}

export interface AdvancedSearchCriteria {
  keyword?: string
  artist?: string
  album?: string
  genre?: string
  favorite?: boolean
  directory?: string
  fileExtension?: string
  minDuration?: number
  maxDuration?: number
  yearFrom?: number
  yearTo?: number
  sortBy?: 'addedAt' | 'title' | 'duration' | 'playCount'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export interface PlaylistExportSong {
  title: string
  artist: string
  album: string | null
  duration: number
  filePath: string
  fileName: string
  fileHash: string
}

export interface PlaylistExportData {
  version: number
  exportedAt: string
  playlist: {
    name: string
    description: string | null
    coverPath: string | null
    songCount: number
    totalDuration: number
  }
  songs: PlaylistExportSong[]
}

export interface PlaylistImportResult {
  playlistId: number
  added: number
  missing: Array<{
    title: string
    artist?: string
    filePath?: string
    fileHash?: string
  }>
}
