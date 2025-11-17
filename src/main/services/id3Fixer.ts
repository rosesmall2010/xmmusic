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
  }
}

interface FixResult {
  success: boolean
  message: string
  backupPath?: string
  fixedTags?: {
    title?: string
    artist?: string
    album?: string
  }
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

      // 获取原始标签值（可能是乱码的）
      const rawTitle = tags.title || ''
      const rawArtist = tags.artist || ''
      const rawAlbum = tags.album || ''

      // 尝试每种编码
      for (const encoding of SUPPORTED_ENCODINGS) {
        try {
          // 将原始字节转换为指定编码的字符串
          const title = this.tryDecode(rawTitle, encoding)
          const artist = this.tryDecode(rawArtist, encoding)
          const album = this.tryDecode(rawAlbum, encoding)

          // 计算置信度（基于是否包含常见中文字符、是否可打印等）
          const confidence = this.calculateConfidence(title, artist, album)

          if (confidence > 0.3) {
            results.push({
              encoding,
              confidence,
              preview: { title, artist, album }
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
   * 计算置信度（0-1）
   */
  private calculateConfidence(title: string, artist: string, album: string): number {
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
    fields?: { title?: boolean; artist?: boolean; album?: boolean }
  ): Promise<FixResult> {
    try {
      // 1. 备份原文件
      const backupPath = await this.backupFile(filePath)

      // 2. 读取当前标签
      const nodeID3 = getNodeID3()
      const tags = nodeID3.read(filePath)
      if (!tags) {
        return {
          success: false,
          message: '无法读取ID3标签'
        }
      }

      // 3. 准备修复后的标签
      const fixedTags: any = {}

      // 4. 修复指定字段
      const fieldsToFix = fields || { title: true, artist: true, album: true }

      if (fieldsToFix.title && tags.title) {
        fixedTags.title = this.tryDecode(tags.title, sourceEncoding)
      }

      if (fieldsToFix.artist && tags.artist) {
        fixedTags.artist = this.tryDecode(tags.artist, sourceEncoding)
      }

      if (fieldsToFix.album && tags.album) {
        fixedTags.album = this.tryDecode(tags.album, sourceEncoding)
      }

      // 5. 更新标签
      nodeID3.write(fixedTags, filePath)

      return {
        success: true,
        message: '修复成功',
        backupPath,
        fixedTags: {
          title: fixedTags.title,
          artist: fixedTags.artist,
          album: fixedTags.album
        }
      }
    } catch (error: any) {
      return {
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
    fields?: { title?: boolean; artist?: boolean; album?: boolean },
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
