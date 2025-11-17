import { readdir, stat } from 'fs/promises'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { join, extname, basename } from 'path'
import { createRequire } from 'module'
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

  constructor(db: MusicDatabase) {
    this.db = db
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

    // 收集所有文件
    const files = await this.collectFiles(path, options)
    const total = files.length
    let current = 0

    // 处理文件
    const tasks = files.map(file => async () => {
      try {
        const processed = await this.processFile(file, options)
        if (processed) {
          result.success++
        } else {
          result.skipped++
        }
      } catch (error: any) {
        result.failed++
        result.errors.push({ file, error: error.message || 'Unknown error' })
      } finally {
        current++
        if (options.onProgress) {
          options.onProgress({
            current,
            total,
            currentFile: file,
            speed: current / ((Date.now() - startTime) / 1000),
            percentage: (current / total) * 100
          })
        }
      }
    })

    // 并发执行
    await this.executeWithConcurrency(tasks)

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
      // 计算 MD5
      const hash = await this.calculateMD5(filePath)

      // 检查是否已存在（通过 hash）
      const existingByHash = this.db.getMusicByHash(hash)
      if (existingByHash.length > 0) {
        return false // 跳过重复文件
      }

      // 检测损坏
      const isCorrupted = await this.detectCorruptedFile(filePath)
      if (isCorrupted) {
        // 添加到损坏文件表
        return false
      }

      // 解析元数据
      const metadata = await this.parseMetadata(filePath)

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
        fileHash: hash,
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

      // 插入数据库
      this.db.insertMusic(musicItem)
      return true
    } catch (error) {
      throw error
    }
  }

  async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5')
      const stream = createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
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
    coverPath: string | null
  }> {
    try {
      const parseFile = await getParseFile()
      const metadata = await parseFile(filePath)
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
        coverPath: null // 封面提取稍后实现
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

  private async executeWithConcurrency<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    const results: T[] = []
    let index = 0

    const runNext = async (): Promise<void> => {
      while (index < tasks.length) {
        const currentIndex = index++
        this.activeTasks++

        try {
          const result = await tasks[currentIndex]()
          results[currentIndex] = result
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
