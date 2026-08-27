import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import iconv from 'iconv-lite'
// 动态加载 node-id3
const getNodeID3 = () => {
  try {
    return require('node-id3')
  } catch (error) {
    throw new Error('无法加载 node-id3 库')
  }
}

// 支持的编码列表
const SUPPORTED_ENCODINGS = [
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
   * 读取原始ID3标签（可能包含乱码）
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
   * 检测ID3标签的编码
   */
  async detectEncoding(filePath: string): Promise<EncodingDetection[]> {
    const results: EncodingDetection[] = []

    try {
      // 读取ID3标签（原始字节）
      const nodeID3 = getNodeID3()
      const tags = nodeID3.read(filePath)

      if (!tags) {
        return results
      }

      // 获取原始标签值（可能是乱码的）；流派也参与检测
      const rawTitle = tags.title || ''
      const rawArtist = tags.artist || ''
      const rawAlbum = tags.album || ''
      const rawYear = tags.year || ''
      const rawGenre = tags.genre || ''

      // 尝试每种编码
      for (const encoding of SUPPORTED_ENCODINGS) {
        try {
          const title = this.tryDecode(rawTitle, encoding)
          const artist = this.tryDecode(rawArtist, encoding)
          const album = this.tryDecode(rawAlbum, encoding)
          const year = rawYear ? this.tryDecode(rawYear, encoding) : undefined
          const genre = rawGenre ? this.tryDecode(rawGenre, encoding) : undefined

          const confidence = this.calculateConfidence(title, artist, album, genre)

          if (confidence > 0.3) {
            results.push({
              encoding,
              confidence,
              preview: { title, artist, album, year, genre }
            })
          }
        } catch (error) {
          // 编码失败，跳过
        }
      }

      // 按置信度排序
      results.sort((a, b) => b.confidence - a.confidence)
    } catch (error) {
      console.error('检测编码失败:', error)
    }

    return results
  }

  /**
   * 尝试使用指定编码解码字符串
   */
  private tryDecode(value: string, encoding: Encoding): string {
    if (!value) return ''

    try {
      // 如果已经是UTF-8，直接返回
      if (encoding === 'utf8') {
        return value
      }

      // 将字符串转换为Buffer，然后使用指定编码解码
      // 注意：这里假设value可能是用其他编码存储的
      const buffer = Buffer.from(value, 'latin1') // 先按latin1读取原始字节
      return iconv.decode(buffer, encoding)
    } catch (error) {
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
   * 转换ID3标签编码（不写入文件，只返回转换后的值）
   */
  public convertID3TagsEncoding(
    rawTags: Id3TagFields,
    sourceEncoding: Encoding
  ): Id3TagFields {
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
    }

    return { success, failed, results }
  }
}
