/**
 * 路径处理工具函数
 * 用于跨平台路径规范化、构建和解析
 *
 * @module pathUtils
 */

import Database from './sqlite3-sync'
import { dirname, basename } from 'path'

/**
 * 规范化路径格式
 *
 * 规则：
 * 1. Windows: 统一使用正斜杠，去除末尾分隔符
 * 2. macOS/Linux: 去除末尾分隔符
 * 3. 处理多个连续分隔符
 *
 * @param path 原始路径
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns 规范化后的路径
 *
 * @example
 * normalizePath('C:\\Music\\Rock\\', 'win32')  // => 'C:/Music/Rock'
 * normalizePath('/Users/name/Music/', 'darwin')  // => '/Users/name/Music'
 * normalizePath('/home/user/music//', 'linux')   // => '/home/user/music'
 */
export function normalizePath(
  path: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (!path || typeof path !== 'string') {
    return path
  }

  // Windows: 统一使用正斜杠
  if (platform === 'win32') {
    path = path.replace(/\\/g, '/')
  }

  // 处理多个连续分隔符
  path = path.replace(/[/\\]+/g, '/')

  // 去除末尾分隔符（但保留根路径的单个斜杠）
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  return path
}

/**
 * 构建完整文件路径
 *
 * @param dirPath 目录路径（已规范化）
 * @param fileName 文件名
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns 完整文件路径
 *
 * @example
 * buildFullPath('C:/Music/Rock', 'song.mp3', 'win32')  // => 'C:\\Music\\Rock\\song.mp3'
 * buildFullPath('/Users/name/Music', 'song.mp3', 'darwin')  // => '/Users/name/Music/song.mp3'
 */
export function buildFullPath(
  dirPath: string,
  fileName: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (!dirPath || !fileName) {
    throw new Error('dirPath and fileName are required')
  }

  // 确保 dirPath 已规范化
  const normalizedDir = normalizePath(dirPath, platform)

  // 根据平台选择分隔符
  const separator = platform === 'win32' ? '\\' : '/'

  return `${normalizedDir}${separator}${fileName}`
}

/**
 * 从完整路径解析目录路径和文件名
 *
 * @param fullPath 完整文件路径
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns { dirPath: string, fileName: string }
 *
 * @example
 * parsePath('C:/Music/Rock/song.mp3', 'win32')
 * // => { dirPath: 'C:/Music/Rock', fileName: 'song.mp3' }
 */
export function parsePath(
  fullPath: string,
  platform: NodeJS.Platform = process.platform
): { dirPath: string; fileName: string } {
  if (!fullPath) {
    throw new Error('fullPath is required')
  }

  // 规范化路径
  const normalizedPath = normalizePath(fullPath, platform)

  // 找到最后一个分隔符
  const lastSeparatorIndex = normalizedPath.lastIndexOf('/')

  if (lastSeparatorIndex === -1) {
    // 没有目录，只有文件名
    return { dirPath: '', fileName: normalizedPath }
  }

  const dirPath = normalizedPath.substring(0, lastSeparatorIndex)
  const fileName = normalizedPath.substring(lastSeparatorIndex + 1)

  return {
    dirPath: normalizePath(dirPath, platform),
    fileName
  }
}

/**
 * 获取或创建目录记录
 *
 * @param db 数据库实例
 * @param dirPath 目录路径
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns 目录ID
 *
 * @example
 * const dirId = getOrCreateMusicDir(db, 'C:/Music/Rock')
 */
export function getOrCreateMusicDir(
  db: Database,
  dirPath: string,
  platform: NodeJS.Platform = process.platform
): number {
  const normalizedPath = normalizePath(dirPath, platform)

  // 先查询是否存在
  const stmt = db.prepare('SELECT id FROM music_dir WHERE path = ?')
  const existing = stmt.get(normalizedPath) as { id: number } | undefined

  if (existing) {
    return existing.id
  }

  // 不存在则创建
  const insertStmt = db.prepare('INSERT INTO music_dir (path) VALUES (?)')
  const result = insertStmt.run(normalizedPath)

  return result.lastInsertRowid as number
}

/**
 * 批量获取或创建目录记录（使用事务优化性能）
 *
 * @param db 数据库实例
 * @param dirPaths 目录路径数组
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns 目录ID映射对象 { [path]: dirId }
 *
 * @example
 * const dirMap = batchGetOrCreateMusicDir(db, ['C:/Music/Rock', 'C:/Music/Jazz'])
 * // => { 'C:/Music/Rock': 1, 'C:/Music/Jazz': 2 }
 */
