import type { ScanProgress, ScanState } from '@shared/types/music'
import MusicDatabase from '../database/db'
import FileScanner from './fileScanner'

class ScanManager {
  private state: ScanState = {
    isScanning: false,
    isPaused: false,
    isCancelled: false,
    progress: null,
    currentPath: null
  }

  private currentScanner: FileScanner | null = null
  private db: MusicDatabase
  /**
   * 扫描轮次。cancel() 会立刻把 isScanning 置 false 让界面可以马上再扫，
   * 但被取消的那一轮还在 unwind，它的 finally 不能把新一轮的状态清掉。
   */
  private runGeneration = 0

  constructor() {
    this.db = MusicDatabase.getInstance()
  }

  getState(): ScanState {
    return { ...this.state }
  }

  setScanning(scanning: boolean): void {
    this.state.isScanning = scanning
    if (!scanning) {
      this.state.isPaused = false
      this.state.isCancelled = false
      this.currentScanner = null
      this.state.progress = null
      this.state.currentPath = null
    }
  }

  setPaused(paused: boolean): void {
    this.state.isPaused = paused
    if (this.currentScanner) {
      this.currentScanner.setPaused(paused)
    }
  }

  setCancelled(cancelled: boolean): void {
    this.state.isCancelled = cancelled
    if (cancelled) {
    this.state.isScanning = false
    this.state.isPaused = false
      if (this.currentScanner) {
        this.currentScanner.setCancelled(true)
      }
    }
  }

  setProgress(progress: ScanProgress | null): void {
    this.state.progress = progress
  }

  setCurrentPath(path: string | null): void {
    this.state.currentPath = path
  }

  /**
   * 供 scan-music-folder 等独立扫描入口注册/清空当前扫描器，
   * 使通用的暂停/取消能转发到真正在跑的扫描器实例
   */
  setScanner(scanner: FileScanner | null): void {
    this.currentScanner = scanner
  }

  /**
   * 开始扫描（v1.0.6 更新：扫描所有配置的目录）
   */
  async startScan(options: {
    onProgress?: (progress: ScanProgress & { currentDirectory?: string }) => void
    concurrency?: number
    fileTypes?: string[]
    excludePaths?: string[]
    forceRescan?: boolean
  }): Promise<{
    success: number
    failed: number
    corrupted: number
    skipped: number
    duration: number
    errors: Array<{ file: string; error: string }>
  }> {
    if (this.state.isScanning) {
      throw new Error('扫描已在进行中')
    }

    const gen = ++this.runGeneration
    this.state.isScanning = true
    this.state.isPaused = false
    this.state.isCancelled = false

    try {
      const scanner = new FileScanner(this.db)
      this.currentScanner = scanner

      const result = await scanner.scanAllDirectories({
        recursive: true,
        fileTypes: options.fileTypes || ['.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg', '.wma'],
        excludePaths: options.excludePaths || [],
        concurrency: options.concurrency || 10,
        forceRescan: options.forceRescan || false,
        onProgress: (progress) => {
          // 被取代的旧轮次（已取消但仍在 unwind）不得再推进度，
          // 否则会覆盖新一轮的状态、界面出现回跳
          if (this.runGeneration !== gen) return
          this.state.progress = progress
          if (options.onProgress) {
            options.onProgress(progress as any)
          }
        }
      })

      return result
    } finally {
      // 本轮若已被更新的一轮取代（取消后立刻重扫），不要清对方的状态
      if (this.runGeneration === gen) {
        this.state.isScanning = false
        this.currentScanner = null
        this.state.progress = null
        this.state.currentPath = null
      }
    }
  }

  pause(): void {
    if (this.state.isScanning && !this.state.isPaused) {
      this.state.isPaused = true
      if (this.currentScanner) {
        this.currentScanner.setPaused(true)
      }
    }
  }

  resume(): void {
    if (this.state.isPaused) {
      this.state.isPaused = false
      if (this.currentScanner) {
        this.currentScanner.setPaused(false)
      }
    }
  }

  cancel(): void {
    if (this.state.isScanning) {
      this.state.isCancelled = true
      this.state.isPaused = false
      this.state.isScanning = false
      if (this.currentScanner) {
        this.currentScanner.setCancelled(true)
      }
    }
  }
}

export default new ScanManager()
