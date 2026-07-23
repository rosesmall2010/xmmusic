import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import MusicDatabase from '../database/db'
import type { MusicItem } from '../../shared/types/music'

export interface ExportOptions {
  organizeBy?: 'none' | 'artist' | 'album' | 'original'
  conflictAction?: 'skip' | 'overwrite' | 'rename'
  onProgress?: (progress: ExportProgress) => void
}

export interface ExportProgress {
  current: number
  total: number
  fileName: string
  success: number
  failed: number
  skipped: number
}

export default class FileExporter {
  private db: MusicDatabase

  constructor(db: MusicDatabase) {
    this.db = db
  }

  /**
   * 导出音乐文件到指定目录
   */
  async exportMusicFiles(
    musicIds: number[],
    targetDir: string,
    options: ExportOptions = {}
  ): Promise<{ success: number; failed: number; skipped: number; errors: string[] }> {
    const {
      organizeBy = 'none',
      conflictAction = 'skip',
      onProgress
    } = options

    const result = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[]
    }

    // 获取音乐列表
    const musicList: MusicItem[] = []
    for (const id of musicIds) {
      const music = this.db.getMusicById(id)
      if (music) musicList.push(music)
    }

    if (musicList.length === 0) {
      throw new Error('没有可导出的音乐')
    }

    // 确保目标目录存在
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    const total = musicList.length

    // 导出每个文件
    for (let i = 0; i < musicList.length; i++) {
      const music = musicList[i]
      try {
        let targetPath = this.getTargetPath(music, targetDir, organizeBy)

        // 处理文件冲突
        if (existsSync(targetPath)) {
          if (conflictAction === 'skip') {
            result.skipped++
            onProgress?.({
              current: i + 1,
              total,
              fileName: music.fileName,
              success: result.success,
              failed: result.failed,
              skipped: result.skipped
            })
            await yieldEventLoop()
            continue
          } else if (conflictAction === 'rename') {
            targetPath = this.generateUniquePath(targetPath)
          }
          // 'overwrite' 直接使用原路径
        }

        // 确保目标目录存在
        const targetDirPath = dirname(targetPath)
        if (!existsSync(targetDirPath)) {
          mkdirSync(targetDirPath, { recursive: true })
        }

        // 复制文件
        copyFileSync(music.filePath, targetPath)
        result.success++
      } catch (error: any) {
        result.failed++
        result.errors.push(`${music.fileName}: ${error.message}`)
      }

      onProgress?.({
        current: i + 1,
        total,
        fileName: music.fileName,
        success: result.success,
        failed: result.failed,
        skipped: result.skipped
      })
      // 让出事件循环，保证进度 IPC 能及时送达渲染进程
      await yieldEventLoop()
    }

    return result
  }

  /**
   * 获取目标文件路径
   */
  private getTargetPath(music: MusicItem, targetDir: string, organizeBy: string): string {
    const fileName = basename(music.filePath)

    switch (organizeBy) {
      case 'artist': {
        const artistDir = music.artist || '未知艺术家'
        return join(targetDir, this.sanitizePath(artistDir), fileName)
      }

      case 'album': {
        const albumDir = music.album || '未知专辑'
        const artistDir2 = music.artist || '未知艺术家'
        return join(targetDir, this.sanitizePath(artistDir2), this.sanitizePath(albumDir), fileName)
      }

      case 'original':
        // 保持原始目录结构（相对于某个根目录）
        return join(targetDir, music.filePath.replace(/^[A-Z]:\\/, '').replace(/^\//, ''))

      case 'none':
      default:
        return join(targetDir, fileName)
    }
  }

  /**
   * 清理路径中的非法字符
   */
  private sanitizePath(path: string): string {
    return path.replace(/[<>:"/\\|?*]/g, '_').trim()
  }

  /**
   * 生成唯一路径（添加数字后缀）
   */
  private generateUniquePath(originalPath: string): string {
    const dir = dirname(originalPath)
    const ext = originalPath.substring(originalPath.lastIndexOf('.'))
    const base = basename(originalPath, ext)

    let counter = 1
    let newPath = join(dir, `${base}_${counter}${ext}`)

    while (existsSync(newPath)) {
      counter++
      newPath = join(dir, `${base}_${counter}${ext}`)
    }

    return newPath
  }
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
