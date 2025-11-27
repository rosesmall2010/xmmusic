import { readdir, stat, writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { join, extname, basename } from 'path'
import { createRequire } from 'module'
import { app } from 'electron'
import MusicDatabase, { calculateFilePathMD5 } from '../database/db'
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
  private concurrency: number = 5 // 降低并发数，避免过多I/O操作
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
    const PROGRESS_UPDATE_INTERVAL = 500 // 每500ms最多更新一次进度，减少UI更新频率

    // 批量插入缓冲区
    const BATCH_SIZE = 100 // 增加批量大小，减少数据库操作次数
    let pendingInserts: any[] = []

    // 批量插入函数
    const flushPendingInserts = () => {
      if (pendingInserts.length > 0) {
        try {
          // 批量插入到 music 表
          this.db.insertMusicBatch(pendingInserts)
          
          // 批量添加到本地音乐列表
          const filePaths = pendingInserts.map(item => item.filePath)
          this.db.addToLocalMusicBatch(filePaths)
          
          pendingInserts = []
        } catch (error) {
          console.error('批量插入失败:', error)
        }
      }
    }

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
        const musicItem = await this.processFile(file, options)
        if (musicItem) {
          result.success++
          // 添加到批量插入缓冲区
          pendingInserts.push(musicItem)

          // 如果达到批量大小，执行插入
          if (pendingInserts.length >= BATCH_SIZE) {
            flushPendingInserts()
          }
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

      // 处理剩余的待插入记录
      flushPendingInserts()
    } catch (error: any) {
      if (error.message === '扫描已取消') {
        // 即使取消，也尝试保存已处理的数据
        flushPendingInserts()
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

  private async processFile(filePath: string, _options: ScanOptions): Promise<MusicItem | null> {
    try {
      // 优化：计算文件路径的 MD5（而不是文件内容）
      const filePathMd5 = calculateFilePathMD5(filePath)

      // 检查是否已存在（通过 file_path）
      const existingByPath = this.db.getMusicByPath(filePath)
      if (existingByPath) {
        // 检查现有记录是否缺少封面
        if (!existingByPath.coverPath) {
          try {
            // 尝试提取封面
            const metadata = await this.parseMetadata(filePath, filePathMd5)
            if (metadata.coverPath) {
              // 更新数据库
              this.db.updateMusic(existingByPath.id, { coverPath: metadata.coverPath })
            }
          } catch (updateError) {
            console.warn(`更新封面失败: ${filePath}`, updateError)
          }
        }
        return null // 跳过重复文件（不计入新增）
      }

      // 检测损坏
      const isCorrupted = await this.detectCorruptedFile(filePath)
      if (isCorrupted) {
        // 添加到损坏文件表
        return null
      }

      // 解析元数据
      const metadata = await this.parseMetadata(filePath, filePathMd5)

      // 获取文件信息
      const fileStat = await stat(filePath)

      // 创建音乐项
      const musicItem: Omit<MusicItem, 'id' | 'addedAt' | 'updatedAt'> = {
        title: metadata.title || basename(filePath, extname(filePath)),
        artist: metadata.artist || '未知艺术家',
        album: metadata.album || null,
        year: metadata.year || null,
        genre: metadata.genre || null,
        filePath,
        fileName: basename(filePath),
        fileSize: fileStat.size,
        fileHash: filePathMd5, // 使用文件路径 MD5
        fileExtension: extname(filePath).toLowerCase(),
        duration: metadata.duration || 0,
        bitrate: metadata.bitrate || 0,
        sampleRate: metadata.sampleRate || 0,
        channels: metadata.channels || 0,
        coverPath: metadata.coverPath || null,
        lyricsPath: null,
        playCount: 0,
        lastPlayedAt: null,
        favorite: false,
        isCorrupted: false,
        isDuplicate: false
      }

      // 不在这里插入数据库，返回 musicItem 供批量插入
      return musicItem as MusicItem
    } catch (error) {
      throw error
    }
  }

  async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 检查是否取消
      if (this.isCancelled) {
        reject(new Error('扫描已取消'))
        return
      }

      const hash = createHash('md5')
      const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 }) // 64KB chunks

      stream.on('data', (chunk) => {
        // 检查是否取消
        if (this.isCancelled) {
          stream.destroy()
          reject(new Error('扫描已取消'))
          return
        }
        hash.update(chunk)
      })
      stream.on('end', () => {
        if (!this.isCancelled) {
          resolve(hash.digest('hex'))
        } else {
          reject(new Error('扫描已取消'))
        }
      })
      stream.on('error', reject)
    })
  }

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

  private async parseMetadata(filePath: string, fileHash: string): Promise<{
    title: string
    artist: string
    album: string | null
    year: number | null
    genre: string | null
    duration: number
    bitrate: number
    sampleRate: number
    channels: number
    coverPath: string | null
  }> {
    try {
      const parseFile = await getParseFile()
      const metadata = await parseFile(filePath)

      // 提取封面
      let coverPath: string | null = null
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        try {
          coverPath = await this.extractCover(metadata.common.picture[0], fileHash)
        } catch (coverError) {
          console.warn(`封面提取失败: ${filePath}`, coverError)
        }
      }

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
        coverPath
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
        coverPath: null
      }
    }
  }

  /**
   * 提取并保存封面图片
   * @param picture 封面数据
   * @param fileHash 音乐文件的 MD5
   * @returns 封面文件路径
   */
  private async extractCover(picture: any, fileHash: string): Promise<string | null> {
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

      // 使用音乐文件的 MD5 作为封面文件名
      const coverFilename = `${fileHash}${ext}`
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
