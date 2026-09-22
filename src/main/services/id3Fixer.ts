import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import iconv from 'iconv-lite'
import { autoDecodeId3Tags, autoDecodeTagString } from './id3TextDecode'

// 动态加载 node-id3
const getNodeID3 = () => {
  try {
    return require('node-id3')
  } catch (error) {
    throw new Error('无法加载 node-id3 库')
  }
}

// 支持的编码列表（auto = mp3info 风格自动识别）
const SUPPORTED_ENCODINGS = [
  'auto',
  'utf8',
  'gbk',
  'gb2312',
  'big5',
  'utf16le',
  'latin1'
] as const

type Encoding = typeof SUPPORTED_ENCODINGS[number]

interface EncodingDetection {
  encoding: Encoding
  confidence: number
  preview: {
    title: string
    artist: string
    album: string
    year?: string
    genre?: string
  }
}

interface FixResult {
  filePath: string
  success: boolean
  message: string
  backupPath?: string
  fixedTags?: {
    title?: string
    artist?: string
    album?: string
    year?: string
    genre?: string
  }
}

export type Id3TagFields = {
  title: string
  artist: string
  album: string
  year?: string
  genre?: string
}

export type Id3FixFieldFlags = {
  title?: boolean
  artist?: boolean
  album?: boolean
  year?: boolean
  genre?: boolean
}

// 部分老版本打标签工具在字段为空时会写入字面文本 "null"/"undefined"，视为无效值
function sanitizeTagValue(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  return /^(null|undefined)$/i.test(value.trim()) ? undefined : value
}

export default class ID3Fixer {
  private backupDir: string

  constructor() {
    // 备份目录：应用数据目录/id3_backups
    const userDataPath = app.getPath('userData')
    this.backupDir = join(userDataPath, 'id3_backups')

    // 确保备份目录存在
    try {
      mkdirSync(this.backupDir, { recursive: true })
    } catch (error) {
      // 目录可能已存在，忽略错误
    }
  }

  /**
   * 读取 ID3 标签原始字符串（node-id3 读出，可能仍是乱码；供 UI 展示「原始」列）
   */
  async readRawID3Tags(filePath: string): Promise<Id3TagFields | null> {
    try {
      const nodeID3 = getNodeID3()
      const tags = nodeID3.read(filePath)

      if (!tags) {
        return null
      }

      return {
        title: sanitizeTagValue(tags.title) || '',
        artist: sanitizeTagValue(tags.artist) || '',
        album: sanitizeTagValue(tags.album) || '',
        year: sanitizeTagValue(tags.year),
        genre: sanitizeTagValue(tags.genre)
      }
    } catch (error) {
      console.error('读取ID3标签失败:', error)
      return null
    }
  }

  /**
   * 读取并自动识别编码后的 ID3 标签（扫描入库 / 一键自动转码用）
   */
  async readAutoDecodedID3Tags(filePath: string): Promise<Id3TagFields | null> {
    const raw = await this.readRawID3Tags(filePath)
    if (!raw) return null
    const decoded = autoDecodeId3Tags(raw)
    return {
      title: decoded.title,
      artist: decoded.artist,
      album: decoded.album,
      year: decoded.year,
      genre: decoded.genre
    }
  }

