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
      if (!musicFilePath) {
        console.warn('⚠️ 查找歌词文件：音乐文件路径为空')
        return null
      }

      const dir = dirname(musicFilePath)
      const ext = extname(musicFilePath)
      
      // 获取不带扩展名的文件名（使用 basename 更可靠）
      const { basename: pathBasename } = require('path')
      const baseName = pathBasename(musicFilePath, ext)

      if (!baseName) {
        console.warn('⚠️ 查找歌词文件：无法提取文件名', musicFilePath)
        return null
      }

      console.log(`🔍 查找歌词文件：目录=${dir}, 文件名=${baseName}`)

      // 1. 精确匹配（尝试常见扩展名）
      const extensions = ['.lrc', '.LRC', '.txt', '.TXT']
      for (const lrcExt of extensions) {
        // 重新构建路径，确保路径分隔符正确
        const path = join(dir, baseName + lrcExt)
        if (existsSync(path)) {
          console.log(`✅ 找到歌词文件（精确匹配）: ${path}`)
          return path
        }
      }

      // 2. 遍历目录进行模糊匹配（解决大小写和 NFC/NFD 问题）
      const { readdirSync } = require('fs')
      const { basename } = require('path')

      let files: string[] = []
      try {
        files = readdirSync(dir)
      } catch (error: any) {
        console.error('❌ 读取目录失败:', dir, error?.message || error)
        return null
      }

      const targetName = baseName.toLowerCase().normalize('NFC')
      console.log(`🔍 模糊匹配：目标文件名=${targetName}, 目录文件数=${files.length}`)

      for (const file of files) {
        const fileExt = extname(file).toLowerCase()
        if (fileExt !== '.lrc' && fileExt !== '.txt') continue

        const fileName = basename(file, extname(file))
        const normalizedFileName = fileName.toLowerCase().normalize('NFC')

        // 比较文件名（忽略大小写和 Unicode 规范化差异）
        if (normalizedFileName === targetName) {
          const foundPath = join(dir, file)
          console.log(`✅ 找到歌词文件（模糊匹配）: ${foundPath}`)
          return foundPath
        }
      }

      console.log(`⚠️ 未找到歌词文件：目录=${dir}, 目标文件名=${baseName}`)
    } catch (error) {
      console.error('❌ 查找歌词文件出错:', error)
    }

    return null
  }

  /**
   * 检测文件编码
   * 优先识别合法 UTF-8；仅当 UTF-8 非法时才回落 GBK（旧歌词常见）
   */
  detectEncoding(filePath: string): 'utf8' | 'gbk' | 'utf16le' | 'utf16be' {
    try {
      const buffer = readFileSync(filePath)

      // 1. BOM
      if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf8'
      }
      if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf16le'
      }
      if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf16be'
      }

      // 2. 严格校验是否为合法 UTF-8（原先误写 includes('')，恒真，导致无 BOM 的 UTF-8 全被判成 GBK）
      if (this.isValidUtf8(buffer)) {
        return 'utf8'
      }

      return 'gbk'
    } catch (error) {
      console.error('检测编码失败:', error)
      return 'utf8'
    }
  }

  /** Node Buffer 按 utf8 解码后若出现 U+FFFD，或 TextDecoder 严格模式失败，则非法 */
  private isValidUtf8(buffer: Buffer): boolean {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      decoder.decode(buffer)
      return true
    } catch {
      // TextDecoder fatal 不可用时，用替换符探测
      const text = buffer.toString('utf8')
      return !text.includes('\uFFFD')
    }
  }

  /**
   * 解析LRC歌词文件
   */
  parseLyrics(filePath: string, encoding?: string): LyricsData {
    // 第一次尝试
    let detectedEncoding = encoding || this.detectEncoding(filePath)
    let lyricsData = this.tryParse(filePath, detectedEncoding)

    // 如果解析失败（没有歌词行），且没有指定编码，尝试切换编码重试
    if ((!lyricsData.lines || lyricsData.lines.length === 0) && !encoding) {
      const altEncoding = detectedEncoding === 'utf8' || detectedEncoding.startsWith('utf16')
        ? 'gbk'
        : 'utf8'
      console.log(`歌词解析结果为空，尝试切换编码重试: ${detectedEncoding} -> ${altEncoding}`)
      const altLyricsData = this.tryParse(filePath, altEncoding)

      // 如果重试结果更好（有歌词行），则使用重试结果
      if (altLyricsData.lines && altLyricsData.lines.length > 0) {
        return altLyricsData
      }
    }

    return lyricsData
  }

  private tryParse(filePath: string, encoding: string): LyricsData {
    let content: string

    try {
      const buffer = readFileSync(filePath)
      if (encoding === 'utf8') {
        // 跳过 UTF-8 BOM
        const start = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
          ? 3
          : 0
        content = buffer.subarray(start).toString('utf8')
      } else if (encoding === 'utf16le' || encoding === 'utf16be') {
        content = iconv.decode(buffer, encoding)
      } else {
        content = iconv.decode(buffer, encoding)
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
      const timeMatches = trimmedLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g)
      const times: number[] = []

      for (const match of timeMatches) {
        const minutes = parseInt(match[1], 10)
        const seconds = parseInt(match[2], 10)
        // 小数位数不固定：1 位为十分之一秒，2 位为百分之一秒，3 位为毫秒
        const fractionStr = match[3] || '0'
        const fraction = parseInt(fractionStr, 10) / Math.pow(10, fractionStr.length)

        const time = minutes * 60 + seconds + fraction
        times.push(time)
      }

      // 提取歌词文本（移除所有时间标签）
      const text = trimmedLine.replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()

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
        // 但要注意不要把标签行误判为歌词
        if (!/^\[.+\]$/.test(text)) {
           const lastLine = lyricsData.lines[lyricsData.lines.length - 1]
           lastLine.text += ' ' + text
        }
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
