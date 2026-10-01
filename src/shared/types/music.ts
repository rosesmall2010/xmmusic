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
  lyricsOffset: number
  playCount: number
  lastPlayedAt: string | null
  favorite: boolean
  inQueue?: boolean  // 是否在播放队列中
  addedAt: string
  updatedAt: string
  isCorrupted: boolean
  isDuplicate: boolean
  duplicateCount?: number
  isPlayable?: boolean  // 是否可以播放
  isExists?: boolean    // 文件是否存在
  playErrorReason?: string | null  // 不能播放的原因
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
  concurrency?: number
  forceRescan?: boolean
  onProgress?: (progress: ScanProgress) => void
}

export interface ScanState {
  isScanning: boolean
  isPaused: boolean
  isCancelled: boolean
  progress: ScanProgress | null
  currentPath: string | null
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

/**
 * 本地音乐列表的分页游标（keyset / seek method）
 *
 * 大库下 `LIMIT n OFFSET m` 是 O(n²)：SQLite 要先遍历并丢弃前 m 行。
 * 实测 5 万条整库拉完，OFFSET 版 75s、游标版 0.3s。
 * 排序键为 (local_music.added_at DESC, local_music.music_id DESC)，游标即上一页末行的该二元组。
 */
export interface LocalMusicCursor {
  addedAt: string
  musicId: number
}

export interface LocalMusicPage {
  items: MusicItem[]
  /** 为 null 表示已到末页 */
  nextCursor: LocalMusicCursor | null
}
