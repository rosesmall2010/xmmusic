import Database from './sqlite3-sync'
import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, existsSync, copyFile, unlinkSync, readdirSync, access, constants } from 'fs'
import { promisify } from 'util'
import { createHash } from 'crypto'
import type {
  MusicItem,
  Playlist,
  DuplicateGroup,
  AdvancedSearchCriteria
} from '@shared/types/music'
import { DB_VERSION, DB_VERSION_KEY } from './dbver'
import { normalizePath, getOrCreateMusicDir, batchGetOrCreateMusicDir, buildPathFromMusicRecord, parsePath } from './pathUtils'

const copyFileAsync = promisify(copyFile)

/**
 * 计算文件路径的 MD5
 * @param filePath 文件完整路径
 * @returns MD5 哈希值
 */
export function calculateFilePathMD5(filePath: string): string {
  return createHash('md5').update(filePath).digest('hex')
}

export default class MusicDatabase {
  private static instance: MusicDatabase
  private db: Database | null = null

  static getInstance(): MusicDatabase {
    if (!MusicDatabase.instance) {
      MusicDatabase.instance = new MusicDatabase()
    }
    return MusicDatabase.instance
  }

  initialize(dbPath?: string, skipVersionCheck: boolean = false): void {
    try {
      // 根据环境变量选择数据库文件名
      const isDev = process.env.NODE_ENV !== 'production'
      const dbFileName = isDev ? 'm-dev.db' : 'm.db'
      const path = dbPath || join(app.getPath('userData'), dbFileName)

      console.log(`🌍 运行环境: ${isDev ? '开发环境' : '生产环境'}`)
      console.log(`📂 数据库路径: ${path}`)

      // 如果数据库文件已存在，先检查版本（避免不必要的删除）
      if (existsSync(path) && !skipVersionCheck) {
        try {
          const tempDb = new Database(path)
          // 尝试读取版本号
          const versionStmt = tempDb.prepare('SELECT value FROM settings WHERE key = ?')
          const versionResult = versionStmt.get(DB_VERSION_KEY) as { value: string } | undefined
          tempDb.close()

          if (versionResult && parseInt(versionResult.value) !== DB_VERSION) {
            // 版本不匹配，删除数据库文件
            console.warn(`⚠️  数据库版本不匹配，删除旧数据库文件...`)
            unlinkSync(path)
            console.log(`✅ 已删除旧数据库文件`)
          }
        } catch (checkError) {
          // 如果读取失败（可能是旧版本数据库），删除文件
          console.warn(`⚠️  无法读取数据库版本，删除旧数据库文件...`)
          try {
            unlinkSync(path)
            console.log(`✅ 已删除旧数据库文件`)
          } catch (deleteError) {
            // 忽略删除错误
          }
        }
      }

      console.log(`🔧 尝试创建数据库连接...`)

      try {
        this.db = new Database(path)
        console.log(`✅ 数据库连接创建成功`)
      } catch (dbError: any) {
        console.error(`❌ 创建数据库连接失败:`)
        console.error(`   错误信息: ${dbError?.message || dbError}`)
        if (dbError?.code) {
          console.error(`   错误代码: ${dbError.code}`)
        }
        if (dbError?.stack) {
          console.error(`   错误堆栈: ${dbError.stack}`)
        }
        throw dbError
      }

      // 配置优化
      try {
        this.db.pragma('journal_mode = WAL')
        this.db.pragma('synchronous = NORMAL')
        this.db.pragma('cache_size = -32000') // 32MB
        this.db.pragma('temp_store = MEMORY')
        this.db.pragma('mmap_size = 268435456') // 256MB
        this.db.pragma('page_size = 4096')
        this.db.pragma('foreign_keys = ON')
        console.log(`✅ 数据库配置完成`)
      } catch (pragmaError: any) {
        console.error(`❌ 数据库配置失败: ${pragmaError?.message || pragmaError}`)
        throw pragmaError
      }

      // 执行迁移
      try {
        this.migrate()
        console.log(`✅ 数据库迁移完成`)
      } catch (migrateError: any) {
        console.error(`❌ 数据库迁移失败: ${migrateError?.message || migrateError}`)
        throw migrateError
      }

      // 创建索引（迁移脚本中已包含索引创建，这里可以跳过或作为补充）
      // 注意：007_v106_db_restructure.sql 已经包含了所有索引，这里可以跳过
      // try {
      //   this.createIndexes()
      //   console.log(`✅ 数据库索引创建完成`)
      // } catch (indexError: any) {
      //   console.error(`❌ 数据库索引创建失败: ${indexError?.message || indexError}`)
      //   throw indexError
      // }

      // 设置数据库版本
      try {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        stmt.run(DB_VERSION_KEY, DB_VERSION.toString())
        console.log(`✅ 数据库版本已设置为: ${DB_VERSION}`)
      } catch (versionError: any) {
        console.error(`❌ 设置数据库版本失败: ${versionError?.message || versionError}`)
        // 不抛出错误，因为这不是致命错误
      }
    } catch (error: any) {
      // 清理失败的数据库连接
      if (this.db) {
        try {
          this.db.close()
        } catch (closeError) {
          // 忽略关闭错误
        }
        this.db = null
      }

      // 检查是否是关键的 Schema 错误（如缺少列）
      if (error?.message?.includes('no such column') || error?.code === 'SQLITE_ERROR') {
        console.error('❌ 检测到严重的数据库 Schema 不兼容，正在尝试重置数据库...')

        try {
          const isDev = process.env.NODE_ENV !== 'production'
          const dbFileName = isDev ? 'm-dev.db' : 'm.db'
          const path = dbPath || join(app.getPath('userData'), dbFileName)

          if (require('fs').existsSync(path)) {
            require('fs').unlinkSync(path)
            console.log('✅ 已删除旧数据库文件')

            // 重新尝试初始化
            console.log('🔄 正在重新初始化数据库...')
            this.initialize(dbPath)
            return
          }
        } catch (resetError) {
          console.error('❌ 数据库重置失败:', resetError)
        }
      }

      throw error
    }
  }

