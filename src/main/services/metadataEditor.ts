import { writeFileSync, readFileSync, existsSync } from 'fs'
import { extname, dirname, basename } from 'path'
// 动态加载 node-id3
const getNodeID3 = () => {
  try {
    return require('node-id3')
  } catch (error) {
    throw new Error('无法加载 node-id3 库')
  }
}

export interface MetadataUpdate {
  title?: string
  artist?: string
  album?: string
  year?: number
  genre?: string
  coverPath?: string | null
}

export default class MetadataEditor {
  /**
   * 更新音乐文件的 ID3 标签
   */
  async updateMetadata(filePath: string, updates: MetadataUpdate): Promise<void> {
    const ext = extname(filePath).toLowerCase()

    // 只支持 MP3 格式
    if (ext !== '.mp3') {
      throw new Error(`不支持的文件格式: ${ext}，目前只支持 MP3 格式`)
    }

    if (!existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    try {
      const nodeID3 = getNodeID3()

      // 读取现有标签
      const existingTags = nodeID3.read(filePath) || {}

      // 构建新的标签对象
      const tags: any = {
        ...existingTags,
        title: updates.title !== undefined ? updates.title : existingTags.title,
        artist: updates.artist !== undefined ? updates.artist : existingTags.artist,
        album: updates.album !== undefined ? updates.album : existingTags.album,
        year: updates.year !== undefined ? String(updates.year) : existingTags.year,
        genre: updates.genre !== undefined ? updates.genre : existingTags.genre
      }

      // 处理封面图片
      if (updates.coverPath !== undefined) {
        if (updates.coverPath && existsSync(updates.coverPath)) {
          const coverBuffer = readFileSync(updates.coverPath)
          const coverExt = extname(updates.coverPath).toLowerCase()
          let mimeType = 'image/jpeg'

          if (coverExt === '.png') {
            mimeType = 'image/png'
          } else if (coverExt === '.gif') {
            mimeType = 'image/gif'
          }

          tags.image = {
            mime: mimeType,
            type: {
              id: 3, // Front cover
              name: 'Cover (front)'
            },
            description: 'Cover',
            imageBuffer: coverBuffer
          }
        } else {
          // 删除封面
          tags.image = undefined
        }
      }

      // 写入标签
      const success = nodeID3.write(tags, filePath)

      if (!success) {
        throw new Error('写入 ID3 标签失败')
      }
    } catch (error: any) {
      throw new Error(`更新元数据失败: ${error.message}`)
    }
  }

  /**
   * 批量更新多个文件的元数据
   */
  async batchUpdateMetadata(
    filePaths: string[],
    updates: MetadataUpdate,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: Array<{ file: string; error: string }> }> {
    let success = 0
    let failed = 0
    const errors: Array<{ file: string; error: string }> = []

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      try {
        await this.updateMetadata(filePath, updates)
        success++
      } catch (error: any) {
        failed++
        errors.push({
          file: basename(filePath),
          error: error.message || '未知错误'
        })
      }

      if (onProgress) {
        onProgress(i + 1, filePaths.length)
      }
    }

    return { success, failed, errors }
  }

  /**
   * 从文件读取封面图片并保存到指定位置
   */
  async extractCover(filePath: string, outputPath: string): Promise<void> {
    const ext = extname(filePath).toLowerCase()

    if (ext !== '.mp3') {
      throw new Error(`不支持的文件格式: ${ext}`)
    }

    try {
      const nodeID3 = getNodeID3()
      const tags = nodeID3.read(filePath)

      if (!tags || !tags.image) {
        throw new Error('文件中没有封面图片')
      }

      const imageBuffer = tags.image.imageBuffer
      if (!imageBuffer) {
        throw new Error('无法读取封面图片数据')
      }

      writeFileSync(outputPath, imageBuffer)
    } catch (error: any) {
      throw new Error(`提取封面失败: ${error.message}`)
    }
  }
}
