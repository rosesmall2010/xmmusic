import { basename } from 'path'
import tagWorkerClient from './tagWorkerClient'

export interface MetadataUpdate {
  title?: string
  artist?: string
  album?: string
  year?: number
  genre?: string
  coverPath?: string | null
}

/**
 * 元数据编辑：对外接口不变，内部改为转发给标签 worker
 *
 * 原来这里在 `async` 壳里跑同步的 node-id3 读写（整首 MP3 读进内存再重写），
 * 会占满主线程；批量匹配几百首时界面假死、取消也回不去。
 * 现在重活交给 worker 线程，本类只负责转发，调用方（handlers / coverMatchService）无需改动。
 */
export default class MetadataEditor {
  /**
   * 更新音乐文件的 ID3 标签
   */
  async updateMetadata(filePath: string, updates: MetadataUpdate): Promise<void> {
    await tagWorkerClient.updateMetadata(filePath, updates)
  }

  /**
   * 批量更新多个文件的元数据
   * onProgress 仍在主进程侧回调，UI 进度表现不变
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
    await tagWorkerClient.extractCover(filePath, outputPath)
  }
}
