import { readFileSync, existsSync, readdirSync } from 'fs'
import { dirname, join, extname, basename } from 'path'
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
   * 自动查找同目录歌词文件（只认 .lrc）
   *
   * Windows / macOS 默认文件系统不区分大小写，`.LRC` 与 `.lrc` 是同一个文件，
   * 逐个扩展名 existsSync 是白费（原本还多试了 .LRC/.txt/.TXT 共 4 次）。
   * Linux 区分大小写，交给目录索引的小写归一兜住。
   */
  findLyricsFile(musicFilePath: string): string | null {
    try {
      if (!musicFilePath) return null

      const dir = dirname(musicFilePath)
      const baseName = basename(musicFilePath, extname(musicFilePath))
      if (!baseName) return null

      // 1. 精确同名 .lrc：一次 stat（命中即免去目录遍历）
      const exact = join(dir, `${baseName}.lrc`)
      if (existsSync(exact)) return exact

      // 2. 目录索引：兜住大小写与 NFC/NFD 差异
      return this.lyricIndexFor(dir).get(baseName.toLowerCase().normalize('NFC')) ?? null
    } catch (error) {
      console.error('❌ 查找歌词文件出错:', error)
    }

    return null
  }

  /**
   * 同目录已有的歌词路径（无则 null）
   *
   * 只查目录索引，**不做 stat、不打日志**：批量枚举要逐首判断几万次，
   * 逐首 stat 会把主进程卡住。索引已按小写 NFC 归一。
   */
  findSidecarLyrics(musicFilePath: string): string | null {
    if (!musicFilePath) return null
    const dir = dirname(musicFilePath)
    const base = basename(musicFilePath, extname(musicFilePath)).toLowerCase().normalize('NFC')
    if (!base) return null
    return this.lyricIndexFor(dir).get(base) ?? null
  }

  /** 曲目同目录是否已有同名 .lrc（忽略大小写与 NFC/NFD 差异） */
  hasSidecarLyrics(musicFilePath: string): boolean {
    return this.findSidecarLyrics(musicFilePath) !== null
  }

  /** 清空目录索引缓存（目录内容变化后调用） */
  clearLyricCache(): void {
    this.dirLyricIndex.clear()
  }

  /** 目录内 .lrc 索引（小写 NFC basename → 完整路径），按目录缓存复用 */
  private dirLyricIndex = new Map<string, Map<string, string>>()

  private lyricIndexFor(dir: string): Map<string, string> {
    const cached = this.dirLyricIndex.get(dir)
    if (cached) return cached

    const index = new Map<string, string>()
    try {
      for (const name of readdirSync(dir)) {
        if (extname(name).toLowerCase() !== '.lrc') continue
        const base = basename(name, extname(name)).toLowerCase().normalize('NFC')
        if (!index.has(base)) index.set(base, join(dir, name))
      }
    } catch {
      // 目录不可读：当作没有歌词
    }
    this.dirLyricIndex.set(dir, index)
    return index
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