export function batchGetOrCreateMusicDir(
  db: Database,
  dirPaths: string[],
  platform: NodeJS.Platform = process.platform
): Record<string, number> {
  if (!dirPaths || dirPaths.length === 0) {
    return {}
  }

  // 规范化所有路径
  const normalizedPaths = dirPaths.map(path => normalizePath(path, platform))
  const uniquePaths = [...new Set(normalizedPaths)]

  // 检查 music_dir 表是否存在
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='music_dir'").get()
    if (!tableCheck) {
      console.error(`❌ music_dir 表不存在！`)
      throw new Error('music_dir table does not exist')
    }
  } catch (error: any) {
    console.error(`❌ 检查 music_dir 表时出错:`, error.message)
    throw error
  }

  // 批量查询已存在的目录
  const placeholders = uniquePaths.map(() => '?').join(',')
  let existing: Array<{ id: number; path: string }> = []
  try {
    const selectStmt = db.prepare(`SELECT id, path FROM music_dir WHERE path IN (${placeholders})`)
    existing = selectStmt.all(...uniquePaths) as Array<{ id: number; path: string }>
  } catch (error: any) {
    console.error(`❌ 查询已存在目录时出错:`, error.message)
    throw error
  }

  const result: Record<string, number> = {}
  const existingMap = new Map<string, number>()

  // 构建已存在目录的映射
  for (const dir of existing) {
    existingMap.set(dir.path, dir.id)
    result[dir.path] = dir.id
  }

  // 找出需要创建的目录
  const toCreate = uniquePaths.filter(path => !existingMap.has(path))

  if (toCreate.length > 0) {
    // 使用事务批量插入
    try {
      const insertStmt = db.prepare('INSERT INTO music_dir (path) VALUES (?)')
      const insertMany = db.transaction((paths: string[]) => {
        const map: Record<string, number> = {}
        for (const path of paths) {
          const result = insertStmt.run(path)
          map[path] = result.lastInsertRowid as number
        }
        return map
      })

      const newMap = insertMany(toCreate)
      Object.assign(result, newMap)
    } catch (error: any) {
      console.error(`❌ 批量插入目录时出错:`, error.message)
      throw error
    }
  }

  return result
}

/**
 * 从 all_music 记录构建完整文件路径
 *
 * @param db 数据库实例
 * @param musicRecord all_music 表记录（包含 dir_id 和 file_name）
 * @param platform 平台类型（可选，默认使用 process.platform）
 * @returns 完整文件路径
 *
 * @example
 * const music = db.prepare('SELECT * FROM all_music WHERE id = ?').get(1)
 * const fullPath = buildPathFromMusicRecord(db, music)
 */
export function buildPathFromMusicRecord(
  db: Database,
  musicRecord: { dir_id: number; file_name: string },
  platform: NodeJS.Platform = process.platform
): string {
  // 查询目录路径
  const dirStmt = db.prepare('SELECT path FROM music_dir WHERE id = ?')
  const dir = dirStmt.get(musicRecord.dir_id) as { path: string } | undefined

  if (!dir) {
    throw new Error(`Directory with id ${musicRecord.dir_id} not found`)
  }

  return buildFullPath(dir.path, musicRecord.file_name, platform)
}

/**
 * 目录ID映射缓存类
 * 用于缓存 path -> dir_id 映射，减少数据库查询
 */
export class MusicDirCache {
  private cache: Map<string, number> = new Map()
  private maxSize: number = 10000  // 最大缓存条目数

  /**
   * 获取目录ID（先从缓存查找）
   */
  get(
    db: Database,
    dirPath: string,
    platform: NodeJS.Platform = process.platform
  ): number {
    const normalizedPath = normalizePath(dirPath, platform)

    // 先从缓存查找
    if (this.cache.has(normalizedPath)) {
      return this.cache.get(normalizedPath)!
    }

    // 缓存未命中，查询数据库
    const dirId = getOrCreateMusicDir(db, dirPath, platform)

    // 存入缓存
    this.setCache(normalizedPath, dirId)

    return dirId
  }

  /**
   * 批量获取目录ID
   */
  batchGet(
    db: Database,
    dirPaths: string[],
    platform: NodeJS.Platform = process.platform
  ): Record<string, number> {
    const normalizedPaths = dirPaths.map(path => normalizePath(path, platform))

    // 从缓存中查找已存在的
    const cached: Record<string, number> = {}
    const toFetch: string[] = []

    for (const path of normalizedPaths) {
      if (this.cache.has(path)) {
        cached[path] = this.cache.get(path)!
      } else {
        toFetch.push(path)
      }
    }

    // 批量查询数据库
    if (toFetch.length > 0) {
      const dbResult = batchGetOrCreateMusicDir(db, toFetch, platform)

      // 存入缓存
      for (const [path, dirId] of Object.entries(dbResult)) {
        this.setCache(path, dirId)
      }

      Object.assign(cached, dbResult)
    }

    return cached
  }

  /**
   * 设置缓存（带大小限制）
   */
  private setCache(path: string, dirId: number): void {
    // 如果缓存已满，删除最旧的条目（FIFO）
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(path, dirId)
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size
  }
}

// 单例实例
export const musicDirCache = new MusicDirCache()
