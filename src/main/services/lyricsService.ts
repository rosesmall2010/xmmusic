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
   */
  /**
   * 检测文件编码
   */
  detectEncoding(filePath: string): 'utf8' | 'gbk' {
    try {
      const buffer = readFileSync(filePath)

      // 1. 检查 BOM
      // UTF-8 BOM
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf8'
      }
      // UTF-16 LE BOM
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf8' // iconv-lite 会自动处理
      }
      // UTF-16 BE BOM
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf8' // iconv-lite 会自动处理
      }

      // 2. 尝试 UTF-8 解码
      // 检查是否包含无效的 UTF-8 序列（会被替换为 ）
      const utf8Text = buffer.toString('utf8')
      if (utf8Text.includes('')) {
        return 'gbk'
      }

      // 3. 检查是否包含中文字符
      // 如果是有效的 UTF-8 且包含中文，那就是 UTF-8
      if (/[\u4e00-\u9fa5]/.test(utf8Text)) {
        return 'utf8'
      }

      // 4. 纯 ASCII 或其他情况，默认 UTF-8
      // 如果是纯 ASCII，UTF-8 和 GBK 是一样的
      return 'utf8'
    } catch (error) {
      console.error('检测编码失败:', error)
      return 'utf8' // 默认
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
      const altEncoding = detectedEncoding === 'utf8' ? 'gbk' : 'utf8'
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
        content = buffer.toString('utf8')
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
      const timeMatches = trimmedLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g)
      const times: number[] = []

      for (const match of timeMatches) {
        const minutes = parseInt(match[1], 10)
        const seconds = parseInt(match[2], 10)
        // 支持2位或3位毫秒数
        const msStr = match[3] || '0'
        const ms = parseInt(msStr, 10)
        // 如果是2位，则是百分之一秒；如果是3位，则是毫秒
        const centiseconds = msStr.length === 3 ? ms / 10 : ms

        const time = minutes * 60 + seconds + centiseconds / 100
        times.push(time)
      }

      // 提取歌词文本（移除所有时间标签）
      const text = trimmedLine.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim()

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