  /**
   * 检测 ID3 标签编码：优先给出 auto 结果，并附带手动编码预览供对照
   */
  async detectEncoding(filePath: string): Promise<EncodingDetection[]> {
    const results: EncodingDetection[] = []

    try {
      const raw = await this.readRawID3Tags(filePath)
      if (!raw) return results

      const auto = autoDecodeId3Tags(raw)
      const autoConfidence = this.calculateConfidence(
        auto.title,
        auto.artist,
        auto.album,
        auto.genre
      )
      results.push({
        encoding: 'auto',
        // 不抬高置信度地板，避免垃圾结果排到前面
        confidence: autoConfidence,
        preview: {
          title: auto.title,
          artist: auto.artist,
          album: auto.album,
          year: auto.year,
          genre: auto.genre
        }
      })

      // 手动编码预览（不含 auto）
      for (const encoding of SUPPORTED_ENCODINGS) {
        if (encoding === 'auto') continue
        try {
          const title = this.tryDecode(raw.title, encoding)
          const artist = this.tryDecode(raw.artist, encoding)
          const album = this.tryDecode(raw.album, encoding)
          const year = raw.year ? this.tryDecode(raw.year, encoding) : undefined
          const genre = raw.genre ? this.tryDecode(raw.genre, encoding) : undefined

          const confidence = this.calculateConfidence(title, artist, album, genre)

          if (confidence > 0.3) {
            results.push({
              encoding,
              confidence,
              preview: { title, artist, album, year, genre }
            })
          }
        } catch {
          // 编码失败，跳过
        }
      }

      results.sort((a, b) => b.confidence - a.confidence)
    } catch (error) {
      console.error('检测编码失败:', error)
    }

    return results
  }

  /**
   * 尝试使用指定编码解码字符串（auto 走 mp3info 自动识别）
   */
  private tryDecode(value: string, encoding: Encoding): string {
    if (!value) return ''

    try {
      if (encoding === 'auto') {
        return autoDecodeTagString(value).text
      }
      if (encoding === 'utf8') {
        return value
      }

      // 先按 latin1 还原原始字节，再用指定编码解码
      const buffer = Buffer.from(value, 'latin1')
      return iconv.decode(buffer, encoding)
    } catch {
      return value
    }
  }

  /**
   * 转换单个字段编码（不写文件）
   */
  public convertFieldEncoding(value: string, sourceEncoding: Encoding): string {
    return this.tryDecode(value || '', sourceEncoding)
  }

  /**
   * 转换 ID3 标签编码（不写入文件，只返回转换后的值）
   * sourceEncoding = 'auto' 时使用 mp3info 自动识别（含 Big5 乱码还原）
   */
  public convertID3TagsEncoding(
    rawTags: Id3TagFields,
    sourceEncoding: Encoding
  ): Id3TagFields {
    if (sourceEncoding === 'auto') {
      const decoded = autoDecodeId3Tags(rawTags)
      return {
        title: decoded.title,
        artist: decoded.artist,
        album: decoded.album,
        year: decoded.year,
        genre: decoded.genre
      }
    }
    return {
      title: this.tryDecode(rawTags.title, sourceEncoding),
      artist: this.tryDecode(rawTags.artist, sourceEncoding),
      album: this.tryDecode(rawTags.album, sourceEncoding),
      year: rawTags.year ? this.tryDecode(rawTags.year, sourceEncoding) : undefined,
      genre: rawTags.genre ? this.tryDecode(rawTags.genre, sourceEncoding) : undefined
    }
  }

  /**
   * 计算置信度（0-1）；流派纳入检测，避免仅流派乱码时漏判
   */
  private calculateConfidence(
    title: string,
    artist: string,
    album: string,
    genre?: string
  ): number {
    let score = 0
    let total = 0

    const checkString = (str: string) => {
      if (!str) return
      total++

      // 检查是否包含常见中文字符
      const chineseRegex = /[\u4e00-\u9fa5]/
      if (chineseRegex.test(str)) {
        score += 0.5
      }

      // 检查是否包含可打印ASCII字符
      const asciiRegex = /^[\x20-\x7E]+$/
      if (asciiRegex.test(str)) {
        score += 0.3
      }

      // 检查是否包含乱码字符（控制字符、无效Unicode）
      const invalidRegex = /[\x00-\x08\x0B-\x0C\x0E-\x1F\uFFFD]/
      if (!invalidRegex.test(str)) {
        score += 0.2
      }
    }

    checkString(title)
    checkString(artist)
    checkString(album)
    if (genre) checkString(genre)

    return total > 0 ? score / total : 0
  }

