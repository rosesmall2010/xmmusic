/**
 * 在线封面匹配结果类型（对齐歌词匹配结构）
 */

export type CoverMatchStatus =
  | 'matched'
  | 'skipped_has_cover'
  | 'skipped_low_similarity'
  | 'skipped_cancelled'
  | 'failed'

export interface CoverMatchResult {
  musicId: number
  title: string
  status: CoverMatchStatus
  coverPath?: string
  similarity?: number
  /** 非 MP3：只更新了库/缓存，未写文件 */
  fileNotUpdated?: boolean
  message?: string
}

export interface CoverMatchProgress {
  current: number
  total: number
  success: number
  failed: number
  skipped: number
  /** 成功且已写入 MP3 文件 */
  writtenToFile?: number
  /** 成功但仅更新库（非 MP3） */
  dbOnly?: number
  currentTitle: string
  lastStatus?: CoverMatchStatus
  /** 批量开始时间（Unix ms） */
  startedAt?: number
  elapsedMs?: number
  estimatedRemainingMs?: number | null
  concurrency?: number
  tasks?: CoverMatchWorkerTask[]
}

/** 批量匹配单个并发槽位状态 */
export type CoverMatchWorkerTaskStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export interface CoverMatchWorkerTask {
  workerId: number
  musicId?: number
  title: string
  status: CoverMatchWorkerTaskStatus
  message?: string
}

export interface CoverMatchSummary {
  total: number
  success: number
  failed: number
  skipped: number
  writtenToFile: number
  dbOnly: number
  cancelled: boolean
  results: CoverMatchResult[]
}

export type CoverMatchSource = 'netease' | 'kugou' | 'qq'

/** 在线匹配封面候选（用户选择用；列表中必有 coverUrl） */
export interface CoverMatchCandidate {
  songId: number
  source?: CoverMatchSource
  name: string
  artists: string
  album?: string
  similarity: number
  coverUrl: string
}
