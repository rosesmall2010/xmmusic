/**
 * 设置相关类型定义
 */

export interface AppSettings {
  theme: 'light' | 'dark'
  language: 'zh' | 'en'
  volume: number
  playMode: 'sequential' | 'random' | 'repeat'
  autoPlay: boolean
  gaplessPlayback: boolean
  showLyrics: boolean
  scanOnStartup: boolean
  maxDirectories: number
  defaultFileTypes: string[]
}
