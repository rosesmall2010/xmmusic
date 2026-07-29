/**
 * 歌词相关类型定义
 */

export interface LyricLine {
  time: number // 时间戳（秒）
  text: string // 歌词文本
}

export interface LyricsData {
  title?: string
  artist?: string
  album?: string
  offset?: number // 时间偏移（毫秒）
  lines: LyricLine[]
}

/** 在线匹配单曲结果状态 */
export type LyricsMatchStatus =
  | 'matched'
  | 'linked_local'
  | 'skipped_has_lyrics'
  | 'skipped_low_similarity'
  | 'skipped_instrumental'
  | 'failed'

export interface LyricsMatchResult {
  musicId: number
  title: string
  status: LyricsMatchStatus
  lyricsPath?: string
  similarity?: number
  message?: string
}

export interface LyricsMatchProgress {
  current: number
  total: number
  success: number
  failed: number
  skipped: number
  currentTitle: string
  lastStatus?: LyricsMatchStatus
}

export interface LyricsMatchSummary {
  total: number
  success: number
  failed: number
  skipped: number
  cancelled: boolean
  results: LyricsMatchResult[]
}

/** 在线匹配候选（用户选择用） */
export interface LyricsMatchCandidate {
  songId: number
  name: string
  artists: string
  album?: string
  similarity: number
}
