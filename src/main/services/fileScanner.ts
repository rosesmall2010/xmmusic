import { readdir, stat, writeFile, mkdir, access, constants } from 'fs/promises'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { join, extname, basename } from 'path'
import { createRequire } from 'module'
import { app } from 'electron'
import MusicDatabase from '../database/db'
import type { ScanOptions, ScanResult, MusicItem } from '@shared/types/music'
import { parsePath, normalizePath, batchGetOrCreateMusicDir } from '../database/pathUtils'

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

  /**
   * 扫描所有配置的目录（v1.0.6 新方法）
   */
  async scanAllDirectories(options: ScanOptions): Promise<ScanResult> {
    // 1. 获取所有启用的扫描根目录
    // 注意：better-sqlite3 是同步的，不需要 await
    const scanDirs = this.db.getEnabledLocalMusicDirs()

    if (scanDirs.length === 0) {
      return {
        success: 0,
        failed: 0,
        corrupted: 0,
        skipped: 0,
        duration: 0,
        errors: []
      }
    }

    // 2. 初始化扫描结果
    const result: ScanResult = {
      success: 0,
      failed: 0,
      corrupted: 0,
      skipped: 0,
      duration: 0,
      errors: []
    }

    const startTime = Date.now()

    // 发送开始扫描的进度事件
    if (options.onProgress) {
      options.onProgress({
        current: 0,
        total: 0,
        currentFile: '',
        speed: 0,
        percentage: 0
      })
    }

    // 3. 逐个扫描每个根目录
    for (const scanDir of scanDirs) {
      try {
        const dirResult = await this.scanDirectory(scanDir.path, {
          ...options,
          onProgress: (progress) => {
            // 更新总体进度
            if (options.onProgress) {
              options.onProgress({
                ...progress,
                currentDirectory: scanDir.path
              } as any)
            }
          }
        })

        // 合并结果
        result.success += dirResult.success
        result.failed += dirResult.failed
        result.corrupted += dirResult.corrupted
        result.skipped += dirResult.skipped
        result.errors.push(...dirResult.errors)
      } catch (error: any) {
        result.errors.push({
          file: scanDir.path,
          error: error.message || '扫描失败'
        })
      }
    }

    result.duration = Date.now() - startTime
    return result
  }

  /**
   * 扫描单个目录（递归，v1.0.6 更新）
   */
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

    // 1. 规范化根目录路径
    const normalizedRoot = normalizePath(path, process.platform)

    // 2. 收集所有音乐文件（递归）
    const files = await this.collectFiles(normalizedRoot, options)
    const total = files.length
    let current = 0
    let lastProgressUpdate = 0
    const PROGRESS_UPDATE_INTERVAL = 100 // 每100ms最多更新一次进度

    // 发送初始进度（total > 0 时）
    if (total > 0 && options.onProgress) {
      options.onProgress({
        current: 0,
        total,
        currentFile: '',
        speed: 0,
        percentage: 0
      })
    }

    // 3. 批量获取目录ID映射（性能优化）
    // 注意：better-sqlite3 是同步的，不需要 await
    const dirPaths = [...new Set(files.map(f => parsePath(f, process.platform).dirPath))]
    const dirIdMap = batchGetOrCreateMusicDir(this.db.getDatabase(), dirPaths, process.platform)

    // 进度更新函数（节流）
    const updateProgress = (file: string, force: boolean = false) => {
      const now = Date.now()
      if (force || now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
        lastProgressUpdate = now
        if (options.onProgress && !this.isCancelled) {
          // 使用 setImmediate 让出控制权，避免阻塞
          setImmediate(() => {
            if (options.onProgress && !this.isCancelled) {
              const elapsed = (Date.now() - startTime) / 1000
              options.onProgress({
                current,
                total,
                currentFile: file,
                speed: elapsed > 0 ? current / elapsed : 0,
                percentage: total > 0 ? (current / total) * 100 : 0
              })
            }
          })
        }
      }
    }

    // 发送初始进度（文件收集完成后）
    if (total > 0 && options.onProgress) {
      updateProgress('', true)
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
        const processed = await this.processFile(file, options, dirIdMap)
        if (processed.success) {
          result.success++
        } else if (processed.corrupted) {
          result.corrupted++
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

    // 确保最后更新一次进度（完成时）
    if (options.onProgress && !this.isCancelled && total > 0) {
      const elapsed = (Date.now() - startTime) / 1000
      options.onProgress({
        current,
        total,
        currentFile: '',
        speed: elapsed > 0 ? current / elapsed : 0,
        percentage: 100
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

  /**
   * 处理单个音乐文件（v1.0.6 更新，使用新表结构）
   */
  private async processFile(
    filePath: string,
    options: ScanOptions,
    dirIdMap: Record<string, number>
  ): Promise<{
    success: boolean
    corrupted: boolean
    musicId?: number
  }> {
    try {
      // 1. 解析路径
      const { dirPath, fileName } = parsePath(filePath, process.platform)
      const normalizedDirPath = normalizePath(dirPath, process.platform)

      // 2. 获取目录ID
      const dirId = dirIdMap[normalizedDirPath]
      if (!dirId) {
        throw new Error(`目录ID未找到: ${normalizedDirPath}`)
      }

      // 3. 检查文件是否已存在
      const db = this.db.getDatabase()
      const existing = db.prepare(`
        SELECT id FROM all_music
        WHERE dir_id = ? AND file_name = ?
      `).get(dirId, fileName) as { id: number } | undefined

      if (existing) {
        // 文件已存在，检查是否需要更新
        const fileStat = await stat(filePath)
        const existingMusic = db.prepare('SELECT * FROM all_music WHERE id = ?').get(existing.id) as any

        // 如果文件大小或修改时间变化，可能需要重新扫描
        if (options.forceRescan ||
            existingMusic.file_size !== fileStat.size ||
            existingMusic.updated_at < fileStat.mtime.toISOString()) {
          // 重新扫描（这里简化处理，只更新文件大小）
          this.db.updateAllMusic(existing.id, {
            file_size: fileStat.size,
            is_exists: 1
          })
        }

        // 确保在 local_music 列表中
        if (!this.db.isInLocalMusicByMusicId(existing.id)) {
          this.db.addToLocalMusicByMusicId(existing.id)
        }

        return { success: false, corrupted: false }
      }

      // 4. 检查文件是否存在
      let isExists = true
      try {
        await access(filePath, constants.F_OK)
      } catch {
        isExists = false
      }

      // 5. 计算文件哈希（用于去重）
      const fileHash = await this.calculateMD5(filePath)

      // 6. 检测文件是否损坏
      const isCorrupted = await this.detectCorruptedFile(filePath)
      if (isCorrupted) {
        // 插入损坏文件记录
        const musicId = this.db.insertAllMusic({
          dir_id: dirId,
          file_name: fileName,
          title: fileName.replace(/\.[^/.]+$/, ''),
          artist: '未知艺术家',
          album: null,
          year: null,
          genre: null,
          file_size: 0,
          file_hash: fileHash,
          file_extension: extname(fileName).toLowerCase(),
          duration: null,
          bitrate: null,
          sample_rate: null,
          channels: null,
          cover_path: null,
          lyrics_path: null,
          is_exists: isExists ? 1 : 0,
          is_playable: 0,
          play_error_reason: '文件损坏',
          play_count: 0,
          last_played_at: null,
          is_corrupted: 1,
          is_duplicate: 0
        })
        return { success: false, corrupted: true, musicId }
      }

      // 7. 解析元数据
      const metadata = await this.parseMetadata(filePath, fileHash)

      // 8. 获取文件信息
      const fileStat = await stat(filePath)

      // 9. 插入 all_music 记录
      const musicId = this.db.insertAllMusic({
        dir_id: dirId,
        file_name: fileName,
        title: metadata.title || fileName.replace(/\.[^/.]+$/, ''),
        artist: metadata.artist || '未知艺术家',
        album: metadata.album || null,
        year: metadata.year || null,
        genre: metadata.genre || null,
        file_size: fileStat.size,
        file_hash: fileHash,
        file_extension: extname(fileName).toLowerCase(),
        duration: metadata.duration || null,
        bitrate: metadata.bitrate || null,
        sample_rate: metadata.sampleRate || null,
        channels: metadata.channels || null,
        cover_path: metadata.coverPath || null,
        lyrics_path: null,
        is_exists: isExists ? 1 : 0,
        is_playable: 1,
        play_error_reason: null,
        play_count: 0,
        last_played_at: null,
        is_corrupted: 0,
        is_duplicate: 0
      })

      // 10. 添加到 local_music 列表
      this.db.addToLocalMusicByMusicId(musicId)

      return { success: true, corrupted: false, musicId }
    } catch (error: any) {
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
