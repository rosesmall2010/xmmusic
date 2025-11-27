import { readdir, stat, writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { join, extname, basename } from 'path'
import { createRequire } from 'module'
import { app } from 'electron'
import MusicDatabase from '../database/db'
import type { ScanOptions, ScanResult, MusicItem } from '@shared/types/music'

// 动态加载 music-metadata（解决 Electron 中的 exports 问题）
// 使用字符串拼接完全隐藏模块名，避免 TypeScript 静态分析
let parseFileCache: any = null

const getParseFile = async () => {
  if (parseFileCache) {
    return parseFileCache
  }

  // 使用字符串拼接隐藏模块名
  const moduleName = 'music' + '-' + 'metadata'
  const libPath = moduleName + '/lib/index.js'

  try {
    // 方法1: 尝试使用动态导入（ES 模块）
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
    const mm = await dynamicImport(moduleName)
    parseFileCache = mm.parseFile
    return parseFileCache
  } catch (error) {
    try {
      // 方法2: 使用路径解析 + require（完全动态）
      const resolveFunc = eval('require.resolve') as (path: string) => string
      const mmPath = resolveFunc(libPath)
      const requireFunc = eval('require') as NodeRequire
      const mm = requireFunc(mmPath)
      parseFileCache = mm.parseFile
      return parseFileCache
    } catch (requireError: any) {
      // 方法3: 使用 createRequire（最后的尝试）
      try {
        const requireMM = createRequire(__filename)
        const mm = requireMM(moduleName)
        parseFileCache = mm.parseFile
        return parseFileCache
      } catch (finalError: any) {
        const errorMsg = (error as any)?.message || (requireError as any)?.message || (finalError as any)?.message
        throw new Error(`无法加载音乐元数据解析库: ${errorMsg}`)
      }
    }
  }
}

export default class FileScanner {
  private db: MusicDatabase
  private concurrency: number = 10
  private activeTasks: number = 0
  private isPaused: boolean = false
  private isCancelled: boolean = false

  constructor(db: MusicDatabase) {
    this.db = db
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused
  }

  setCancelled(cancelled: boolean): void {
    this.isCancelled = cancelled
  }

  async scanDirectory(path: string, options: ScanOptions): Promise<ScanResult> {
    const startTime = Date.now()
    const result: ScanResult = {
      success: 0,
      failed: 0,
      corrupted: 0,
      skipped: 0,
      duration: 0,
      errors: []
    }

    this.isPaused = false
    this.isCancelled = false

    // 收集所有文件
    const files = await this.collectFiles(path, options)
    const total = files.length
    let current = 0
    let lastProgressUpdate = 0
    const PROGRESS_UPDATE_INTERVAL = 100 // 每100ms最多更新一次进度

    // 进度更新函数（节流）
    const updateProgress = (file: string) => {
      const now = Date.now()
      if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
        lastProgressUpdate = now
        if (options.onProgress && !this.isCancelled) {
          // 使用 setImmediate 让出控制权，避免阻塞
          setImmediate(() => {
            if (options.onProgress) {
              options.onProgress({
                current,
                total,
                currentFile: file,
                speed: current / ((Date.now() - startTime) / 1000),
                percentage: (current / total) * 100
              })
            }
          })
        }
      }
    }

    // 处理文件
    const tasks = files.map(file => async () => {
      // 检查是否取消
      if (this.isCancelled) {
        throw new Error('扫描已取消')
      }

      // 等待恢复（如果暂停）
      while (this.isPaused && !this.isCancelled) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // 再次检查是否取消
      if (this.isCancelled) {
        throw new Error('扫描已取消')
      }

      try {
        const processed = await this.processFile(file, options)
        if (processed) {
          result.success++
        } else {
          result.skipped++
        }
      } catch (error: any) {
        if (error.message === '扫描已取消') {
          throw error
        }
        result.failed++
        result.errors.push({ file, error: error.message || 'Unknown error' })
      } finally {
        current++
        updateProgress(file)
      }
    })

    try {
      // 并发执行
      await this.executeWithConcurrency(tasks)
    } catch (error: any) {
      if (error.message === '扫描已取消') {
        throw error
      }
    }

    // 确保最后更新一次进度
    if (options.onProgress && !this.isCancelled && current > 0) {
      setImmediate(() => {
        if (options.onProgress) {
          options.onProgress({
            current,
            total,
            currentFile: '',
            speed: current / ((Date.now() - startTime) / 1000),
            percentage: 100
          })
        }
      })
    }

    if (this.isCancelled) {
      throw new Error('扫描已取消')
    }

    result.duration = Date.now() - startTime
    return result
  }

  private async collectFiles(
    dir: string,
    options: ScanOptions,
    files: string[] = []
  ): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        // 检查排除路径
        if (options.excludePaths.some(exclude => fullPath.includes(exclude))) {
          continue
        }

        if (entry.isDirectory() && options.recursive) {
          await this.collectFiles(fullPath, options, files)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (options.fileTypes.includes(ext)) {
            files.push(fullPath)
          }
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }

    return files
  }

  private async processFile(filePath: string, _options: ScanOptions): Promise<boolean> {
    try {
      // 1. 检查 music 表是否已有该文件的元数据（通过完整路径匹配）
      const existingMusic = this.db.getMusicByPath(filePath)

      if (existingMusic) {
        // music 表已有元数据，检查是否已在 local_music 列表中
        if (this.db.isInLocalMusic(filePath)) {
          return false // 已在本地音乐列表中，跳过
        }
        // 添加到 local_music（通过 music_id）
        this.db.addToLocalMusicByMusicId(existingMusic.id)
        return true
      }

      // 2. music 表中没有，需要解析文件
      // 检测损坏
      const isCorrupted = await this.detectCorruptedFile(filePath)
      if (isCorrupted) {
        return false
      }

      // 解析元数据（不提取封面，只解析元数据）
      const metadata = await this.parseMetadata(filePath)

      // 获取文件信息
      const fileStat = await stat(filePath)

      // 创建音乐项（暂时不设置 coverPath）
      const musicItem: Omit<MusicItem, 'id' | 'addedAt' | 'updatedAt'> = {
        title: metadata.title || basename(filePath, extname(filePath)),
        artist: metadata.artist || '未知艺术家',
        album: metadata.album || null,
        year: metadata.year || null,
        genre: metadata.genre || null,
        filePath,
        fileName: basename(filePath),
        fileSize: fileStat.size,
        fileHash: '', // 不再使用 fileHash
        fileExtension: extname(filePath).toLowerCase(),
        duration: metadata.duration || 0,
        bitrate: metadata.bitrate || 0,
        sampleRate: metadata.sampleRate || 0,
        channels: metadata.channels || 0,
        coverPath: null, // 稍后提取封面后更新
        lyricsPath: null,
        playCount: 0,
        lastPlayedAt: null,
        favorite: false,
        isCorrupted: false,
        isDuplicate: false
      }

      // 插入到 music 表（会自动同步到 local_music），获取 music id
      const musicId = this.db.insertMusic(musicItem)

      // 如果有封面数据，提取封面（使用 music id）
      if (metadata.coverPicture) {
        try {
          const coverPath = await this.extractCover(metadata.coverPicture, musicId)
          if (coverPath) {
            // 更新 music 表的 coverPath
            this.db.updateMusic(musicId, { coverPath })
          }
        } catch (coverError) {
          console.warn(`封面提取失败: ${filePath}`, coverError)
        }
      }

      return true
    } catch (error) {
      throw error
    }
  }

  // 不再需要计算文件内容 MD5，已移除此方法

  async detectCorruptedFile(filePath: string): Promise<boolean> {
    try {
      const parseFile = await getParseFile()
      const metadata = await parseFile(filePath)
      if (!metadata.format.duration || metadata.format.duration <= 0) {
        return true
      }
      return false
    } catch (error) {
      return true // 解析失败视为损坏
    }
  }

  private async parseMetadata(filePath: string): Promise<{
    title: string
    artist: string
    album: string | null
    year: number | null
    genre: string | null
    duration: number
    bitrate: number
    sampleRate: number
    channels: number
    coverPicture: any | null // 返回封面数据，而不是封面路径
  }> {
    try {
      const parseFile = await getParseFile()
      const metadata = await parseFile(filePath)

      // 返回封面数据（不在这里提取封面）
      const coverPicture = metadata.common.picture && metadata.common.picture.length > 0
        ? metadata.common.picture[0]
        : null

      return {
        title: metadata.common.title || '',
        artist: metadata.common.artist || '',
        album: metadata.common.album || null,
        year: metadata.common.year || null,
        genre: metadata.common.genre?.[0] || null,
        duration: metadata.format.duration || 0,
        bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : 0,
        sampleRate: metadata.format.sampleRate || 0,
        channels: metadata.format.numberOfChannels || 0,
        coverPicture
      }
    } catch (error) {
      // 返回默认值
      return {
        title: '',
        artist: '',
        album: null,
        year: null,
        genre: null,
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        channels: 0,
        coverPicture: null
      }
    }
  }

  /**
   * 提取并保存封面图片
   * @param picture 封面数据
   * @param musicId 音乐ID
   * @returns 封面文件路径
   */
  private async extractCover(picture: any, musicId: number): Promise<string | null> {
    try {
      // 获取封面目录
      const coversDir = join(app.getPath('userData'), 'covers')

      // 确保目录存在
      try {
        await mkdir(coversDir, { recursive: true })
      } catch (err) {
        // 目录已存在，忽略错误
      }

      // 确定文件扩展名
      let ext = '.jpg'
      if (picture.format) {
        const format = picture.format.toLowerCase()
        if (format.includes('png')) ext = '.png'
        else if (format.includes('jpeg') || format.includes('jpg')) ext = '.jpg'
      }

      // 使用 music id 作为封面文件名，例如：f100.jpg
      const coverFilename = `f${musicId}${ext}`
      const coverPath = join(coversDir, coverFilename)

      // 写入封面数据
      await writeFile(coverPath, picture.data)

      return coverPath
    } catch (error) {
      console.error('封面保存失败:', error)
      return null
    }
  }

  private async executeWithConcurrency<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    const results: T[] = []
    let index = 0

    const runNext = async (): Promise<void> => {
      while (index < tasks.length) {
        // 检查是否取消
        if (this.isCancelled) {
          break
        }

        const currentIndex = index++
        this.activeTasks++

        try {
          const result = await tasks[currentIndex]()
          results[currentIndex] = result

          // 每处理几个文件后让出控制权，避免阻塞
          if (currentIndex % 5 === 0) {
            await new Promise(resolve => setImmediate(resolve))
          }
        } catch (error) {
          // 错误已在 processFile 中处理
        } finally {
          this.activeTasks--
        }
      }
    }

    // 启动并发任务
    const workers = Array(Math.min(this.concurrency, tasks.length))
      .fill(0)
      .map(() => runNext())

    await Promise.all(workers)
    return results
  }
}