  private migrate(): void {
    // v1.0.6 数据库重构：直接执行新的迁移脚本，不进行数据迁移
    // 新数据库直接创建新结构，旧数据库会被删除重建
    try {
      const v106MigrationPath = join(__dirname, 'migrations', '007_v106_db_restructure.sql')
      if (existsSync(v106MigrationPath)) {
        console.log('📦 执行 v1.0.6 数据库重构迁移...')
        const sql = readFileSync(v106MigrationPath, 'utf8')
        this.db!.exec(sql)
        console.log('✅ v1.0.6 数据库重构迁移完成')
      } else {
        console.warn('⚠️  v1.0.6 迁移脚本未找到，跳过迁移')
      }
    } catch (error: any) {
      console.error('❌ v1.0.6 数据库迁移失败:', error)
      throw error
    }

    // 执行播放列表迁移（从 music_id 改为 file_path）
    try {
      // 检查 playlist_item 表是否存在
      const checkStmt = this.db!.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='playlist_item'
      `)
      const tableExists = checkStmt.get()

      if (tableExists) {
        // 检查表结构：是否已经有 file_path 列
        const pragmaStmt = this.db!.prepare('PRAGMA table_info(playlist_item)')
        const columns = pragmaStmt.all() as any[]
        const hasFilePath = columns.some((col: any) => col.name === 'file_path')
        const hasMusicId = columns.some((col: any) => col.name === 'music_id')

        if (!hasFilePath && hasMusicId) {
          // 需要迁移：从 music_id 到 file_path
          console.log('📦 迁移 playlist_item: music_id → file_path')

          this.db!.exec(`
            -- 1. 创建新表
            CREATE TABLE playlist_item_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              playlist_id INTEGER NOT NULL,
              file_path TEXT NOT NULL,
              position INTEGER NOT NULL,
              added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
              UNIQUE(playlist_id, file_path)
            );

            -- 2. 迁移现有数据（尝试从 music 表获取 file_path）
            INSERT INTO playlist_item_new (playlist_id, file_path, position, added_at)
            SELECT
              pi.playlist_id,
              COALESCE(m.file_path, ''),
              pi.position,
              pi.added_at
            FROM playlist_item pi
            LEFT JOIN music m ON pi.music_id = m.id
            WHERE m.file_path IS NOT NULL;

            -- 3. 删除旧表
            DROP TABLE playlist_item;

            -- 4. 重命名新表
            ALTER TABLE playlist_item_new RENAME TO playlist_item;

            -- 5. 创建索引
            CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist ON playlist_item(playlist_id);
            CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path ON playlist_item(file_path);
          `)

          console.log('✅ Playlist migration completed')
        } else if (hasFilePath) {
          console.log('✅ Playlist table already using file_path')
        } else {
          console.log('⚠️ Unexpected playlist_item schema, recreating...')
          // 表结构异常，重新创建
          this.db!.exec(`
            DROP TABLE IF EXISTS playlist_item;

            CREATE TABLE playlist_item (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              playlist_id INTEGER NOT NULL,
              file_path TEXT NOT NULL,
              position INTEGER NOT NULL,
              added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
              UNIQUE(playlist_id, file_path)
            );

            CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist ON playlist_item(playlist_id);
            CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path ON playlist_item(file_path);
          `)
          console.log('✅ Playlist table recreated')
        }
      } else {
        // 表不存在，创建新表
        console.log('📦 创建 playlist_item 表（使用 file_path）')
        this.db!.exec(`
          CREATE TABLE playlist_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            position INTEGER NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, file_path)
          );

          CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist ON playlist_item(playlist_id);
          CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path ON playlist_item(file_path);
        `)
        console.log('✅ Playlist table created')
      }
    } catch (error) {
      console.error('❌ Playlist migration error:', error)
      throw error
    }

    // 执行收藏表迁移（创建独立的 favorites 表）
    const favoritesMigrationPath = join(__dirname, 'migrations', '004_create_favorites_table.sql')
    if (existsSync(favoritesMigrationPath)) {
      try {
        // 检查 favorites 表是否存在
        const checkStmt = this.db!.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='favorites'
        `)
        const tableExists = checkStmt.get()

        if (!tableExists) {
          console.log('Creating favorites table...')
          const sql = readFileSync(favoritesMigrationPath, 'utf8')
          this.db!.exec(sql)
          console.log('Favorites table migration completed')
        } else {
          console.log('Favorites table already exists')
        }
      } catch (error) {
        console.error('Favorites migration error:', error)
      }
    }
  }

  private createIndexes(): void {
    // 索引已在迁移文件中创建
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close()
        this.db = null
      } catch (error: any) {
        // 忽略 SQLITE_BUSY 错误
        // 应用退出时这个错误不影响数据完整性，操作系统会自动清理资源
        if (error?.code !== 'SQLITE_BUSY') {
          console.error('关闭数据库时出错:', error)
        }
        this.db = null
      }
    }
  }

  // ========== all_music 表操作（v1.0.6 新架构） ==========

  /**
   * 插入音乐记录（使用 dir_id + file_name）
   */
  insertAllMusic(data: {
    dir_id: number
    file_name: string
    title: string
    artist: string
    album?: string | null
    year?: number | null
    genre?: string | null
    file_size: number
    file_hash: string
    file_extension: string
    duration?: number | null
    bitrate?: number | null
    sample_rate?: number | null
    channels?: number | null
    cover_path?: string | null
    lyrics_path?: string | null
    is_exists?: number
    is_playable?: number
    play_error_reason?: string | null
    play_count?: number
    last_played_at?: string | null
    is_corrupted?: number
    is_duplicate?: number
  }): number {
    const stmt = this.db!.prepare(`
      INSERT INTO all_music (
        dir_id, file_name, title, artist, album, year, genre,
        file_size, file_hash, file_extension,
        duration, bitrate, sample_rate, channels,
        cover_path, lyrics_path,
        is_exists, is_playable, play_error_reason,
        play_count, last_played_at,
        is_corrupted, is_duplicate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      data.dir_id,
      data.file_name,
      data.title,
      data.artist,
      data.album || null,
      data.year || null,
      data.genre || null,
      data.file_size,
      data.file_hash,
      data.file_extension,
      data.duration || null,
      data.bitrate || null,
      data.sample_rate || null,
      data.channels || null,
      data.cover_path || null,
      data.lyrics_path || null,
      data.is_exists ?? 1,
      data.is_playable ?? 1,
      data.play_error_reason || null,
      data.play_count || 0,
      data.last_played_at || null,
      data.is_corrupted || 0,
      data.is_duplicate || 0
    )

    return Number(result.lastInsertRowid)
  }

  /**
   * 根据ID获取音乐记录（返回完整路径）
   */
  getAllMusicById(id: number): (MusicItem & { fullPath: string }) | null {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.id = ?
    `)
    const row = stmt.get(id) as any

    if (!row) {
      return null
    }

    // 构建完整路径
    const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)

    return this.mapAllMusicRowToMusicItem(row, fullPath)
  }

  /**
   * 根据路径获取音乐记录（使用 dir_id + file_name 查询）
   */
  getAllMusicByPath(filePath: string): (MusicItem & { fullPath: string }) | null {
    const { dirPath, fileName } = parsePath(filePath, process.platform)
    const normalizedDirPath = normalizePath(dirPath, process.platform)

    // 先查找目录ID
    const dir = this.getMusicDirByPath(normalizedDirPath)
    if (!dir) {
      return null
    }

    // 查找音乐记录
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.dir_id = ? AND am.file_name = ?
    `)
    const row = stmt.get(dir.id, fileName) as any

    if (!row) {
      return null
    }

    const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)

    return this.mapAllMusicRowToMusicItem(row, fullPath)
  }

  /**
   * 更新音乐记录
   */
  updateAllMusic(id: number, updates: Partial<{
    title: string
    artist: string
    album: string | null
    year: number | null
    genre: string | null
    cover_path: string | null
    lyrics_path: string | null
    is_exists: number
    is_playable: number
    play_error_reason: string | null
    play_count: number
    last_played_at: string | null
    is_corrupted: number
    is_duplicate: number
  }>): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.artist !== undefined) {
      fields.push('artist = ?')
      values.push(updates.artist)
    }
    if (updates.album !== undefined) {
      fields.push('album = ?')
      values.push(updates.album)
    }
    if (updates.year !== undefined) {
      fields.push('year = ?')
      values.push(updates.year)
    }
    if (updates.genre !== undefined) {
      fields.push('genre = ?')
      values.push(updates.genre)
    }
    if (updates.cover_path !== undefined) {
      fields.push('cover_path = ?')
      values.push(updates.cover_path)
    }
    if (updates.lyrics_path !== undefined) {
      fields.push('lyrics_path = ?')
      values.push(updates.lyrics_path)
    }
    if (updates.is_exists !== undefined) {
      fields.push('is_exists = ?')
      values.push(updates.is_exists)
    }
    if (updates.is_playable !== undefined) {
      fields.push('is_playable = ?')
      values.push(updates.is_playable)
    }
    if (updates.play_error_reason !== undefined) {
      fields.push('play_error_reason = ?')
      values.push(updates.play_error_reason)
    }
    if (updates.play_count !== undefined) {
      fields.push('play_count = ?')
      values.push(updates.play_count)
    }
    if (updates.last_played_at !== undefined) {
      fields.push('last_played_at = ?')
      values.push(updates.last_played_at)
    }
    if (updates.is_corrupted !== undefined) {
      fields.push('is_corrupted = ?')
      values.push(updates.is_corrupted)
    }
    if (updates.is_duplicate !== undefined) {
      fields.push('is_duplicate = ?')
      values.push(updates.is_duplicate)
    }

    if (fields.length === 0) return

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const stmt = this.db!.prepare(`
      UPDATE all_music SET ${fields.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)
  }

  /**
   * 删除音乐记录
   */
  deleteAllMusic(id: number): void {
    const stmt = this.db!.prepare('DELETE FROM all_music WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 将 all_music 行映射为 MusicItem（带完整路径）
   */
  private mapAllMusicRowToMusicItem(row: any, fullPath: string): MusicItem & { fullPath: string } {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      year: row.year,
      genre: row.genre,
      filePath: fullPath,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      fileExtension: row.file_extension,
      duration: row.duration || 0,
      bitrate: row.bitrate || 0,
      sampleRate: row.sample_rate || 0,
      channels: row.channels || 0,
      coverPath: row.cover_path,
      lyricsPath: row.lyrics_path,
      playCount: row.play_count || 0,
      lastPlayedAt: row.last_played_at,
      favorite: false, // 需要从 favorites 表查询
      addedAt: row.added_at,
      updatedAt: row.updated_at,
      isCorrupted: row.is_corrupted === 1,
      isDuplicate: row.is_duplicate === 1,
      fullPath
    }
  }

  // ========== 音乐操作（旧版，保留兼容，后续将废弃） ==========

  insertMusic(music: Omit<MusicItem, 'id' | 'addedAt' | 'updatedAt'>): number {
    const stmt = this.db!.prepare(`
      INSERT INTO music (
        title, artist, album, year, genre,
        file_path, file_name, file_size, file_hash, file_extension,
        duration, bitrate, sample_rate, channels,
        cover_path, lyrics_path, play_count, favorite,
        is_corrupted, is_duplicate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      music.title,
      music.artist,
      music.album,
      music.year,
      music.genre,
      music.filePath,
      music.fileName,
      music.fileSize,
      music.fileHash,
      music.fileExtension,
      music.duration,
      music.bitrate,
      music.sampleRate,
      music.channels,
      music.coverPath,
      music.lyricsPath,
      music.playCount || 0,
      music.favorite ? 1 : 0,
      music.isCorrupted ? 1 : 0,
      music.isDuplicate ? 1 : 0
    )

    // 同步添加到 local_music 表
    try {
      this.addToLocalMusic(music.filePath)
    } catch (error) {
      console.warn('添加到本地音乐列表失败:', error)
    }

    return Number(result.lastInsertRowid)
  }

  insertMusicBatch(musicList: Omit<MusicItem, 'id' | 'addedAt' | 'updatedAt'>[]): void {
    const insert = this.db!.prepare(`
      INSERT INTO music (
        title, artist, album, year, genre,
        file_path, file_name, file_size, file_hash, file_extension,
        duration, bitrate, sample_rate, channels,
        cover_path, lyrics_path, play_count, favorite,
        is_corrupted, is_duplicate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db!.transaction((items: typeof musicList) => {
      for (const item of items) {
        insert.run(
          item.title,
          item.artist,
          item.album,
          item.year,
          item.genre,
          item.filePath,
          item.fileName,
          item.fileSize,
          item.fileHash,
          item.fileExtension,
          item.duration,
          item.bitrate,
          item.sampleRate,
          item.channels,
          item.coverPath,
          item.lyricsPath,
          item.playCount || 0,
          item.favorite ? 1 : 0,
          item.isCorrupted ? 1 : 0,
          item.isDuplicate ? 1 : 0
        )
      }
    })

    insertMany(musicList)
  }

  updateMusic(id: number, updates: Partial<MusicItem>): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.artist !== undefined) {
      fields.push('artist = ?')
      values.push(updates.artist)
    }
    if (updates.album !== undefined) {
      fields.push('album = ?')
      values.push(updates.album)
    }
    if (updates.year !== undefined) {
      fields.push('year = ?')
      values.push(updates.year)
    }
    if (updates.genre !== undefined) {
      fields.push('genre = ?')
      values.push(updates.genre)
    }
    if (updates.coverPath !== undefined) {
      fields.push('cover_path = ?')
      values.push(updates.coverPath)
    }
    if (updates.lyricsPath !== undefined) {
      fields.push('lyrics_path = ?')
      values.push(updates.lyricsPath)
    }
    if (updates.favorite !== undefined) {
      fields.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    if (updates.playCount !== undefined) {
      fields.push('play_count = ?')
      values.push(updates.playCount)
    }
    if (updates.lastPlayedAt !== undefined) {
      fields.push('last_played_at = ?')
      values.push(updates.lastPlayedAt)
    }

    if (fields.length === 0) return

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const stmt = this.db!.prepare(`
      UPDATE music SET ${fields.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)
  }

  updateMusicByPath(filePath: string, updates: Partial<MusicItem>): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.artist !== undefined) {
      fields.push('artist = ?')
      values.push(updates.artist)
    }
    if (updates.album !== undefined) {
      fields.push('album = ?')
      values.push(updates.album)
    }
    if (updates.year !== undefined) {
      fields.push('year = ?')
      values.push(updates.year)
    }
    if (updates.genre !== undefined) {
      fields.push('genre = ?')
      values.push(updates.genre)
    }
    if (updates.coverPath !== undefined) {
      fields.push('cover_path = ?')
      values.push(updates.coverPath)
    }
    if (updates.lyricsPath !== undefined) {
      fields.push('lyrics_path = ?')
      values.push(updates.lyricsPath)
    }
    if (updates.favorite !== undefined) {
      fields.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    if (updates.playCount !== undefined) {
      fields.push('play_count = ?')
      values.push(updates.playCount)
    }
    if (updates.lastPlayedAt !== undefined) {
      fields.push('last_played_at = ?')
      values.push(updates.lastPlayedAt)
    }

    if (fields.length === 0) return

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(filePath)

    const stmt = this.db!.prepare(`
      UPDATE music SET ${fields.join(', ')} WHERE file_path = ?
    `)
    stmt.run(...values)
  }

  deleteMusic(id: number): void {
    const stmt = this.db!.prepare('DELETE FROM music WHERE id = ?')
    stmt.run(id)
  }

  deleteMusicByPath(filePath: string): void {
    const stmt = this.db!.prepare('DELETE FROM music WHERE file_path = ?')
    stmt.run(filePath)
  }

  clearAllMusic(): void {
    // 使用事务确保原子性
    const transaction = this.db!.transaction(() => {
      // 1. 清空全文搜索索引
      this.db!.prepare('DELETE FROM music_fts').run()
      // 2. 清空本地音乐表
      this.db!.prepare('DELETE FROM music').run()

      // 重置自增ID（可选，但推荐）
      this.db!.prepare("DELETE FROM sqlite_sequence WHERE name='music'").run()
    })
    transaction()
  }

  getMusicById(id: number): MusicItem | null {
    const stmt = this.db!.prepare('SELECT * FROM music WHERE id = ?')
    const row = stmt.get(id) as any
    return row ? this.mapRowToMusicItem(row) : null
  }

  getMusicByPath(filePath: string): MusicItem | null {
    const stmt = this.db!.prepare('SELECT * FROM music WHERE file_path = ?')
    const row = stmt.get(filePath) as any
    return row ? this.mapRowToMusicItem(row) : null
  }

  getMusicList(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM music
      WHERE is_duplicate = 0
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  getMusicTotalCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM music WHERE is_duplicate = 0')
    const result = stmt.get() as { count: number }
    return result.count
  }

  searchMusic(query: string, limit: number = 50): MusicItem[] {
    // 如果查询为空，返回空数组
    if (!query || query.trim() === '') {
      return []
    }

    try {
      const stmt = this.db!.prepare(`
        SELECT m.*
        FROM music_fts fts
        JOIN music m ON m.id = fts.rowid
        WHERE music_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
      // 添加通配符支持模糊搜索
      const searchQuery = `${query.trim()}*`
      const rows = stmt.all(searchQuery, limit) as any[]
      return rows.map(row => this.mapRowToMusicItem(row))
    } catch (error) {
      console.error('搜索错误:', error)
      // 如果 FTS5 搜索失败，使用 LIKE 作为回退
      const stmt = this.db!.prepare(`
        SELECT * FROM music
        WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
        LIMIT ?
      `)
      const likeQuery = `%${query.trim()}%`
      const rows = stmt.all(likeQuery, likeQuery, likeQuery, limit) as any[]
      return rows.map(row => this.mapRowToMusicItem(row))
    }
  }

  advancedSearch(criteria: AdvancedSearchCriteria): MusicItem[] {
    const conditions: string[] = ['is_duplicate = 0']
    const params: any[] = []

    if (criteria.keyword) {
      const like = `%${criteria.keyword.trim()}%`
      conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ? OR file_name LIKE ?)')
      params.push(like, like, like, like)
    }

    if (criteria.artist) {
      conditions.push('artist LIKE ?')
      params.push(`%${criteria.artist.trim()}%`)
    }

    if (criteria.album) {
      conditions.push('album LIKE ?')
      params.push(`%${criteria.album.trim()}%`)
    }

    if (criteria.genre) {
      conditions.push('genre LIKE ?')
      params.push(`%${criteria.genre.trim()}%`)
    }

    if (criteria.favorite !== undefined) {
      // 使用独立的收藏表进行过滤
      if (criteria.favorite) {
        conditions.push('file_path IN (SELECT file_path FROM favorites)')
      } else {
        conditions.push('file_path NOT IN (SELECT file_path FROM favorites)')
      }
    }

    if (criteria.directory) {
      conditions.push('file_path LIKE ?')
      params.push(`${criteria.directory.replace(/%/g, '\\%')}%`)
    }

    if (criteria.fileExtension) {
      conditions.push('file_extension = ?')
      params.push(criteria.fileExtension.toLowerCase())
    }

    if (criteria.minDuration !== undefined) {
      conditions.push('duration >= ?')
      params.push(criteria.minDuration)
    }

    if (criteria.maxDuration !== undefined) {
      conditions.push('duration <= ?')
      params.push(criteria.maxDuration)
    }

    if (criteria.yearFrom !== undefined) {
      conditions.push('(year IS NOT NULL AND year >= ?)')
      params.push(criteria.yearFrom)
    }

    if (criteria.yearTo !== undefined) {
      conditions.push('(year IS NOT NULL AND year <= ?)')
      params.push(criteria.yearTo)
    }

    const sortFieldMap: Record<string, string> = {
      addedAt: 'added_at',
      title: 'title',
      duration: 'duration',
      playCount: 'play_count'
    }
    const sortField = sortFieldMap[criteria.sortBy || 'addedAt']
    const sortOrder = criteria.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const limit = criteria.limit && criteria.limit > 0 ? criteria.limit : 200

    const stmt = this.db!.prepare(`
      SELECT * FROM music
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ?
    `)
    const rows = stmt.all(...params, limit) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  getMusicByHash(hash: string): MusicItem[] {
    const stmt = this.db!.prepare('SELECT * FROM music WHERE file_hash = ?')
    const rows = stmt.all(hash) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  getMusicByGenre(genre: string): MusicItem[] {
    const stmt = this.db!.prepare('SELECT * FROM music WHERE genre = ? AND is_duplicate = 0 ORDER BY title')
    const rows = stmt.all(genre) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  getSimilarMusic(musicId: number, limit: number = 20, minSimilarity: number = 0.5): Array<MusicItem & { similarity: number }> {
    const target = this.getMusicById(musicId)
    if (!target) {
      return []
    }

    // 计算相似度的权重
    const artistWeight = 0.4
    const albumWeight = 0.2
    const genreWeight = 0.2
    const yearWeight = 0.1
    const durationWeight = 0.1

    // 构建相似度计算SQL - 使用子查询来过滤 similarity
    const stmt = this.db!.prepare(`
      SELECT * FROM (
        SELECT m.*,
          (
            (CASE WHEN m.artist = ? THEN ${artistWeight} ELSE 0 END) +
            (CASE WHEN m.album = ? THEN ${albumWeight} ELSE 0 END) +
            (CASE WHEN m.genre = ? THEN ${genreWeight} ELSE 0 END) +
            (CASE
              WHEN m.year IS NOT NULL AND ? IS NOT NULL THEN
                ${yearWeight} * (1.0 - ABS(m.year - ?) / 50.0)
              ELSE 0
            END) +
            (CASE
              WHEN m.duration > 0 AND ? > 0 THEN
                ${durationWeight} * (1.0 - ABS(m.duration - ?) / 600.0)
              ELSE 0
            END)
          ) AS similarity
        FROM music m
        WHERE m.id != ?
          AND m.is_duplicate = 0
          AND (
            m.artist = ? OR
            m.album = ? OR
            m.genre = ? OR
            (m.year IS NOT NULL AND ? IS NOT NULL AND ABS(m.year - ?) <= 5) OR
            (m.duration > 0 AND ? > 0 AND ABS(m.duration - ?) <= 60)
          )
      )
      WHERE similarity >= ?
      ORDER BY similarity DESC, play_count DESC
      LIMIT ?
    `)

    const rows = stmt.all(
      target.artist || '',
      target.album || '',
      target.genre || '',
      target.year,
      target.year,
      target.duration || 0,
      target.duration || 0,
      target.id,
      target.artist || '',
      target.album || '',
      target.genre || '',
      target.year,
      target.year,
      target.duration || 0,
      target.duration || 0,
      minSimilarity,
      limit
    ) as any[]

    return rows.map(row => ({
      ...this.mapRowToMusicItem(row),
      similarity: Math.min(1.0, Math.max(0, row.similarity || 0))
    }))
  }

  // ========== 播放列表操作 ==========

  createPlaylist(name: string, description?: string): number {
    const stmt = this.db!.prepare('INSERT INTO playlist (name, description) VALUES (?, ?)')
    const result = stmt.run(name, description || null)
    return Number(result.lastInsertRowid)
  }

  getPlaylists(): Playlist[] {
    const stmt = this.db!.prepare(
      'SELECT * FROM playlist ORDER BY display_order ASC, created_at DESC'
    )
    const rows = stmt.all() as any[]
    return rows.map(this.mapRowToPlaylist)
  }

  updatePlaylistOrder(playlistIds: number[]): void {
    const stmt = this.db!.prepare('UPDATE playlist SET display_order = ? WHERE id = ?')
    playlistIds.forEach((id, index) => {
      stmt.run(index, id)
    })
  }

  getPlaylistById(id: number): Playlist | null {
    const stmt = this.db!.prepare('SELECT * FROM playlist WHERE id = ?')
    const row = stmt.get(id) as any
    return row ? this.mapRowToPlaylist(row) : null
  }

  updatePlaylist(id: number, updates: Partial<Playlist>): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.coverPath !== undefined) {
      fields.push('cover_path = ?')
      values.push(updates.coverPath)
    }

    if (fields.length === 0) return

    const stmt = this.db!.prepare(`
      UPDATE playlist
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(...values, id)
  }

  deletePlaylist(id: number): void {
    const stmt = this.db!.prepare('DELETE FROM playlist WHERE id = ?')
    stmt.run(id)
  }

  addToPlaylist(playlistId: number, filePath: string, position?: number): void {
    if (position === undefined) {
      const stmt = this.db!.prepare('SELECT MAX(position) as max_pos FROM playlist_item WHERE playlist_id = ?')
      const result = stmt.get(playlistId) as { max_pos: number | null }
      position = (result.max_pos ?? -1) + 1
    }

    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO playlist_item (playlist_id, file_path, position)
      VALUES (?, ?, ?)
    `)
    stmt.run(playlistId, filePath, position)

    // 更新播放列表统计
    this.updatePlaylistStats(playlistId)
  }

  getPlaylistSongs(playlistId: number): MusicItem[] {
    // 使用 LEFT JOIN 一次性获取所有歌曲信息，避免 N+1 查询问题
    const stmt = this.db!.prepare(`
      SELECT
        m.*,
        pi.position,
        pi.added_at as playlist_added_at
      FROM playlist_item pi
      LEFT JOIN music m ON pi.file_path = m.file_path
      WHERE pi.playlist_id = ?
      ORDER BY pi.position
    `)
    const rows = stmt.all(playlistId) as any[]

    return rows.map(row => {
      // 如果 music 表中有数据（m.id 不为 null），使用完整的 MusicItem
      if (row.id !== null) {
        return this.mapRowToMusicItem(row)
      } else {
        // 如果 music 表中没有数据，创建临时 MusicItem
        // 注意：这种情况应该很少发生，因为添加到歌单时应该确保文件在 music 表中
        const path = require('path')
        const filePath = row.file_path
        const fileName = path.basename(filePath)
        const ext = path.extname(filePath).toLowerCase()

        return {
          id: -1,
          title: fileName.replace(ext, ''),
          artist: '未知艺术家',
          album: null,
          year: null,
          genre: null,
          filePath: filePath,
          fileName: fileName,
          fileSize: 0,
          fileHash: '',
          fileExtension: ext,
          duration: 0,
          bitrate: 0,
          sampleRate: 0,
          channels: 0,
          coverPath: null,
          lyricsPath: null,
          playCount: 0,
          lastPlayedAt: null,
          favorite: false,
          addedAt: row.playlist_added_at || new Date().toISOString(),
          updatedAt: row.playlist_added_at || new Date().toISOString(),
          isCorrupted: false,
          isDuplicate: false
        }
      }
    })
  }

  // 检查文件路径是否在播放列表中
  isFileInPlaylist(filePath: string, playlistId?: number): boolean {
    if (playlistId !== undefined) {
      // 检查是否在指定播放列表中
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ? AND file_path = ?')
      const result = stmt.get(playlistId, filePath) as { count: number }
      return result.count > 0
    } else {
      // 检查是否在任何播放列表中
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE file_path = ?')
      const result = stmt.get(filePath) as { count: number }
      return result.count > 0
    }
  }

  // 获取文件路径所在的所有播放列表ID
  getPlaylistsForFile(filePath: string): number[] {
    const stmt = this.db!.prepare('SELECT DISTINCT playlist_id FROM playlist_item WHERE file_path = ?')
    const rows = stmt.all(filePath) as Array<{ playlist_id: number }>
    return rows.map(row => row.playlist_id)
  }

  // 从播放列表中移除文件（通过文件路径）
  removeFromPlaylistByPath(playlistId: number, filePath: string): void {
    const stmt = this.db!.prepare('DELETE FROM playlist_item WHERE playlist_id = ? AND file_path = ?')
    stmt.run(playlistId, filePath)
    this.updatePlaylistStats(playlistId)
  }

  private updatePlaylistStats(playlistId: number): void {
    // 更新播放列表统计（基于文件路径匹配 music 表）
    const stmt = this.db!.prepare(`
      UPDATE playlist SET
        song_count = (SELECT COUNT(*) FROM playlist_item WHERE playlist_id = ?),
        total_duration = (
          SELECT COALESCE(SUM(m.duration), 0)
          FROM playlist_item pi
          LEFT JOIN music m ON pi.file_path = m.file_path
          WHERE pi.playlist_id = ?
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(playlistId, playlistId, playlistId)
  }

  // ========== 去重操作 ==========

  getDuplicateGroups(): DuplicateGroup[] {
    const stmt = this.db!.prepare(`
      SELECT file_hash, COUNT(*) as count
      FROM music
      GROUP BY file_hash
      HAVING COUNT(*) > 1
    `)
    const rows = stmt.all() as Array<{ file_hash: string; count: number }>

    return rows.map(row => ({
      fileHash: row.file_hash,
      count: row.count,
      files: this.getMusicByHash(row.file_hash)
    }))
  }

  markAsDuplicate(musicId: number, isDuplicate: boolean): void {
    const stmt = this.db!.prepare('UPDATE music SET is_duplicate = ? WHERE id = ?')
    stmt.run(isDuplicate ? 1 : 0, musicId)
  }

  // ========== 列表表操作（v1.0.6 新架构，基于 music_id） ==========

  /**
   * local_music 表操作（基于 music_id）
   */
  addToLocalMusicByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('INSERT OR IGNORE INTO local_music (music_id) VALUES (?)')
    stmt.run(musicId)
  }

  removeFromLocalMusicByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM local_music WHERE music_id = ?')
    stmt.run(musicId)
  }

  isInLocalMusicByMusicId(musicId: number): boolean {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM local_music WHERE music_id = ?')
    const result = stmt.get(musicId) as { count: number }
    return result.count > 0
  }

  getLocalMusicByMusicId(offset: number, limit: number): Array<MusicItem & { fullPath: string }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM local_music lm
      JOIN all_music am ON lm.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      ORDER BY lm.added_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return this.mapAllMusicRowToMusicItem(row, fullPath)
    })
  }

  /**
   * favorites 表操作（基于 music_id）
   */
  addToFavoritesByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('INSERT OR IGNORE INTO favorites (music_id) VALUES (?)')
    stmt.run(musicId)
  }

  removeFromFavoritesByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM favorites WHERE music_id = ?')
    stmt.run(musicId)
  }

  isFavoriteByMusicId(musicId: number): boolean {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites WHERE music_id = ?')
    const result = stmt.get(musicId) as { count: number }
    return result.count > 0
  }

  getFavoritesByMusicId(): Array<MusicItem & { fullPath: string }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM favorites f
      JOIN all_music am ON f.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      ORDER BY f.added_at DESC
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return this.mapAllMusicRowToMusicItem(row, fullPath)
    })
  }

  /**
   * playlist_item 表操作（基于 music_id）
   */
  addToPlaylistByMusicId(playlistId: number, musicId: number, position?: number): void {
    // 如果没有指定位置，添加到末尾
    if (position === undefined) {
      const maxPositionStmt = this.db!.prepare('SELECT MAX(position) as max_pos FROM playlist_item WHERE playlist_id = ?')
      const maxPos = maxPositionStmt.get(playlistId) as { max_pos: number } | undefined
      position = (maxPos?.max_pos ?? -1) + 1
    }

    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO playlist_item (playlist_id, music_id, position)
      VALUES (?, ?, ?)
    `)
    stmt.run(playlistId, musicId, position)
  }

  removeFromPlaylistByMusicId(playlistId: number, musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM playlist_item WHERE playlist_id = ? AND music_id = ?')
    stmt.run(playlistId, musicId)
  }

  getPlaylistSongsByMusicId(playlistId: number): Array<MusicItem & { fullPath: string; position: number }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        pi.position
      FROM playlist_item pi
      JOIN all_music am ON pi.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
    `)
    const rows = stmt.all(playlistId) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return {
        ...this.mapAllMusicRowToMusicItem(row, fullPath),
        position: row.position
      }
    })
  }

  /**
   * recent_plays 表操作（基于 music_id）
   */
  addToRecentPlaysByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('INSERT INTO recent_plays (music_id) VALUES (?)')
    stmt.run(musicId)

    // 限制最近播放记录数量（保留最近1000条）
    const limitStmt = this.db!.prepare(`
      DELETE FROM recent_plays
      WHERE id NOT IN (
        SELECT id FROM recent_plays
        ORDER BY played_at DESC
        LIMIT 1000
      )
    `)
    limitStmt.run()
  }

  getRecentPlaysByMusicId(limit: number = 50): Array<MusicItem & { fullPath: string; playedAt: string }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        rp.played_at
      FROM recent_plays rp
      JOIN all_music am ON rp.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      ORDER BY rp.played_at DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return {
        ...this.mapAllMusicRowToMusicItem(row, fullPath),
        playedAt: row.played_at
      }
    })
  }

  /**
   * play_queue 表操作（基于 music_id）
   */
  addToPlayQueueByMusicId(musicId: number, position?: number): void {
    if (position === undefined) {
      const maxPositionStmt = this.db!.prepare('SELECT MAX(position) as max_pos FROM play_queue')
      const maxPos = maxPositionStmt.get() as { max_pos: number } | undefined
      position = (maxPos?.max_pos ?? -1) + 1
    }

    const stmt = this.db!.prepare('INSERT INTO play_queue (music_id, position) VALUES (?, ?)')
    stmt.run(musicId, position)
  }

  removeFromPlayQueueByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM play_queue WHERE music_id = ?')
    stmt.run(musicId)
  }

  clearPlayQueue(): void {
    this.db!.prepare('DELETE FROM play_queue').run()
  }

  getPlayQueueByMusicId(): Array<MusicItem & { fullPath: string; position: number }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        pq.position
      FROM play_queue pq
      JOIN all_music am ON pq.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      ORDER BY pq.position ASC
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return {
        ...this.mapAllMusicRowToMusicItem(row, fullPath),
        position: row.position
      }
    })
  }

  /**
   * discover_music 表操作（基于 music_id）
   */
  addToDiscoverMusicByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('INSERT OR IGNORE INTO discover_music (music_id) VALUES (?)')
    stmt.run(musicId)
  }

  removeFromDiscoverMusicByMusicId(musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM discover_music WHERE music_id = ?')
    stmt.run(musicId)
  }

  getDiscoverMusicByMusicId(limit: number = 100): Array<MusicItem & { fullPath: string; discoveredAt: string }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        dm.discovered_at
      FROM discover_music dm
      JOIN all_music am ON dm.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      ORDER BY dm.discovered_at DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name }, process.platform)
      return {
        ...this.mapAllMusicRowToMusicItem(row, fullPath),
        discoveredAt: row.discovered_at
      }
    })
  }

  // ========== 收藏和历史（旧版，保留兼容，后续将废弃） ==========

  toggleFavorite(filePath: string): void {
    // 计算文件路径 MD5
    const filePathMd5 = calculateFilePathMD5(filePath)

    // 检查是否已在收藏表中
    const checkStmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites WHERE file_path = ?')
    const result = checkStmt.get(filePath) as { count: number }

    if (result.count > 0) {
      // 如果已收藏，移除
      const deleteStmt = this.db!.prepare('DELETE FROM favorites WHERE file_path = ?')
      deleteStmt.run(filePath)
    } else {
      // 如果未收藏，添加
      const insertStmt = this.db!.prepare('INSERT INTO favorites (file_path, file_path_md5) VALUES (?, ?)')
      insertStmt.run(filePath, filePathMd5)
    }
  }

  isFileFavorite(filePath: string): boolean {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites WHERE file_path = ?')
    const result = stmt.get(filePath) as { count: number }
    return result.count > 0
  }

  getFavorites(): MusicItem[] {
    // 使用 LEFT JOIN 一次性获取所有收藏歌曲信息，避免 N+1 查询问题
    const stmt = this.db!.prepare(`
      SELECT
        m.*,
        f.added_at as favorite_added_at,
        f.file_path as fav_file_path
      FROM favorites f
      LEFT JOIN music m ON f.file_path = m.file_path
      WHERE f.file_path IS NOT NULL AND f.file_path != ''
      ORDER BY f.added_at DESC
    `)
    const rows = stmt.all() as any[]

    return rows.map(row => {
      // 如果 music 表中有数据（m.id 不为 null），使用完整的 MusicItem
      if (row.id !== null) {
        const item = this.mapRowToMusicItem(row)
        item.favorite = true // 确保 favorite 标记为 true
        return item
      } else {
        // 如果 music 表中没有数据，创建临时 MusicItem
        const filePath = row.fav_file_path

        // 再次检查 filePath 有效性（双重保护）
        if (!filePath || typeof filePath !== 'string') {
          console.warn('收藏表中发现无效的 file_path:', filePath)
          return null
        }

        const path = require('path')
        const fileName = path.basename(filePath)
        const ext = path.extname(filePath).toLowerCase()

        return {
          id: -1,
          title: fileName.replace(ext, ''),
          artist: '未知艺术家',
          album: null,
          year: null,
          genre: null,
          filePath: filePath,
          fileName: fileName,
          fileSize: 0,
          fileHash: '',
          fileExtension: ext,
          duration: 0,
          bitrate: 0,
          sampleRate: 0,
          channels: 0,
          coverPath: null,
          lyricsPath: null,
          playCount: 0,
          lastPlayedAt: null,
          favorite: true,
          addedAt: row.favorite_added_at || new Date().toISOString(),
          updatedAt: row.favorite_added_at || new Date().toISOString(),
          isCorrupted: false,
          isDuplicate: false
        }
      }
    }).filter(item => item !== null) as MusicItem[] // 过滤掉无效项
  }

  recordPlay(filePath: string): void {
    // 插入播放历史（使用 file_path）
    const historyStmt = this.db!.prepare('INSERT INTO play_history (file_path) VALUES (?)')
    historyStmt.run(filePath)

    // 更新播放统计（如果该音乐在 music 表中存在）
    const updateStmt = this.db!.prepare(`
      UPDATE music SET
        play_count = play_count + 1,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `)
    updateStmt.run(filePath)
  }

  getPlayHistory(limit: number = 50): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT m.*
      FROM music m
      JOIN play_history ph ON m.file_path = ph.file_path
      WHERE m.is_duplicate = 0
      ORDER BY ph.played_at DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  clearPlayHistory(): void {
    const stmt = this.db!.prepare('DELETE FROM play_history')
    stmt.run()
    // 重置所有音乐的播放次数和最后播放时间
    const resetStmt = this.db!.prepare('UPDATE music SET play_count = 0, last_played_at = NULL')
    resetStmt.run()
  }

  // ========== music_dir 表操作 ==========

  /**
   * 根据ID获取目录记录
   */
  getMusicDirById(id: number): { id: number; path: string; created_at: string; updated_at: string } | null {
    const stmt = this.db!.prepare('SELECT * FROM music_dir WHERE id = ?')
    return stmt.get(id) as { id: number; path: string; created_at: string; updated_at: string } | null
  }

  /**
   * 根据路径获取目录记录
   */
  getMusicDirByPath(path: string): { id: number; path: string; created_at: string; updated_at: string } | null {
    const normalizedPath = normalizePath(path, process.platform)
    const stmt = this.db!.prepare('SELECT * FROM music_dir WHERE path = ?')
    return stmt.get(normalizedPath) as { id: number; path: string; created_at: string; updated_at: string } | null
  }

  /**
   * 创建目录记录
   */
  createMusicDir(path: string): number {
    return getOrCreateMusicDir(this.db!, path, process.platform)
  }

  /**
   * 批量创建目录记录
   */
  batchCreateMusicDirs(paths: string[]): Record<string, number> {
    return batchGetOrCreateMusicDir(this.db!, paths, process.platform)
  }

  /**
   * 获取数据库实例（用于路径工具函数）
   */
  getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  /**
   * 删除目录记录
   */
  deleteMusicDir(id: number): boolean {
    const stmt = this.db!.prepare('DELETE FROM music_dir WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 获取所有目录记录
   */
  getAllMusicDirs(): Array<{ id: number; path: string; created_at: string; updated_at: string }> {
    const stmt = this.db!.prepare('SELECT * FROM music_dir ORDER BY id ASC')
    return stmt.all() as Array<{ id: number; path: string; created_at: string; updated_at: string }>
  }

  // ========== local_music_dir 表操作 ==========

  /**
   * 添加扫描根目录
   */
  addLocalMusicDir(path: string, displayOrder?: number): { id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string } {
    // 验证路径
    if (!existsSync(path)) {
      throw new Error('目录不存在')
    }

    // 规范化路径
    const normalizedPath = normalizePath(path, process.platform)

    // 检查是否已存在
    const existing = this.db!.prepare('SELECT id FROM local_music_dir WHERE path = ?').get(normalizedPath)
    if (existing) {
      throw new Error('目录已存在')
    }

    // 检查数量限制（最多20个）
    const count = this.db!.prepare('SELECT COUNT(*) as count FROM local_music_dir').get() as { count: number }
    if (count.count >= 20) {
      throw new Error('最多只能添加20个扫描目录')
    }

    // 确定显示顺序
    if (displayOrder === undefined) {
      const maxOrder = this.db!.prepare('SELECT MAX(display_order) as max_order FROM local_music_dir').get() as { max_order: number }
      displayOrder = (maxOrder.max_order ?? -1) + 1
    }

    // 插入记录
    const stmt = this.db!.prepare(`
      INSERT INTO local_music_dir (path, display_order, enabled)
      VALUES (?, ?, 1)
    `)
    const result = stmt.run(normalizedPath, displayOrder)

    return this.getLocalMusicDirById(result.lastInsertRowid as number)!
  }

  /**
   * 删除扫描根目录
   */
  deleteLocalMusicDir(id: number, options?: { removeScannedFiles?: boolean }): boolean {
    // 获取目录信息
    const dir = this.getLocalMusicDirById(id)
    if (!dir) {
      throw new Error('目录不存在')
    }

    // 如果选择删除已扫描的文件
    if (options?.removeScannedFiles) {
      this.removeScannedFilesFromDir(dir.path)
    }

    // 删除目录记录
    const stmt = this.db!.prepare('DELETE FROM local_music_dir WHERE id = ?')
    const result = stmt.run(id)

    return result.changes > 0
  }

  /**
   * 删除指定目录下已扫描的文件
   */
  private removeScannedFilesFromDir(rootPath: string): void {
    // 查找所有相关的 music_dir 记录（路径以 rootPath 开头）
    const normalizedRoot = normalizePath(rootPath, process.platform)
    const dirs = this.db!.prepare(`
      SELECT id FROM music_dir
      WHERE path LIKE ? || '%'
    `).all(normalizedRoot) as Array<{ id: number }>

    const dirIds = dirs.map(d => d.id)

    if (dirIds.length === 0) {
      return
    }

    // 删除相关的 all_music 记录（级联删除会处理列表表）
    const placeholders = dirIds.map(() => '?').join(',')
    this.db!.prepare(`
      DELETE FROM all_music
      WHERE dir_id IN (${placeholders})
    `).run(...dirIds)

    // 删除相关的 music_dir 记录
    this.db!.prepare(`
      DELETE FROM music_dir
      WHERE id IN (${placeholders})
    `).run(...dirIds)
  }

  /**
   * 更新扫描目录信息
   */
  updateLocalMusicDir(
    id: number,
    updates: {
      path?: string
      display_order?: number
      enabled?: boolean
    }
  ): { id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string } {
    // 检查目录是否存在
    const existing = this.getLocalMusicDirById(id)
    if (!existing) {
      throw new Error('目录不存在')
    }

    // 如果更新路径，需要验证
    if (updates.path) {
      if (!existsSync(updates.path)) {
        throw new Error('目录不存在')
      }
      updates.path = normalizePath(updates.path, process.platform)

      // 检查新路径是否已存在（排除自己）
      const conflict = this.db!.prepare('SELECT id FROM local_music_dir WHERE path = ? AND id != ?').get(updates.path, id)
      if (conflict) {
        throw new Error('目录路径已存在')
      }
    }

    // 构建更新SQL
    const fields: string[] = []
    const values: any[] = []

    if (updates.path !== undefined) {
      fields.push('path = ?')
      values.push(updates.path)
    }
    if (updates.display_order !== undefined) {
      fields.push('display_order = ?')
      values.push(updates.display_order)
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }

    if (fields.length === 0) {
      return existing
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    // 执行更新
    const sql = `UPDATE local_music_dir SET ${fields.join(', ')} WHERE id = ?`
    this.db!.prepare(sql).run(...values)

    // 返回更新后的记录
    return this.getLocalMusicDirById(id)!
  }

  /**
   * 获取所有扫描目录
   */
  getAllLocalMusicDirs(options?: {
    enabled?: boolean
    sortBy?: 'display_order' | 'created_at' | 'path'
    order?: 'ASC' | 'DESC'
  }): Array<{ id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string }> {
    let sql = 'SELECT * FROM local_music_dir WHERE 1=1'
    const params: any[] = []

    if (options?.enabled !== undefined) {
      sql += ' AND enabled = ?'
      params.push(options.enabled ? 1 : 0)
    }

    const sortBy = options?.sortBy || 'display_order'
    const order = options?.order || 'ASC'
    sql += ` ORDER BY ${sortBy} ${order}`

    return this.db!.prepare(sql).all(...params) as Array<{ id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string }>
  }

  /**
   * 根据ID获取扫描目录
   */
  getLocalMusicDirById(id: number): { id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string } | null {
    const stmt = this.db!.prepare('SELECT * FROM local_music_dir WHERE id = ?')
    return stmt.get(id) as { id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string } | null
  }

  /**
   * 获取启用的扫描目录（用于扫描）
   */
  getEnabledLocalMusicDirs(): Array<{ id: number; path: string; display_order: number; enabled: number; created_at: string; updated_at: string }> {
    return this.getAllLocalMusicDirs({
      enabled: true,
      sortBy: 'display_order',
      order: 'ASC'
    })
  }

  /**
   * 批量更新显示顺序
   */
  updateLocalMusicDirOrders(orders: Record<number, number>): void {
    const stmt = this.db!.prepare('UPDATE local_music_dir SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    const updateMany = this.db!.transaction((orders: Record<number, number>) => {
      for (const [id, order] of Object.entries(orders)) {
        stmt.run(order, parseInt(id))
      }
    })

    updateMany(orders)
  }

  /**
   * 验证目录路径是否有效
   */
  async validateDirectoryPath(path: string): Promise<void> {
    const fs = await import('fs/promises')

    // 检查路径是否存在
    try {
      const stat = await fs.stat(path)
      if (!stat.isDirectory()) {
        throw new Error('路径不是目录')
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('目录不存在')
      }
      throw new Error(`无法访问目录: ${error.message}`)
    }

    // 检查是否有读取权限
    try {
      await fs.access(path, fs.constants.R_OK)
    } catch (error: any) {
      throw new Error('目录没有读取权限')
    }

    // 检查路径长度（避免过长的路径）
    if (path.length > 4096) {
      throw new Error('路径过长')
    }
  }

  // ========== 音乐目录管理（旧版，保留兼容） ==========

  getMusicDirectories(): any[] {
    const stmt = this.db!.prepare('SELECT * FROM music_directory ORDER BY priority DESC, created_at ASC')
    return stmt.all()
  }

  addMusicDirectory(directory: any): string {
    const id = crypto.randomUUID()
    const stmt = this.db!.prepare(`
      INSERT INTO music_directory (id, path, name, enabled, auto_scan, scan_depth, file_types, exclude_paths, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      directory.path,
      directory.name || null,
      directory.enabled ? 1 : 0,
      directory.autoScan ? 1 : 0,
      directory.scanDepth || 'recursive',
      JSON.stringify(directory.fileTypes || []),
      JSON.stringify(directory.excludePaths || []),
      directory.priority || 0
    )
    return id
  }

  updateMusicDirectory(id: string, updates: any): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }
    if (updates.autoScan !== undefined) {
      fields.push('auto_scan = ?')
      values.push(updates.autoScan ? 1 : 0)
    }
    if (updates.scanDepth !== undefined) {
      fields.push('scan_depth = ?')
      values.push(updates.scanDepth)
    }
    if (updates.fileTypes !== undefined) {
      fields.push('file_types = ?')
      values.push(JSON.stringify(updates.fileTypes))
    }
    if (updates.excludePaths !== undefined) {
      fields.push('exclude_paths = ?')
      values.push(JSON.stringify(updates.excludePaths))
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?')
      values.push(updates.priority)
    }

    if (fields.length === 0) return

    const stmt = this.db!.prepare(`
      UPDATE music_directory
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(...values, id)
  }

  deleteMusicDirectory(id: string): void {
    const stmt = this.db!.prepare('DELETE FROM music_directory WHERE id = ?')
    stmt.run(id)
  }

  // ========== 设置 ==========

  getSetting(key: string): any {
    if (!this.db) {
      return null
    }
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    if (row) {
      try {
        return JSON.parse(row.value)
      } catch {
        return row.value
      }
    }
    return null
  }

  setSetting(key: string, value: any): void {
    if (!this.db) {
      console.warn(`[DB] setSetting skipped, database not initialized`)
      return
    }
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `)
    stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

  getAllSettings(): Record<string, any> {
    if (!this.db) {
      return {}
    }
    const stmt = this.db.prepare('SELECT key, value FROM settings')
    const rows = stmt.all() as Array<{ key: string; value: string }>
    const settings: Record<string, any> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings
  }

  // ========== 搜索历史 ==========

  addSearchHistory(query: string, searchType: 'basic' | 'advanced' = 'basic', criteria?: AdvancedSearchCriteria): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare(`
        INSERT INTO search_history (query, search_type, criteria)
        VALUES (?, ?, ?)
      `)
      stmt.run(query, searchType, criteria ? JSON.stringify(criteria) : null)

      // 只保留最近 10 条历史记录
      const deleteStmt = this.db.prepare(`
        DELETE FROM search_history
        WHERE id NOT IN (
          SELECT id FROM search_history
          ORDER BY created_at DESC
          LIMIT 10
        )
      `)
      deleteStmt.run()
    } catch (error) {
      console.error('添加搜索历史失败:', error)
    }
  }

  getSearchHistory(limit: number = 10): Array<{ query: string; searchType: string; createdAt: string }> {
    if (!this.db) return []
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT query, search_type, created_at
        FROM search_history
        ORDER BY created_at DESC
        LIMIT ?
      `)
      const rows = stmt.all(limit) as any[]
      return rows.map(row => ({
        query: row.query,
        searchType: row.search_type,
        createdAt: row.created_at
      }))
    } catch (error) {
      console.error('获取搜索历史失败:', error)
      return []
    }
  }

  clearSearchHistory(): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare('DELETE FROM search_history')
      stmt.run()
    } catch (error) {
      console.error('清空搜索历史失败:', error)
    }
  }

  // ========== 搜索建议 ==========

  getSearchSuggestions(query: string, limit: number = 5): string[] {
    if (!this.db || !query || query.trim() === '') return []

    try {
      // 从音乐标题、艺术家、专辑中搜索建议
      const stmt = this.db.prepare(`
        SELECT DISTINCT
          CASE
            WHEN title LIKE ? THEN title
            WHEN artist LIKE ? THEN artist
            WHEN album LIKE ? THEN album
          END AS suggestion
        FROM music
        WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
        LIMIT ?
      `)
      const likeQuery = `%${query.trim()}%`
      const rows = stmt.all(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, limit) as Array<{ suggestion: string }>

      const suggestions = rows
        .map(row => row.suggestion)
        .filter(s => s && s.trim() !== '')
        .slice(0, limit)

      return suggestions
    } catch (error) {
      console.error('获取搜索建议失败:', error)
      return []
    }
  }

  // ========== 数据库备份 ==========

  async backupDatabase(targetPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const dbPath = this.db.name
    await copyFileAsync(dbPath, targetPath)
  }

  // ========== 辅助方法 ==========

  mapRowToMusicItem(row: any): MusicItem {
    // 如果 file_path 为 null 或 undefined，返回一个默认的 MusicItem
    if (!row.file_path) {
      return {
        id: row.id || -1,
        title: '未知歌曲',
        artist: '未知艺术家',
        album: null,
        year: null,
        genre: null,
        filePath: '',
        fileName: '',
        fileSize: 0,
        fileHash: '',
        fileExtension: '',
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        channels: 0,
        coverPath: null,
        lyricsPath: null,
        playCount: 0,
        lastPlayedAt: null,
        favorite: false,
        addedAt: row.added_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
        isCorrupted: true,
        isDuplicate: false
      }
    }

    // 检查是否在收藏表中（基于文件路径）
    const isFavorite = this.isFileFavorite(row.file_path)

    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      year: row.year,
      genre: row.genre,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      fileExtension: row.file_extension,
      duration: row.duration || 0,
      bitrate: row.bitrate || 0,
      sampleRate: row.sample_rate || 0,
      channels: row.channels || 0,
      coverPath: row.cover_path,
      lyricsPath: row.lyrics_path,
      playCount: row.play_count || 0,
      lastPlayedAt: row.last_played_at,
      favorite: isFavorite, // 从独立的收藏表获取
      addedAt: row.added_at,
      updatedAt: row.updated_at,
      isCorrupted: row.is_corrupted === 1,
      isDuplicate: row.is_duplicate === 1
    }
  }

  private mapRowToPlaylist(row: any): Playlist {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      coverPath: row.cover_path,
      songCount: row.song_count || 0,
      totalDuration: row.total_duration || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  // ========== 播放统计 ==========

  getOverallStatistics(): {
    totalPlays: number
    totalDuration: number
    totalSongs: number
    averagePlaysPerSong: number
    averageDuration: number
  } {
    // 总播放次数
    const totalPlaysStmt = this.db!.prepare('SELECT SUM(play_count) as total FROM music')
    const totalPlaysResult = totalPlaysStmt.get() as { total: number | null }
    const totalPlays = totalPlaysResult.total || 0

    // 总歌曲数
    const totalSongsStmt = this.db!.prepare('SELECT COUNT(*) as count FROM music WHERE is_duplicate = 0')
    const totalSongsResult = totalSongsStmt.get() as { count: number }
    const totalSongs = totalSongsResult.count || 0

    // 总播放时长（基于播放次数和歌曲时长）
    const durationStmt = this.db!.prepare(`
      SELECT SUM(play_count * duration) as total_duration
      FROM music
      WHERE is_duplicate = 0 AND duration > 0 AND play_count > 0
    `)
    const durationResult = durationStmt.get() as { total_duration: number | null }
    const totalDuration = durationResult.total_duration || 0

    // 平均播放次数
    const averagePlaysPerSong = totalSongs > 0 ? totalPlays / totalSongs : 0

    // 平均播放时长（基于总播放次数）
    const averageDuration = totalPlays > 0 ? totalDuration / totalPlays : 0

    return {
      totalPlays,
      totalDuration,
      totalSongs,
      averagePlaysPerSong: Math.round(averagePlaysPerSong * 100) / 100,
      averageDuration: Math.round(averageDuration)
    }
  }

  getTopPlayedSongs(limit: number = 20): Array<MusicItem & { playCount: number; lastPlayedAt: string | null }> {
    const stmt = this.db!.prepare(`
      SELECT m.*
      FROM music m
      WHERE m.is_duplicate = 0 AND m.play_count > 0
      ORDER BY m.play_count DESC, m.last_played_at DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => ({
      ...this.mapRowToMusicItem(row),
      playCount: row.play_count || 0,
      lastPlayedAt: row.last_played_at
    }))
  }

  getPlayTrend(days: number = 30): Array<{ date: string; count: number; duration: number }> {
    const stmt = this.db!.prepare(`
      SELECT
        DATE(played_at) as date,
        COUNT(*) as count
      FROM play_history
      WHERE played_at >= datetime('now', '-' || ? || ' days')
      GROUP BY DATE(played_at)
      ORDER BY date ASC
    `)
    const rows = stmt.all(days) as Array<{ date: string; count: number }>

    // 获取每天的播放时长（基于播放历史）
    const durationStmt = this.db!.prepare(`
      SELECT
        DATE(ph.played_at) as date,
        SUM(COALESCE(m.duration, 0)) as duration
      FROM play_history ph
      JOIN music m ON ph.file_path = m.file_path
      WHERE ph.played_at >= datetime('now', '-' || ? || ' days')
        AND m.duration > 0
      GROUP BY DATE(ph.played_at)
      ORDER BY date ASC
    `)
    const durationRows = durationStmt.all(days) as Array<{ date: string; duration: number }>

    // 合并数据
    const durationMap = new Map<string, number>()
    durationRows.forEach(row => {
      durationMap.set(row.date, row.duration || 0)
    })

    return rows.map(row => ({
      date: row.date,
      count: row.count,
      duration: durationMap.get(row.date) || 0
    }))
  }

  getArtistStatistics(limit: number = 20): Array<{ artist: string; playCount: number; songCount: number }> {
    const stmt = this.db!.prepare(`
      SELECT
        artist,
        SUM(play_count) as play_count,
        COUNT(*) as song_count
      FROM music
      WHERE is_duplicate = 0 AND artist IS NOT NULL AND artist != ''
      GROUP BY artist
      ORDER BY play_count DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as Array<{ artist: string; play_count: number; song_count: number }>
    return rows.map(row => ({
      artist: row.artist,
      playCount: row.play_count || 0,
      songCount: row.song_count || 0
    }))
  }

  /**
   * 检查数据库版本
   * 如果版本不匹配，清空并重建数据库
   */
  private checkDatabaseVersion(): void {
    try {
      // 获取当前存储的版本号
      const storedVersion = this.getSetting(DB_VERSION_KEY)

      console.log(`📊 数据库版本检查:`)
      console.log(`   当前代码版本: ${DB_VERSION}`)
      console.log(`   数据库存储版本: ${storedVersion || '未设置'}`)

      if (storedVersion === null) {
        // 首次运行或旧版本数据库，保存当前版本
        console.log(`✅ 首次运行，保存数据库版本: ${DB_VERSION}`)
        this.setSetting(DB_VERSION_KEY, DB_VERSION)
        return
      }

      if (storedVersion !== DB_VERSION) {
        // 版本不匹配（这种情况不应该发生，因为在 initialize 开始时已经检查过了）
        console.warn(`⚠️  数据库版本不匹配！`)
        console.warn(`   预期版本: ${DB_VERSION}`)
        console.warn(`   实际版本: ${storedVersion}`)
        // 更新版本号
        this.setSetting(DB_VERSION_KEY, DB_VERSION.toString())
        console.log(`✅ 已更新数据库版本为: ${DB_VERSION}`)
      } else {
        console.log(`✅ 数据库版本匹配`)
      }
    } catch (error: any) {
      console.error(`❌ 版本检查失败:`, error)
      throw error
    }
  }

  /**
   * 清空并重建数据库
   */
  private clearAndRebuildDatabase(): void {
    try {
      console.log(`🗑️  开始清空数据库...`)

      // 1. 删除所有表数据（保留表结构）
      this.clearAllTables()

      // 2. 删除封面和歌词文件
      this.clearMediaFiles()

      // 3. 重新执行迁移（确保表结构最新）
      console.log(`🔄 重新执行数据库迁移...`)
      this.migrate()

      // 4. 重新创建索引
      console.log(`🔄 重新创建索引...`)
      this.createIndexes()

      // 5. 保存新版本号
      this.setSetting(DB_VERSION_KEY, DB_VERSION)

      console.log(`✅ 数据库清空并重建完成`)
    } catch (error: any) {
      console.error(`❌ 清空重建失败:`, error)
      throw error
    }
  }

  /**
   * 清空所有表数据
   */
  private clearAllTables(): void {
    try {
      // 获取所有表名
      const tables = this.db!.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
      `).all() as Array<{ name: string }>

      console.log(`📋 找到 ${tables.length} 个表需要清空`)

      // 禁用外键约束
      this.db!.exec('PRAGMA foreign_keys = OFF')

      // 开始事务
      this.db!.exec('BEGIN TRANSACTION')

      try {
        // 删除所有表数据
        for (const table of tables) {
          console.log(`   清空表: ${table.name}`)
          this.db!.prepare(`DELETE FROM ${table.name}`).run()
        }

        // 重置自增ID（不重置，继续累加）
        // 注意：根据需求，自增ID不重置，所以这里不执行 DELETE FROM sqlite_sequence

        // 提交事务
        this.db!.exec('COMMIT')
        console.log(`✅ 所有表数据已清空`)
      } catch (error) {
        // 回滚事务
        this.db!.exec('ROLLBACK')
        throw error
      } finally {
        // 重新启用外键约束
        this.db!.exec('PRAGMA foreign_keys = ON')
      }
    } catch (error: any) {
      console.error(`❌ 清空表失败:`, error)
      throw error
    }
  }

  /**
   * 清空封面和歌词文件
   */
  private clearMediaFiles(): void {
    try {
      const userDataPath = app.getPath('userData')

      // 清空封面目录
      const coversDir = join(userDataPath, 'covers')
      if (existsSync(coversDir)) {
        console.log(`🗑️  清空封面目录: ${coversDir}`)
        const files = readdirSync(coversDir)
        for (const file of files) {
          try {
            unlinkSync(join(coversDir, file))
          } catch (error) {
            console.warn(`   删除封面文件失败: ${file}`, error)
          }
        }
        console.log(`✅ 已删除 ${files.length} 个封面文件`)
      }

      // 清空歌词目录（如果有）
      const lyricsDir = join(userDataPath, 'lyrics')
      if (existsSync(lyricsDir)) {
        console.log(`🗑️  清空歌词目录: ${lyricsDir}`)
        const files = readdirSync(lyricsDir)
        for (const file of files) {
          try {
            unlinkSync(join(coversDir, file))
          } catch (error) {
            console.warn(`   删除歌词文件失败: ${file}`, error)
          }
        }
        console.log(`✅ 已删除 ${files.length} 个歌词文件`)
      }
    } catch (error: any) {
      console.error(`❌ 清空媒体文件失败:`, error)
      // 不抛出错误，允许继续
    }
  }

  // ========== 本地音乐列表 ==========

  /**
   * 检查文件是否已在本地音乐列表中
   */
  isInLocalMusic(filePath: string): boolean {
    const stmt = this.db!.prepare(`
      SELECT COUNT(*) as count FROM local_music WHERE file_path = ?
    `)
    const result = stmt.get(filePath) as { count: number }
    return result.count > 0
  }

  /**
   * 添加音乐到本地音乐列表
   */
  addToLocalMusic(filePath: string): void {
    const filePathMd5 = calculateFilePathMD5(filePath)
    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO local_music (file_path, file_path_md5)
      VALUES (?, ?)
    `)
    stmt.run(filePath, filePathMd5)
  }

  /**
   * 批量添加音乐到本地音乐列表
   */
  addToLocalMusicBatch(items: Array<{ filePath: string; filePathMd5: string }>): void {
    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO local_music (file_path, file_path_md5)
      VALUES (?, ?)
    `)

    const transaction = this.db!.transaction((musicItems: typeof items) => {
      for (const item of musicItems) {
        stmt.run(item.filePath, item.filePathMd5)
      }
    })

    transaction(items)
  }

  /**
   * 从本地音乐列表移除
   */
  removeFromLocalMusic(filePath: string): void {
    const stmt = this.db!.prepare('DELETE FROM local_music WHERE file_path = ?')
    stmt.run(filePath)
  }

  /**
   * 清空本地音乐列表
   */
  clearLocalMusic(): void {
    // 只清空本地音乐列表，不影响 music 主表和其他列表
    this.db!.prepare('DELETE FROM local_music').run()
    // 注意：不重置自增ID，让它继续累加
  }

  /**
   * 清空我喜欢列表
   */
  clearFavorites(): void {
    this.db!.prepare('DELETE FROM favorites').run()
  }

  /**
   * 获取本地音乐总数
   */
  getLocalMusicCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM local_music')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 分页获取本地音乐列表
   */
  getLocalMusicPaginated(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        lm.id as list_id,
        lm.file_path,
        lm.file_path_md5,
        lm.added_at,
        m.*
      FROM local_music lm
      LEFT JOIN music m ON lm.file_path = m.file_path
      ORDER BY lm.id ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  // ========== 发现音乐列表 ==========

  /**
   * 添加到发现音乐列表
   */
  addToDiscoverMusic(filePath: string): void {
    const filePathMd5 = calculateFilePathMD5(filePath)
    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO discover_music (file_path, file_path_md5)
      VALUES (?, ?)
    `)
    stmt.run(filePath, filePathMd5)
  }

  /**
   * 清空发现音乐列表
   */
  clearDiscoverMusic(): void {
    this.db!.prepare('DELETE FROM discover_music').run()
  }

  /**
   * 获取发现音乐总数
   */
  getDiscoverMusicCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM discover_music')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 分页获取发现音乐列表
   */
  getDiscoverMusicPaginated(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        dm.id as list_id,
        dm.file_path,
        dm.file_path_md5,
        dm.discovered_at as added_at,
        m.*
      FROM discover_music dm
      LEFT JOIN music m ON dm.file_path = m.file_path
      ORDER BY dm.discovered_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  // ========== 最近播放列表 ==========

  /**
   * 添加到最近播放列表
   */
  addToRecentPlays(filePath: string): void {
    const filePathMd5 = calculateFilePathMD5(filePath)
    const stmt = this.db!.prepare(`
      INSERT INTO recent_plays (file_path, file_path_md5)
      VALUES (?, ?)
    `)
    stmt.run(filePath, filePathMd5)
  }

  /**
   * 清空最近播放列表
   */
  clearRecentPlays(): void {
    this.db!.prepare('DELETE FROM recent_plays').run()
  }

  /**
   * 获取最近播放总数
   */
  getRecentPlaysCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM recent_plays')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 分页获取最近播放列表
   */
  getRecentPlaysPaginated(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        rp.id as list_id,
        rp.file_path,
        rp.file_path_md5,
        rp.played_at as added_at,
        m.*
      FROM recent_plays rp
      LEFT JOIN music m ON rp.file_path = m.file_path
      ORDER BY rp.played_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  // ========== 播放队列 ==========

  /**
   * 添加到播放队列
   */
  addToPlayQueue(filePath: string, position?: number): void {
    const filePathMd5 = calculateFilePathMD5(filePath)

    if (position === undefined) {
      // 如果没有指定位置，添加到末尾
      const maxPosStmt = this.db!.prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM play_queue')
      const result = maxPosStmt.get() as { max_pos: number }
      position = result.max_pos + 1
    }

    const stmt = this.db!.prepare(`
      INSERT INTO play_queue (file_path, file_path_md5, position)
      VALUES (?, ?, ?)
    `)
    stmt.run(filePath, filePathMd5, position)
  }

  /**
   * 从播放队列移除
   */
  removeFromPlayQueue(filePath: string): void {
    const stmt = this.db!.prepare('DELETE FROM play_queue WHERE file_path = ?')
    stmt.run(filePath)
  }

  /**
   * 检查是否在播放队列中
   */
  isInPlayQueue(filePath: string): boolean {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM play_queue WHERE file_path = ?')
    const result = stmt.get(filePath) as { count: number }
    return result.count > 0
  }

  /**
   * 获取播放队列总数
   */
  getPlayQueueCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM play_queue')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 获取播放队列（按位置排序）
   */
  getPlayQueue(): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        pq.id as list_id,
        pq.file_path,
        pq.file_path_md5,
        pq.position,
        pq.added_at,
        m.*
      FROM play_queue pq
      LEFT JOIN music m ON pq.file_path = m.file_path
      ORDER BY pq.position ASC
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  // ========== 我喜欢列表（更新为分页）==========

  /**
   * 获取我喜欢总数
   */
  getFavoritesCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 分页获取我喜欢列表
   */
  getFavoritesPaginated(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        f.id as list_id,
        f.file_path,
        f.file_path_md5,
        f.added_at,
        m.*
      FROM favorites f
      LEFT JOIN music m ON f.file_path = m.file_path
      WHERE f.file_path IS NOT NULL
      ORDER BY f.added_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  // ========== 歌单列表（更新为分页）==========

  /**
   * 获取歌单歌曲总数
   */
  getPlaylistSongsCount(playlistId: number): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ?')
    const result = stmt.get(playlistId) as { count: number }
    return result.count
  }

  /**
   * 分页获取歌单歌曲列表
   */
  getPlaylistSongsPaginated(playlistId: number, offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        pi.id as list_id,
        pi.file_path,
        pi.file_path_md5,
        pi.position,
        pi.added_at,
        m.*
      FROM playlist_item pi
      LEFT JOIN music m ON pi.file_path = m.file_path
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(playlistId, limit, offset) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  /**
   * 清空歌单
   */
  clearPlaylist(playlistId: number): void {
    this.db!.prepare('DELETE FROM playlist_item WHERE playlist_id = ?').run(playlistId)
  }
}
