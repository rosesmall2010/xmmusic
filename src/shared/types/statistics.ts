/**
 * 播放统计相关类型定义
 */

import type { MusicItem } from './music'

export interface PlayStatistics {
  totalPlays: number // 总播放次数
  totalDuration: number // 总播放时长（秒）
  totalSongs: number // 总歌曲数
  averagePlaysPerSong: number // 平均每首歌曲播放次数
  averageDuration: number // 平均播放时长（秒）
}

export interface TopPlayedSong extends MusicItem {
  playCount: number
  lastPlayedAt: string | null
}

export interface PlayTrendData {
  date: string // 日期 YYYY-MM-DD
  count: number // 播放次数
  duration: number // 播放时长（秒）
}
