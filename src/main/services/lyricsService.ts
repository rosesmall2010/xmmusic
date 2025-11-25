import { readFileSync, existsSync } from 'fs'
import { dirname, join, extname } from 'path'
import iconv from 'iconv-lite'

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

export default class LyricsService {
  /**
   * 自动查找歌词文件
   * 查找顺序：
   * 1. 同目录下同名的 .lrc/.txt 文件（精确匹配）
   * 2. 同目录下同名的文件（忽略大小写和 Unicode 编码差异）
   */
  findLyricsFile(musicFilePath: string): string | null {
    try {
      const dir = dirname(musicFilePath)
      const ext = extname(musicFilePath)
      // 获取不带扩展名的文件名
      const baseName = musicFilePath.slice(0, -ext.length).split(/[/\\]/).pop() || ''

      if (!baseName) return null

      // 1. 精确匹配（尝试常见扩展名）
      const extensions = ['.lrc', '.LRC', '.txt', '.TXT']
      for (const lrcExt of extensions) {
        // 重新构建路径，确保路径分隔符正确
        const path = join(dir, baseName + lrcExt)
        if (existsSync(path)) {
          return path
        }
      }

      // 2. 遍历目录进行模糊匹配（解决大小写和 NFC/NFD 问题）
      const { readdirSync } = require('fs')
      const { basename } = require('path')

      const files = readdirSync(dir)
      const targetName = baseName.toLowerCase().normalize('NFC')

      for (const file of files) {
        const fileExt = extname(file).toLowerCase()
        if (fileExt !== '.lrc' && fileExt !== '.txt') continue

        const fileName = basename(file, extname(file))
        const normalizedFileName = fileName.toLowerCase().normalize('NFC')

        // 比较文件名（忽略大小写和 Unicode 规范化差异）
        if (normalizedFileName === targetName) {
          return join(dir, file)
        }
      }
    } catch (error) {
      console.error('查找歌词文件出错:', error)
    }

    return null
  }

  /**
   * 检测文件编码
   */
  detectEncoding(filePath: string): 'utf8' | 'gbk' | 'gb2312' | 'big5' {
    try {
      // 尝试读取前几个字节判断BOM
      const buffer = readFileSync(filePath)

      // UTF-8 BOM
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf8'
      }

      // UTF-16 LE BOM
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf8' // 简化处理，使用utf8
      }

      // UTF-16 BE BOM
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf8' // 简化处理，使用utf8
      }

      // 尝试UTF-8解码
      try {
        const testText = buffer.slice(0, Math.min(1000, buffer.length)).toString('utf8')
        // 检查是否包含常见的中文字符
        if (/[\u4e00-\u9fa5]/.test(testText)) {
          return 'utf8'
        }
      } catch {
        // UTF-8解码失败，可能是其他编码
      }

      // 默认尝试GBK（常见的中文编码）
      return 'gbk'
    } catch (error) {
      console.error('检测编码失败:', error)
      return 'utf8' // 默认UTF-8
    }
  }

  /**
   * 解析LRC歌词文件
   */
  parseLyrics(filePath: string, encoding?: string): LyricsData {
    const detectedEncoding = encoding || this.detectEncoding(filePath)
    let content: string

    try {
      const buffer = readFileSync(filePath)
      if (detectedEncoding === 'utf8') {
        content = buffer.toString('utf8')
      } else {
        content = iconv.decode(buffer, detectedEncoding)
      }
    } catch (error) {
      throw new Error(`读取歌词文件失败: ${error}`)
    }

    const lines = content.split(/\r?\n/)
    const lyricsData: LyricsData = {
      lines: []
    }

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // 解析标签 [ti:标题] [ar:艺术家] [al:专辑] [offset:偏移]
      const tagMatch = trimmedLine.match(/^\[(ti|ar|al|offset):(.+)\]$/i)
      if (tagMatch) {
        const [, tag, value] = tagMatch
        switch (tag.toLowerCase()) {
          case 'ti':
            lyricsData.title = value
            break
          case 'ar':
            lyricsData.artist = value
            break
          case 'al':
            lyricsData.album = value
            break
          case 'offset':
            lyricsData.offset = parseInt(value, 10) || 0
            break
        }
        continue
      }

      // 解析时间标签 [mm:ss.xx] 或 [mm:ss]
      const timeMatches = trimmedLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{2}))?\]/g)
      const times: number[] = []

      for (const match of timeMatches) {
        const minutes = parseInt(match[1], 10)
        const seconds = parseInt(match[2], 10)
        const centiseconds = match[3] ? parseInt(match[3], 10) : 0
        const time = minutes * 60 + seconds + centiseconds / 100
        times.push(time)
      }

      // 提取歌词文本（移除所有时间标签）
      const text = trimmedLine.replace(/\[\d{2}:\d{2}(?:\.\d{2})?\]/g, '').trim()

      if (times.length > 0 && text) {
        // 如果有多个时间标签，为每个时间创建一行
        for (const time of times) {
          lyricsData.lines.push({
            time: time + (lyricsData.offset || 0) / 1000,
            text
          })
        }
      } else if (text && lyricsData.lines.length > 0) {
        // 如果没有时间标签但有文本，可能是上一行的延续
        const lastLine = lyricsData.lines[lyricsData.lines.length - 1]
        lastLine.text += ' ' + text
      }
    }

    // 按时间排序
    lyricsData.lines.sort((a, b) => a.time - b.time)

    return lyricsData
  }

  /**
   * 获取当前时间对应的歌词行索引
   */
  getCurrentLyricIndex(lyrics: LyricsData, currentTime: number): number {
    if (!lyrics.lines || lyrics.lines.length === 0) {
      return -1
    }

    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      if (lyrics.lines[i].time <= currentTime) {
        return i
      }
    }

    return -1
  }

  /**
   * 获取当前时间对应的歌词行
   */
  getCurrentLyric(lyrics: LyricsData, currentTime: number): LyricLine | null {
    const index = this.getCurrentLyricIndex(lyrics, currentTime)
    if (index >= 0 && index < lyrics.lines.length) {
      return lyrics.lines[index]
    }
    return null
  }
}