  /**
   * 备份文件
   */
  private async backupFile(filePath: string): Promise<string> {
    const timestamp = Date.now()
    const fileName = `${timestamp}_${filePath.split(/[/\\]/).pop()}`
    const backupPath = join(this.backupDir, fileName)

    try {
      copyFileSync(filePath, backupPath)
      return backupPath
    } catch (error) {
      throw new Error(`备份文件失败: ${error}`)
    }
  }

  /**
   * 修复ID3标签
   */
  async fixID3Tags(
    filePath: string,
    sourceEncoding: Encoding,
    fields?: Id3FixFieldFlags
  ): Promise<FixResult> {
    try {
      // 1. 备份原文件
      const backupPath = await this.backupFile(filePath)

      // 2. 读取当前标签
      const nodeID3 = getNodeID3()
      const tags = nodeID3.read(filePath)
      if (!tags) {
        return {
          filePath,
          success: false,
          message: '无法读取ID3标签'
        }
      }

      // 3. 准备修复后的标签
      const fixedTags: any = {}

      // 4. 修复指定字段（默认含 title/artist/album/year/genre）
      const fieldsToFix: Id3FixFieldFlags = fields || {
        title: true,
        artist: true,
        album: true,
        year: true,
        genre: true
      }

      // auto：整包走自动识别，保证字段间策略一致；其它编码逐字段 tryDecode
      if (sourceEncoding === 'auto') {
        const decoded = autoDecodeId3Tags({
          title: tags.title || '',
          artist: tags.artist || '',
          album: tags.album || '',
          year: tags.year,
          genre: tags.genre
        })
        if (fieldsToFix.title && decoded.title) fixedTags.title = decoded.title
        if (fieldsToFix.artist && decoded.artist) fixedTags.artist = decoded.artist
        if (fieldsToFix.album && decoded.album) fixedTags.album = decoded.album
        if (fieldsToFix.year && decoded.year) fixedTags.year = decoded.year
        if (fieldsToFix.genre && decoded.genre) fixedTags.genre = decoded.genre
      } else {
        if (fieldsToFix.title && tags.title) {
          fixedTags.title = this.tryDecode(tags.title, sourceEncoding)
        }
        if (fieldsToFix.artist && tags.artist) {
          fixedTags.artist = this.tryDecode(tags.artist, sourceEncoding)
        }
        if (fieldsToFix.album && tags.album) {
          fixedTags.album = this.tryDecode(tags.album, sourceEncoding)
        }
        if (fieldsToFix.year && tags.year) {
          fixedTags.year = this.tryDecode(tags.year, sourceEncoding)
        }
        if (fieldsToFix.genre && tags.genre) {
          fixedTags.genre = this.tryDecode(tags.genre, sourceEncoding)
        }
      }

      // 5. 更新标签
      nodeID3.write(fixedTags, filePath)

      return {
        filePath,
        success: true,
        message: '修复成功',
        backupPath,
        fixedTags: {
          title: fixedTags.title,
          artist: fixedTags.artist,
          album: fixedTags.album,
          year: fixedTags.year,
          genre: fixedTags.genre
        }
      }
    } catch (error: any) {
      return {
        filePath,
        success: false,
        message: `修复失败: ${error.message}`
      }
    }
  }

  /**
   * 批量修复ID3标签
   */
  async fixID3TagsBatch(
    filePaths: string[],
    sourceEncoding: Encoding,
    fields?: Id3FixFieldFlags,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; results: FixResult[] }> {
    let success = 0
    let failed = 0
    const results: FixResult[] = []

    for (let i = 0; i < filePaths.length; i++) {
      const result = await this.fixID3Tags(filePaths[i], sourceEncoding, fields)
      results.push(result)

      if (result.success) {
        success++
      } else {
        failed++
      }

      if (onProgress) {
        onProgress(i + 1, filePaths.length)
      }

      // 让出事件循环，避免连续同步 IO 阻塞主进程
      await new Promise<void>(resolve => setImmediate(resolve))
    }

    return { success, failed, results }
  }
}
