import chokidar from 'chokidar'
import MusicDatabase from '../database/db'
import FileScanner from './fileScanner'
import type { ScanOptions } from '@shared/types/music'

interface FileChange {
  type: 'add' | 'delete' | 'change'
  path: string
}

export default class FileMonitor {
  private db: MusicDatabase
  private scanner: FileScanner
  private watchers: Map<string, any> = new Map()
  private changeQueue: FileChange[] = []
  private processing = false
  private processTimer: NodeJS.Timeout | null = null

  constructor(db: MusicDatabase) {
    this.db = db
    this.scanner = new FileScanner(db)
  }

  /**
   * 防抖处理
   */
  private debouncedProcess(): void {
    if (this.processTimer) {
      clearTimeout(this.processTimer)
    }
    this.processTimer = setTimeout(() => {
      this.processChanges()
    }, 500)
  }

  /**
   * 监控目录
   */
  watchDirectory(directoryPath: string, options: {
    recursive?: boolean
    fileTypes?: string[]
    excludePaths?: string[]
  } = {}): void {
    // 如果已经在监控，先停止
    if (this.watchers.has(directoryPath)) {
      this.unwatchDirectory(directoryPath)
    }

    const {
      recursive = true,
      fileTypes = ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
      excludePaths = []
    } = options

    // 创建监控器
    const watcher = chokidar.watch(directoryPath, {
      ignored: (path) => {
        // 排除路径
        if (excludePaths.some(exclude => path.includes(exclude))) {
          return true
        }
        // 只监控音频文件
        if (!recursive && !path.startsWith(directoryPath)) {
          return true
        }
        return false
      },
      persistent: true,
      ignoreInitial: true, // 不处理初始文件
      depth: recursive ? undefined : 0
    })

    // 监听文件变化
    watcher.on('add', (path) => {
      if (this.isAudioFile(path, fileTypes)) {
        this.addChange({ type: 'add', path })
      }
    })

    watcher.on('unlink', (path) => {
      if (this.isAudioFile(path, fileTypes)) {
        this.addChange({ type: 'delete', path })
      }
    })

    watcher.on('change', (path) => {
      if (this.isAudioFile(path, fileTypes)) {
        this.addChange({ type: 'change', path })
      }
    })

    watcher.on('error', (error) => {
      console.error('文件监控错误:', error)
    })

    this.watchers.set(directoryPath, watcher)
    console.log(`开始监控目录: ${directoryPath}`)
  }

  /**
   * 停止监控目录
   */
  unwatchDirectory(directoryPath: string): void {
    const watcher = this.watchers.get(directoryPath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(directoryPath)
      console.log(`停止监控目录: ${directoryPath}`)
    }
  }

  /**
   * 停止所有监控
   */
  stopAll(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close()
    }
    this.watchers.clear()
    this.changeQueue = []
    console.log('已停止所有文件监控')
  }

  /**
   * 检查是否是音频文件
   */
  private isAudioFile(path: string, fileTypes: string[]): boolean {
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
    return fileTypes.includes(ext)
  }

  /**
   * 添加变化到队列
   */
  private addChange(change: FileChange): void {
    this.changeQueue.push(change)
    this.debouncedProcess()
  }

  /**
   * 处理变化队列
   */
  private async processChanges(): Promise<void> {
    if (this.processing || this.changeQueue.length === 0) {
      return
    }

    this.processing = true

    try {
      // 批量处理（最多100个）
      const batch = this.changeQueue.splice(0, 100)

      // 分组处理
      const deletes = batch.filter(c => c.type === 'delete')
      const adds = batch.filter(c => c.type === 'add')
      const changes = batch.filter(c => c.type === 'change')

      // 处理删除
      for (const change of deletes) {
        try {
          this.db.deleteMusicByPath(change.path)
        } catch (error) {
          console.error(`删除文件记录失败: ${change.path}`, error)
        }
      }

      // 处理新增和修改（合并为扫描）
      const toScan = [...adds, ...changes].map(c => c.path)
      if (toScan.length > 0) {
        // 获取目录路径
        const path = require('path')
        const dirs = new Set<string>()
        toScan.forEach(filePath => {
          dirs.add(path.dirname(filePath))
        })

        // 扫描每个目录
        for (const dir of dirs) {
          try {
            await this.scanner.scanDirectory(dir, {
              recursive: false,
              fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
              excludePaths: [],
              onProgress: () => {} // 静默扫描
            })
          } catch (error) {
            console.error(`扫描目录失败: ${dir}`, error)
          }
        }
      }

      console.log(`处理了 ${batch.length} 个文件变化 (删除: ${deletes.length}, 新增/修改: ${toScan.length})`)
    } catch (error) {
      console.error('处理文件变化失败:', error)
    } finally {
      this.processing = false

      // 如果还有未处理的，继续处理
      if (this.changeQueue.length > 0) {
        setTimeout(() => this.processChanges(), 1000)
      }
    }
  }
}
