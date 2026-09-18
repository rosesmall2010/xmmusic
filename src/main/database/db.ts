import Database from './sqlite3-sync'
import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, existsSync, copyFile, unlinkSync, readdirSync, access, accessSync, constants } from 'fs'
import { promisify } from 'util'
import { createHash } from 'crypto'
import type {
  MusicItem,
  Playlist,
  AdvancedSearchCriteria
} from '@shared/types/music'
import { DB_VERSION, DB_VERSION_KEY } from './dbver'
import { normalizePath, getOrCreateMusicDir, batchGetOrCreateMusicDir, buildPathFromMusicRecord, parsePath } from './pathUtils'
import {
  buildSearchPinyinFields,
  classifySearchQuery,
  escapeFtsQuery
} from '../../shared/utils/pinyinSearch'

const dbname: string = 'm4'
const dbnameDev: string = dbname +'-dev'

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
      // 注意：main.ts 中已经设置了开发模式的 userData 路径（添加了 -dev 后缀）
      // 所以这里直接使用 app.getPath('userData') 即可
      const isDev = process.env.NODE_ENV !== 'production'
      const dbFileName = isDev ? dbnameDev + '.db' : dbname + '.db'
      const path = dbPath || join(app.getPath('userData'), dbFileName)

      // 调试：输出数据库路径信息
      console.log(`📂 userData 路径: ${app.getPath('userData')}`)
      console.log(`📂 数据库文件路径: ${path}`)

      console.log(`🌍 运行环境: ${isDev ? '开发环境' : '生产环境'}`)
      console.log(`📂 数据库路径: ${path}`)
      console.log(`📂 数据库文件是否存在: ${existsSync(path)}`)

      // 如果数据库文件已存在，先检查版本（避免不必要的删除）
      if (existsSync(path) && !skipVersionCheck) {
        try {
          const tempDb = new Database(path)
          // 检查表是否存在
          const tables = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
          const hasSettingsTable = tables.some(t => t.name === 'settings')
          const hasLocalMusicDirTable = tables.some(t => t.name === 'local_music_dir')

          if (!hasSettingsTable || !hasLocalMusicDirTable) {
            // 表不存在，说明数据库结构不完整，删除重建
            console.warn(`⚠️  数据库结构不完整（缺少必要表），删除数据库文件...`)
            tempDb.close()
            unlinkSync(path)
            console.log(`✅ 已删除不完整的数据库文件`)
          } else {
            // 尝试读取版本号
            const versionStmt = tempDb.prepare('SELECT value FROM settings WHERE key = ?')
            const versionResult = versionStmt.get(DB_VERSION_KEY) as { value: string } | undefined
            tempDb.close()

            if (versionResult && parseInt(versionResult.value) !== DB_VERSION) {
              // 版本不匹配，删除数据库文件
              console.warn(`⚠️  数据库版本不匹配（当前: ${versionResult.value}, 需要: ${DB_VERSION}），删除旧数据库文件...`)
              unlinkSync(path)
              console.log(`✅ 已删除旧数据库文件`)
            } else if (!versionResult) {
              // 没有版本信息，删除重建
              console.warn(`⚠️  数据库缺少版本信息，删除数据库文件...`)
              unlinkSync(path)
              console.log(`✅ 已删除缺少版本信息的数据库文件`)
            }
          }
        } catch (checkError: any) {
          // 如果读取失败（可能是旧版本数据库或损坏），删除文件
          console.warn(`⚠️  无法读取数据库（${checkError?.message || '未知错误'}），删除数据库文件...`)
          try {
            unlinkSync(path)
            console.log(`✅ 已删除无法读取的数据库文件`)
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
          const dbFileName = isDev ? dbnameDev + '.db' : dbname + '.db'
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
    // v1.0.6 数据库重构：只在数据库不存在或版本不匹配时执行迁移脚本
    // 检查数据库是否已经初始化（通过检查表是否存在）
    try {
      const tables = this.db!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      const hasSettingsTable = tables.some(t => t.name === 'settings')
      const hasLocalMusicDirTable = tables.some(t => t.name === 'local_music_dir')
      const hasAllMusicTable = tables.some(t => t.name === 'all_music')

      // 检查版本号
      let needsMigration = false
      if (hasSettingsTable) {
        try {
          const versionStmt = this.db!.prepare('SELECT value FROM settings WHERE key = ?')
          const versionResult = versionStmt.get(DB_VERSION_KEY) as { value: string } | undefined
          if (!versionResult || parseInt(versionResult.value) !== DB_VERSION) {
            console.log(`📦 数据库版本不匹配，需要迁移（当前: ${versionResult?.value || '无'}, 需要: ${DB_VERSION}）`)
            needsMigration = true
          } else {
            console.log(`✅ 数据库版本正确（${DB_VERSION}），跳过迁移`)
          }
        } catch (e) {
          console.warn('⚠️  无法读取版本号，需要迁移')
          needsMigration = true
        }
      } else {
        console.log('📦 数据库未初始化，需要迁移')
        needsMigration = true
      }

      // 检查表结构是否完整
      if (!needsMigration && (!hasLocalMusicDirTable || !hasAllMusicTable)) {
        console.log('📦 数据库表结构不完整，需要迁移')
        needsMigration = true
      }

      // 只有在需要时才执行迁移
      if (needsMigration) {
        const v106MigrationPath = join(__dirname, 'migrations', '007_v106_db_restructure.sql')
        console.log(`🔍 检查迁移文件路径: ${v106MigrationPath}`)
        console.log(`🔍 迁移文件是否存在: ${existsSync(v106MigrationPath)}`)

        if (existsSync(v106MigrationPath)) {
          console.log('📦 执行 v1.0.6 数据库重构迁移...')
          const sql = readFileSync(v106MigrationPath, 'utf8')
          console.log(`📄 迁移脚本大小: ${sql.length} 字符`)

          // 执行迁移脚本
          this.db!.exec(sql)
          console.log('✅ v1.0.6 数据库重构迁移完成')

          // 验证表是否创建成功
          const newTables = this.db!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
          console.log(`📊 数据库表列表: ${newTables.map(t => t.name).join(', ')}`)

          // 检查关键表是否存在
          const requiredTables = ['local_music_dir', 'music_dir', 'all_music', 'settings']
          const missingTables = requiredTables.filter(table => !newTables.some(t => t.name === table))

          if (missingTables.length > 0) {
            console.error(`❌ 缺少必要的表: ${missingTables.join(', ')}`)
            throw new Error(`数据库迁移失败：缺少必要的表 ${missingTables.join(', ')}`)
          } else {
            console.log('✅ 所有必要的表都已创建')
          }
        } else {
          console.error(`❌ v1.0.6 迁移脚本未找到: ${v106MigrationPath}`)
          console.warn('⚠️  尝试查找迁移文件...')
          // 尝试其他可能的路径
          const altPath = join(process.cwd(), 'src', 'main', 'database', 'migrations', '007_v106_db_restructure.sql')
          if (existsSync(altPath)) {
            console.log(`📦 找到备用路径，执行迁移: ${altPath}`)
            const sql = readFileSync(altPath, 'utf8')
            this.db!.exec(sql)
            console.log('✅ v1.0.6 数据库重构迁移完成（使用备用路径）')
          } else {
            throw new Error(`无法找到迁移脚本文件: ${v106MigrationPath} 或 ${altPath}`)
          }
        }
      }
      // 幂等补列：旧库（DB_VERSION=3，all_music 建表时未含该列）在此 ALTER 补上。
      // SQLite 的 ADD COLUMN 无 IF NOT EXISTS，靠 PRAGMA table_info 先探测是否已有；
      // 新库由 007 建表语句自带该列，探测到即跳过。若表尚不存在（理论上迁移已建好，
      // 此处仅为防御）则跳过，交由后续流程处理，避免对不存在的表 ALTER 抛错。
      const allMusicCols = this.db!.prepare(`PRAGMA table_info(all_music)`).all() as Array<{ name: string }>
      if (allMusicCols.length > 0 && !allMusicCols.some((c) => c.name === 'lyrics_offset')) {
        this.db!.exec(`ALTER TABLE all_music ADD COLUMN lyrics_offset INTEGER NOT NULL DEFAULT 0`)
        console.log('✅ 已为 all_music 表补充 lyrics_offset 列')
      }

      // 拼音/声母搜索预计算列（方案 A）
      const colsAfterLyrics = this.db!.prepare(`PRAGMA table_info(all_music)`).all() as Array<{ name: string }>
      if (colsAfterLyrics.length > 0 && !colsAfterLyrics.some((c) => c.name === 'search_pinyin')) {
        this.db!.exec(`ALTER TABLE all_music ADD COLUMN search_pinyin TEXT NOT NULL DEFAULT ''`)
        console.log('✅ 已为 all_music 表补充 search_pinyin 列')
      }
      if (colsAfterLyrics.length > 0 && !colsAfterLyrics.some((c) => c.name === 'search_initials')) {
        this.db!.exec(`ALTER TABLE all_music ADD COLUMN search_initials TEXT NOT NULL DEFAULT ''`)
        console.log('✅ 已为 all_music 表补充 search_initials 列')
      }
      this.db!.exec(
        `CREATE INDEX IF NOT EXISTS idx_all_music_search_pinyin ON all_music(search_pinyin)`
      )
      this.db!.exec(
        `CREATE INDEX IF NOT EXISTS idx_all_music_search_initials ON all_music(search_initials)`
      )
      // 列已存在但回填中断时仍须续跑（backfill 仅处理空列行，可幂等）
      if (colsAfterLyrics.length > 0) {
        const needsPinyinBackfill = this.db!.prepare(
          `SELECT 1 AS n FROM all_music WHERE search_pinyin = '' OR search_initials = '' LIMIT 1`
        ).get() as { n: number } | undefined
        if (needsPinyinBackfill) {
          this.backfillSearchPinyinColumns()
        }
      }

    } catch (error: any) {
      console.error('❌ v1.0.6 数据库迁移失败:', error)
      console.error('错误详情:', error.message)
      if (error.stack) {
        console.error('错误堆栈:', error.stack)
      }
      throw error
    }

  }

  private createIndexes(): void {
    // 索引已在迁移文件中创建
  }

  /** 回填存量曲库的拼音/声母预计算列 */
  private backfillSearchPinyinColumns(): void {
    if (!this.db) return
    console.log('📦 开始回填拼音搜索列…')
    const select = this.db.prepare(
      `SELECT id, title, artist, album, file_name
       FROM all_music
       WHERE search_pinyin = '' OR search_initials = ''
       LIMIT ?`
    )
    const update = this.db.prepare(
      'UPDATE all_music SET search_pinyin = ?, search_initials = ? WHERE id = ?'
    )
    const batch = this.db.transaction((items: Array<{ id: number; title: string; artist: string; album: string | null; file_name: string }>) => {
      for (const row of items) {
        const { searchPinyin, searchInitials } = buildSearchPinyinFields(
          row.title,
          row.artist,
          row.album,
          row.file_name
        )
        update.run(searchPinyin, searchInitials, row.id)
      }
    })
    // 分批回填，避免大库一次性 UPDATE 阻塞主进程过久
    const pageSize = 500
    let total = 0
    while (true) {
      const rows = select.all(pageSize) as Array<{
        id: number
        title: string
        artist: string
        album: string | null
        file_name: string
      }>
      if (rows.length === 0) break
      batch(rows)
      total += rows.length
      if (rows.length < pageSize) break
    }
    console.log(`✅ 拼音搜索列回填完成，共 ${total} 条`)
  }

  /** 更新单条记录的拼音预计算列 */
  private refreshSearchPinyinForMusic(id: number): void {
    if (!this.db) return
    const row = this.db
      .prepare('SELECT title, artist, album, file_name FROM all_music WHERE id = ?')
      .get(id) as { title: string; artist: string; album: string | null; file_name: string } | undefined
    if (!row) return
    const { searchPinyin, searchInitials } = buildSearchPinyinFields(
      row.title,
      row.artist,
      row.album,
      row.file_name
    )
    this.db
      .prepare('UPDATE all_music SET search_pinyin = ?, search_initials = ? WHERE id = ?')
      .run(searchPinyin, searchInitials, id)
  }

  /** 将搜索 SQL 行映射为 MusicItem */
  private mapSearchResultRows(rows: any[]): MusicItem[] {
    return rows.map((row) => {
      const fullPath = buildPathFromMusicRecord(
        this.db!,
        { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path },
        process.platform
      )
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return musicItem as MusicItem
    })
  }

  /** FTS5 原文搜索 */
  private searchMusicFts(query: string, limit: number): MusicItem[] {
    const ftsQuery = escapeFtsQuery(query)
    if (!ftsQuery) return []

    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM music_fts fts
      JOIN all_music am ON am.id = fts.rowid
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      WHERE am.is_duplicate = 0
        AND music_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)
    const rows = stmt.all(`${ftsQuery}*`, limit) as any[]
    return this.mapSearchResultRows(rows)
  }

  /** 拼音/声母旁路搜索 */
  private searchMusicPinyin(query: string, limit: number): MusicItem[] {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      WHERE am.is_duplicate = 0
        AND (
          am.search_pinyin LIKE ?
          OR am.search_initials LIKE ?
        )
      LIMIT ?
    `)
    // 前缀匹配（而非两端通配），让 idx_all_music_search_pinyin/search_initials 索引生效
    const prefix = `${q}%`
    const rows = stmt.all(prefix, prefix, limit) as any[]
    return this.mapSearchResultRows(rows)
  }

  /** LIKE 原文回退（含 file_name） */
  private searchMusicLike(query: string, limit: number): MusicItem[] {
    const likeQuery = `%${query.trim()}%`
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      WHERE am.is_duplicate = 0
        AND (
          am.title LIKE ?
          OR am.artist LIKE ?
          OR am.album LIKE ?
          OR am.file_name LIKE ?
        )
      LIMIT ?
    `)
    const rows = stmt.all(likeQuery, likeQuery, likeQuery, likeQuery, limit) as any[]
    return this.mapSearchResultRows(rows)
  }

  close(): void {
    if (this.db) {
      try {
        // 在关闭前执行 WAL checkpoint，确保所有数据都写入主数据库文件
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)')
          console.log('✅ WAL checkpoint 完成，数据已同步到主数据库文件')
        } catch (checkpointError: any) {
          console.warn('⚠️  WAL checkpoint 失败:', checkpointError?.message || checkpointError)
        }
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
   * 在一个事务里执行一批写操作（供扫描等场景批量提交，避免逐条隐式事务）
   */
  runInTransaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized')
    return this.db.transaction(fn)()
  }

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
    const { searchPinyin, searchInitials } = buildSearchPinyinFields(
      data.title,
      data.artist,
      data.album,
      data.file_name
    )

    const stmt = this.db!.prepare(`
      INSERT INTO all_music (
        dir_id, file_name, title, artist, album, year, genre,
        file_size, file_hash, file_extension,
        duration, bitrate, sample_rate, channels,
        cover_path, lyrics_path,
        is_exists, is_playable, play_error_reason,
        play_count, last_played_at,
        is_corrupted, is_duplicate,
        search_pinyin, search_initials
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.is_duplicate || 0,
      searchPinyin,
      searchInitials
    )

    const insertedId = Number(result.lastInsertRowid)

    // better-sqlite3 是同步的，数据应该立即写入 WAL
    // checkpoint 会在扫描过程中定期执行，以及扫描完成后统一执行

    return insertedId
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
    const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)

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

    const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)

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
    lyrics_offset: number
    file_size: number
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
    if (updates.lyrics_offset !== undefined) {
      fields.push('lyrics_offset = ?')
      values.push(updates.lyrics_offset)
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

    if (
      updates.title !== undefined ||
      updates.artist !== undefined ||
      updates.album !== undefined
    ) {
      this.refreshSearchPinyinForMusic(id)
    }
  }

  /**
   * 删除音乐记录
   */
  deleteAllMusic(id: number): void {
    const stmt = this.db!.prepare('DELETE FROM all_music WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 清理本地音乐中磁盘文件已不存在的记录，并同步清理所有关联数据：
   * local_music / favorites / playlist_item / recent_plays / play_queue / discover_music / all_music（FTS 由触发器同步），
   * 最后重算受影响歌单的 song_count / total_duration。
   * 大列表按批处理 IN 参数，避免触及 SQLite 变量上限。
   */
  cleanupMissingLocalMusic(): {
    checked: number
    removed: number
    playlistsUpdated: number
    related: {
      localMusic: number
      favorites: number
      playlistItems: number
      recentPlays: number
      playQueue: number
      discover: number
    }
    /** 扫描根目录本身不可达（外置盘未挂载等），这些曲目跳过不删 */
    skippedUnreachable: number
    /** 路径存在但无读取权限等，跳过不删 */
    skippedInaccessible: number
  } {
    if (!this.db) {
      throw new Error('数据库未初始化')
    }

    /** 单批 IN 参数上限（留余量，低于 SQLite 默认 ~32766） */
    const IN_CHUNK = 500

    const emptyRelated = {
      localMusic: 0,
      favorites: 0,
      playlistItems: 0,
      recentPlays: 0,
      playQueue: 0,
      discover: 0
    }

    const rows = this.db.prepare(`
      SELECT am.id, am.dir_id, am.file_name
      FROM local_music lm
      JOIN all_music am ON lm.music_id = am.id
    `).all() as Array<{ id: number; dir_id: number; file_name: string }>

    const missingIds: number[] = []
    let skippedUnreachable = 0
    let skippedInaccessible = 0
    /** dir_id → 扫描根是否可达；不可达则整目录跳过，避免离线盘误删 */
    const dirReachable = new Map<number, boolean>()

    const isDirReachable = (dirId: number): boolean => {
      const cached = dirReachable.get(dirId)
      if (cached !== undefined) return cached
      let ok = false
      try {
        const dir = this.db!.prepare('SELECT path FROM music_dir WHERE id = ?').get(dirId) as
          | { path: string }
          | undefined
        if (dir?.path) {
          accessSync(dir.path, constants.F_OK)
          ok = true
        }
      } catch {
        ok = false
      }
      dirReachable.set(dirId, ok)
      return ok
    }

    for (const row of rows) {
      if (!isDirReachable(row.dir_id)) {
        skippedUnreachable++
        continue
      }
      let fullPath = ''
      try {
        fullPath = buildPathFromMusicRecord(
          this.db,
          { dir_id: row.dir_id, file_name: row.file_name },
          process.platform
        )
      } catch {
        // 目录记录异常：不删，计入不可达
        skippedUnreachable++
        continue
      }
      if (!fullPath) {
        skippedUnreachable++
        continue
      }
      try {
        accessSync(fullPath, constants.F_OK)
      } catch (e: any) {
        const code = e?.code
        if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
          skippedInaccessible++
          continue
        }
        missingIds.push(row.id)
      }
    }

    if (missingIds.length === 0) {
      return {
        checked: rows.length,
        removed: 0,
        playlistsUpdated: 0,
        related: emptyRelated,
        skippedUnreachable,
        skippedInaccessible
      }
    }

    const chunkIds = (ids: number[]) => {
      const chunks: number[][] = []
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        chunks.push(ids.slice(i, i + IN_CHUNK))
      }
      return chunks
    }

    const countRelatedChunked = (table: string, ids: number[]) => {
      let total = 0
      for (const chunk of chunkIds(ids)) {
        const ph = chunk.map(() => '?').join(',')
        const r = this.db!.prepare(
          `SELECT COUNT(*) as c FROM ${table} WHERE music_id IN (${ph})`
        ).get(...chunk) as { c: number }
        total += r.c
      }
      return total
    }

    const related = {
      localMusic: countRelatedChunked('local_music', missingIds),
      favorites: countRelatedChunked('favorites', missingIds),
      playlistItems: countRelatedChunked('playlist_item', missingIds),
      recentPlays: countRelatedChunked('recent_plays', missingIds),
      playQueue: countRelatedChunked('play_queue', missingIds),
      discover: countRelatedChunked('discover_music', missingIds)
    }

    const affectedPlaylistSet = new Set<number>()
    for (const chunk of chunkIds(missingIds)) {
      const ph = chunk.map(() => '?').join(',')
      const rowsPl = this.db.prepare(`
        SELECT DISTINCT playlist_id as id
        FROM playlist_item
        WHERE music_id IN (${ph})
      `).all(...chunk) as Array<{ id: number }>
      for (const r of rowsPl) affectedPlaylistSet.add(r.id)
    }
    const affectedPlaylists = Array.from(affectedPlaylistSet)

    const tx = this.db.transaction((ids: number[]) => {
      for (const chunk of chunkIds(ids)) {
        const ph = chunk.map(() => '?').join(',')
        // 显式清理关联表（不单靠 FK CASCADE，避免 pragma 异常时残留）
        this.db!.prepare(`DELETE FROM playlist_item WHERE music_id IN (${ph})`).run(...chunk)
        this.db!.prepare(`DELETE FROM favorites WHERE music_id IN (${ph})`).run(...chunk)
        this.db!.prepare(`DELETE FROM recent_plays WHERE music_id IN (${ph})`).run(...chunk)
        this.db!.prepare(`DELETE FROM play_queue WHERE music_id IN (${ph})`).run(...chunk)
        this.db!.prepare(`DELETE FROM discover_music WHERE music_id IN (${ph})`).run(...chunk)
        this.db!.prepare(`DELETE FROM local_music WHERE music_id IN (${ph})`).run(...chunk)
        // 删除主记录（触发器同步 music_fts）
        this.db!.prepare(`DELETE FROM all_music WHERE id IN (${ph})`).run(...chunk)
      }

      for (const playlistId of affectedPlaylists) {
        this.updatePlaylistStats(playlistId)
      }
    })
    tx(missingIds)

    return {
      checked: rows.length,
      removed: missingIds.length,
      playlistsUpdated: affectedPlaylists.length,
      related,
      skippedUnreachable,
      skippedInaccessible
    }
  }

  /**
   * 从给定的 id 列表里筛出仍存在于 all_music 的那些
   * 用于渲染端播放队列（持久化在 localStorage，跟库的生命周期无关）恢复时校验
   * 分批 IN，避免超大队列触及 SQLite 变量上限
   */
  getExistingMusicIds(ids: number[]): number[] {
    if (ids.length === 0) return []
    const CHUNK = 500
    const found: number[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = this.db!.prepare(`SELECT id FROM all_music WHERE id IN (${placeholders})`).all(
        ...chunk
      ) as Array<{ id: number }>
      for (const r of rows) found.push(r.id)
    }
    return found
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
      lyricsOffset: row.lyrics_offset || 0,
      playCount: row.play_count || 0,
      lastPlayedAt: row.last_played_at,
      favorite: false, // 需要从 favorites 表查询
      addedAt: row.added_at,
      updatedAt: row.updated_at,
      isCorrupted: row.is_corrupted === 1,
      isDuplicate: row.is_duplicate === 1,
      isPlayable: row.is_playable !== undefined ? row.is_playable === 1 : true, // 默认为可播放
      isExists: row.is_exists !== undefined ? row.is_exists === 1 : true, // 默认为存在
      playErrorReason: row.play_error_reason || null,
      fullPath
    }
  }

  // ========== 兼容包装：委托到 all_music ==========

  /** 按 id 更新曲目元数据（委托 updateAllMusic） */
  updateMusic(id: number, updates: Partial<MusicItem>): void {
    this.updateAllMusic(id, {
      title: updates.title,
      artist: updates.artist,
      album: updates.album,
      year: updates.year,
      genre: updates.genre,
      cover_path: updates.coverPath,
      lyrics_path: updates.lyricsPath,
      play_count: updates.playCount,
      last_played_at: updates.lastPlayedAt
    })
  }

  /** 按路径更新曲目元数据 */
  updateMusicByPath(filePath: string, updates: Partial<MusicItem>): void {
    const music = this.getAllMusicByPath(filePath)
    if (!music) return
    this.updateMusic(music.id, updates)
  }

  /**
   * @deprecated 使用 getAllMusicById() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getMusicById(id: number): MusicItem | null {
    const result = this.getAllMusicById(id)
    if (!result) return null
    // 移除 fullPath 属性，返回标准的 MusicItem
    const { fullPath, ...musicItem } = result
    return musicItem as MusicItem
  }

  /**
   * @deprecated 使用 getAllMusicByPath() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getMusicByPath(filePath: string): MusicItem | null {
    const result = this.getAllMusicByPath(filePath)
    if (!result) return null
    // 移除 fullPath 属性，返回标准的 MusicItem
    const { fullPath, ...musicItem } = result
    return musicItem as MusicItem
  }

  /**
   * @deprecated 使用 getLocalMusicPaginated() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getMusicList(offset: number, limit: number): MusicItem[] {
    // 使用新的基于 music_id 的方法
    return this.getLocalMusicPaginated(offset, limit)
  }

  getMusicTotalCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM all_music WHERE is_duplicate = 0')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 统计无歌词（或歌词文件已丢失）的歌曲数
   * 空路径用 SQL；路径失效需回磁盘核对
   */
  getMusicWithoutLyricsCount(): number {
    const emptyStmt = this.db!.prepare(`
      SELECT COUNT(*) as count FROM all_music
      WHERE is_duplicate = 0
        AND (lyrics_path IS NULL OR lyrics_path = '')
    `)
    let count = (emptyStmt.get() as { count: number }).count

    // 有路径但文件已丢的，也算待匹配
    const pageSize = 200
    let offset = 0
    while (true) {
      const page = this.getMusicWithClaimedLyricsPath(offset, pageSize)
      if (page.length === 0) break
      for (const m of page) {
        if (m.lyricsPath && !existsSync(m.lyricsPath)) count++
      }
      offset += page.length
      if (page.length < pageSize) break
    }
    return count
  }

  /**
   * 分页取无歌词歌曲（lyrics_path 为空）
   */
  getMusicWithoutLyrics(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT am.*, md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.is_duplicate = 0
        AND (am.lyrics_path IS NULL OR am.lyrics_path = '')
      ORDER BY am.id ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      return musicItem as MusicItem
    })
  }

  /**
   * 分页取「声称有歌词路径」的歌曲（用于筛出路径失效的孤儿记录）
   */
  getMusicWithClaimedLyricsPath(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT am.*, md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.is_duplicate = 0
        AND am.lyrics_path IS NOT NULL
        AND am.lyrics_path != ''
      ORDER BY am.id ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      return musicItem as MusicItem
    })
  }

  /**
   * 统计无有效封面（空路径或封面文件已丢失）的歌曲数
   */
  getMusicWithoutCoverCount(): number {
    const emptyStmt = this.db!.prepare(`
      SELECT COUNT(*) as count FROM all_music
      WHERE is_duplicate = 0
        AND is_exists = 1
        AND (cover_path IS NULL OR cover_path = '')
    `)
    let count = (emptyStmt.get() as { count: number }).count

    const pageSize = 200
    let offset = 0
    while (true) {
      const page = this.getMusicWithClaimedCoverPath(offset, pageSize)
      if (page.length === 0) break
      for (const m of page) {
        if (m.coverPath && !existsSync(m.coverPath)) count++
      }
      offset += page.length
      if (page.length < pageSize) break
    }
    return count
  }

  /** 分页取无封面歌曲（cover_path 为空） */
  getMusicWithoutCover(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT am.*, md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.is_duplicate = 0
        AND am.is_exists = 1
        AND (am.cover_path IS NULL OR am.cover_path = '')
      ORDER BY am.id ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      return musicItem as MusicItem
    })
  }

  /** 分页取「声称有封面路径」的歌曲（筛路径失效） */
  getMusicWithClaimedCoverPath(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT am.*, md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.is_duplicate = 0
        AND am.is_exists = 1
        AND am.cover_path IS NOT NULL
        AND am.cover_path != ''
      ORDER BY am.id ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      return musicItem as MusicItem
    })
  }

  /**
   * 统一搜索入口：按 query 分流后合并去重
   * - pinyin：仅走预计算拼音/声母列
   * - fts：仅走 FTS5；失败回退 LIKE
   * - mixed：FTS → 拼音 → LIKE，按 id 去重直至 limit
   */
  searchMusic(query: string, limit: number = 50): MusicItem[] {
    if (!query || query.trim() === '') {
      return []
    }

    const mode = classifySearchQuery(query)
    const merged = new Map<number, MusicItem>()

    const append = (items: MusicItem[]) => {
      for (const item of items) {
        if (!merged.has(item.id)) merged.set(item.id, item)
        if (merged.size >= limit) break
      }
    }

    if (mode === 'fts' || mode === 'mixed') {
      try {
        append(this.searchMusicFts(query, limit))
      } catch (error) {
        console.error('FTS 搜索失败，回退 LIKE:', error)
        append(this.searchMusicLike(query, limit))
      }
    }

    if ((mode === 'pinyin' || mode === 'mixed') && merged.size < limit) {
      append(this.searchMusicPinyin(query, limit))
    }

    if (mode === 'mixed' && merged.size < limit) {
      append(this.searchMusicLike(query, limit))
    }

    return Array.from(merged.values()).slice(0, limit)
  }

  advancedSearch(criteria: AdvancedSearchCriteria): MusicItem[] {
    const conditions: string[] = ['am.is_duplicate = 0']
    const params: any[] = []

    if (criteria.keyword) {
      const like = `%${criteria.keyword.trim()}%`
      conditions.push('(am.title LIKE ? OR am.artist LIKE ? OR am.album LIKE ? OR am.file_name LIKE ?)')
      params.push(like, like, like, like)
    }

    if (criteria.artist) {
      conditions.push('am.artist LIKE ?')
      params.push(`%${criteria.artist.trim()}%`)
    }

    if (criteria.album) {
      conditions.push('am.album LIKE ?')
      params.push(`%${criteria.album.trim()}%`)
    }

    if (criteria.genre) {
      conditions.push('am.genre LIKE ?')
      params.push(`%${criteria.genre.trim()}%`)
    }

    if (criteria.favorite !== undefined) {
      // 使用独立的收藏表进行过滤（基于 music_id）
      if (criteria.favorite) {
        conditions.push('am.id IN (SELECT music_id FROM favorites)')
      } else {
        conditions.push('am.id NOT IN (SELECT music_id FROM favorites)')
      }
    }

    if (criteria.directory) {
      // 使用 music_dir 表进行目录过滤
      const dirPattern = `${criteria.directory.replace(/%/g, '\\%')}%`
      conditions.push('md.path LIKE ?')
      params.push(dirPattern)
    }

    if (criteria.fileExtension) {
      conditions.push('am.file_extension = ?')
      params.push(criteria.fileExtension.toLowerCase())
    }

    if (criteria.minDuration !== undefined) {
      conditions.push('am.duration >= ?')
      params.push(criteria.minDuration)
    }

    if (criteria.maxDuration !== undefined) {
      conditions.push('am.duration <= ?')
      params.push(criteria.maxDuration)
    }

    if (criteria.yearFrom !== undefined) {
      conditions.push('(am.year IS NOT NULL AND am.year >= ?)')
      params.push(criteria.yearFrom)
    }

    if (criteria.yearTo !== undefined) {
      conditions.push('(am.year IS NOT NULL AND am.year <= ?)')
      params.push(criteria.yearTo)
    }

    const sortFieldMap: Record<string, string> = {
      addedAt: 'am.added_at',
      title: 'am.title',
      duration: 'am.duration',
      playCount: 'am.play_count'
    }
    const sortField = sortFieldMap[criteria.sortBy || 'addedAt']
    const sortOrder = criteria.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const limit = criteria.limit && criteria.limit > 0 ? criteria.limit : 200

    // 使用 all_music 表和 music_dir 表进行查询（包含收藏和队列状态）
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ?
    `)
    const rows = stmt.all(...params, limit) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return musicItem as MusicItem
    })
  }

  getMusicByHash(hash: string): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.file_hash = ?
    `)
    const rows = stmt.all(hash) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      return this.mapAllMusicRowToMusicItem(row, fullPath)
    })
  }

  getMusicByGenre(genre: string): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path
      FROM all_music am
      JOIN music_dir md ON am.dir_id = md.id
      WHERE am.genre = ? AND am.is_duplicate = 0
      ORDER BY am.title
    `)
    const rows = stmt.all(genre) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      return this.mapAllMusicRowToMusicItem(row, fullPath)
    })
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

  /**
   * @deprecated 使用 addToPlaylistByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  addToPlaylist(playlistId: number, filePath: string, position?: number): void {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      console.warn(`无法找到文件: ${filePath}`)
      return
    }
    // 使用新的基于 music_id 的方法
    this.addToPlaylistByMusicId(playlistId, music.id, position)
  }

  /**
   * @deprecated 使用 getPlaylistSongsByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getPlaylistSongs(playlistId: number): MusicItem[] {
    // 使用新的基于 music_id 的方法
    const songs = this.getPlaylistSongsByMusicId(playlistId)
    return songs.map(item => {
      const { fullPath, position, ...musicItem } = item
      return musicItem as MusicItem
    })
  }

  /**
   * @deprecated 使用基于 music_id 的方法替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  isFileInPlaylist(filePath: string, playlistId?: number): boolean {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      return false
    }
    // 使用新的基于 music_id 的方法
    if (playlistId !== undefined) {
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ? AND music_id = ?')
      const result = stmt.get(playlistId, music.id) as { count: number }
      return result.count > 0
    } else {
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM playlist_item WHERE music_id = ?')
      const result = stmt.get(music.id) as { count: number }
      return result.count > 0
    }
  }

  /**
   * @deprecated 使用基于 music_id 的方法替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getPlaylistsForFile(filePath: string): number[] {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      return []
    }
    // 使用新的基于 music_id 的方法
    const stmt = this.db!.prepare('SELECT DISTINCT playlist_id FROM playlist_item WHERE music_id = ?')
    const rows = stmt.all(music.id) as Array<{ playlist_id: number }>
    return rows.map(row => row.playlist_id)
  }

  /**
   * @deprecated 使用 removeFromPlaylistByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  removeFromPlaylistByPath(playlistId: number, filePath: string): void {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      console.warn(`无法找到文件: ${filePath}`)
      return
    }
    // 使用新的基于 music_id 的方法
    this.removeFromPlaylistByMusicId(playlistId, music.id)
  }

  private updatePlaylistStats(playlistId: number): void {
    // 更新播放列表统计（v1.0.6 使用 music_id）
    const stmt = this.db!.prepare(`
      UPDATE playlist SET
        song_count = (SELECT COUNT(*) FROM playlist_item WHERE playlist_id = ?),
        total_duration = (
          SELECT COALESCE(SUM(am.duration), 0)
          FROM playlist_item pi
          JOIN all_music am ON pi.music_id = am.id
          WHERE pi.playlist_id = ?
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(playlistId, playlistId, playlistId)
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
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
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
        md.path as dir_path,
        1 as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM favorites f
      JOIN all_music am ON f.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      ORDER BY f.added_at DESC
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return { ...musicItem, fullPath } as MusicItem & { fullPath: string }
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
    // 更新播放列表统计
    this.updatePlaylistStats(playlistId)
  }

  removeFromPlaylistByMusicId(playlistId: number, musicId: number): void {
    const stmt = this.db!.prepare('DELETE FROM playlist_item WHERE playlist_id = ? AND music_id = ?')
    stmt.run(playlistId, musicId)
    // 更新播放列表统计
    this.updatePlaylistStats(playlistId)
  }

  /**
   * 获取歌单内已有封面路径的歌曲（轻量字段，用于设置封面候选分页扫描）
   * @param limit 本批条数
   * @param offset SQL OFFSET
   */
  getPlaylistSongsWithCoverPath(
    playlistId: number,
    limit: number = 200,
    offset: number = 0
  ): Array<{ id: number; title: string; artist: string; coverPath: string }> {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 200, 500))
    const safeOffset = Math.max(0, Math.floor(offset) || 0)
    const stmt = this.db!.prepare(`
      SELECT
        am.id,
        am.title,
        am.artist,
        am.cover_path
      FROM playlist_item pi
      JOIN all_music am ON pi.music_id = am.id
      WHERE pi.playlist_id = ?
        AND am.cover_path IS NOT NULL
        AND TRIM(am.cover_path) != ''
      ORDER BY pi.position ASC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(playlistId, safeLimit, safeOffset) as Array<{
      id: number
      title: string
      artist: string
      cover_path: string
    }>
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      coverPath: row.cover_path
    }))
  }

  getPlaylistSongsByMusicId(playlistId: number): Array<MusicItem & { fullPath: string; position: number }> {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        pi.position,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM playlist_item pi
      JOIN all_music am ON pi.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
    `)
    const rows = stmt.all(playlistId) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return {
        ...musicItem,
        fullPath,
        position: row.position
      } as MusicItem & { fullPath: string; position: number }
    })
  }

  /**
   * recent_plays 表操作（基于 music_id）
   * 同一首歌只保留一条记录：再次播放时删除旧记录并重新插入，使其置顶
   */
  addToRecentPlaysByMusicId(musicId: number): void {
    const deleteStmt = this.db!.prepare('DELETE FROM recent_plays WHERE music_id = ?')
    const insertStmt = this.db!.prepare('INSERT INTO recent_plays (music_id) VALUES (?)')
    // SQLite 要求 DELETE ... NOT IN (SELECT ...) 再套一层，避免同表修改限制
    const limitStmt = this.db!.prepare(`
      DELETE FROM recent_plays
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM recent_plays
          ORDER BY played_at DESC, id DESC
          LIMIT 1000
        )
      )
    `)

    const tx = this.db!.transaction((id: number) => {
      deleteStmt.run(id)
      insertStmt.run(id)
      // 清理其他歌曲的历史重复记录，并限制总量
      this.dedupeRecentPlays()
      limitStmt.run()
    })
    tx(musicId)
  }

  /**
   * 清理 recent_plays 中同一 music_id 的历史重复记录，只保留最新一条
   */
  dedupeRecentPlays(): void {
    const stmt = this.db!.prepare(`
      DELETE FROM recent_plays
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT MAX(id) as id
          FROM recent_plays
          GROUP BY music_id
        )
      )
    `)
    stmt.run()
  }

  getRecentPlaysByMusicId(limit: number = 1000): Array<MusicItem & { fullPath: string; playedAt: string }> {
    // 按 music_id 只取最新一条，避免历史重复记录导致列表出现重复项/虚拟滚动 key 冲突
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        rp.played_at,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM recent_plays rp
      JOIN (
        SELECT music_id, MAX(id) AS max_id
        FROM recent_plays
        GROUP BY music_id
      ) latest ON rp.id = latest.max_id
      JOIN all_music am ON rp.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      ORDER BY rp.played_at DESC, rp.id DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return {
        ...musicItem,
        fullPath,
        playedAt: row.played_at
      } as MusicItem & { fullPath: string; playedAt: string }
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
        pq.position,
        1 as in_queue,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
      FROM play_queue pq
      JOIN all_music am ON pq.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      ORDER BY pq.position ASC
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return {
        ...musicItem,
        fullPath,
        position: row.position
      } as MusicItem & { fullPath: string; position: number }
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
        dm.discovered_at,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM discover_music dm
      JOIN all_music am ON dm.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      ORDER BY dm.discovered_at DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return {
        ...musicItem,
        fullPath,
        discoveredAt: row.discovered_at
      } as MusicItem & { fullPath: string; discoveredAt: string }
    })
  }

  // ========== 收藏和历史（旧版，保留兼容，后续将废弃） ==========

  /**
   * @deprecated 使用 toggleFavoriteByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  toggleFavorite(filePath: string): void {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      console.warn(`无法找到文件: ${filePath}`)
      return
    }
    // 使用新的基于 music_id 的方法
    if (this.isFavoriteByMusicId(music.id)) {
      this.removeFromFavoritesByMusicId(music.id)
    } else {
      this.addToFavoritesByMusicId(music.id)
    }
  }

  /**
   * @deprecated 使用 isFavoriteByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  isFileFavorite(filePath: string): boolean {
    // 先根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (!music) {
      return false
    }
    // 使用新的基于 music_id 的方法
    return this.isFavoriteByMusicId(music.id)
  }

  /**
   * @deprecated 使用 getFavoritesByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getFavorites(): MusicItem[] {
    // 使用新的基于 music_id 的方法
    return this.getFavoritesByMusicId()
  }

  /**
   * @deprecated 使用 recordPlayByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  recordPlay(filePath: string): void {
    // 尝试根据 file_path 查找 music_id
    const music = this.getAllMusicByPath(filePath)
    if (music) {
      // 使用新的基于 music_id 的方法
      this.addToRecentPlaysByMusicId(music.id)
      // 更新播放统计
      this.updateAllMusic(music.id, {
        play_count: (music.playCount || 0) + 1,
        last_played_at: new Date().toISOString()
      })
    }
  }

  /**
   * @deprecated 使用 getRecentPlaysByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getPlayHistory(limit: number = 50): MusicItem[] {
    // 使用新的基于 music_id 的方法
    return this.getRecentPlaysByMusicId(limit)
  }

  clearPlayHistory(): void {
    // 清空 recent_plays 表（v1.0.6 新架构）
    const stmt = this.db!.prepare('DELETE FROM recent_plays')
    stmt.run()
    // 重置所有音乐的播放次数和最后播放时间
    const resetStmt = this.db!.prepare('UPDATE all_music SET play_count = 0, last_played_at = NULL')
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
    const insertedId = result.lastInsertRowid as number

    console.log(`✅ 已插入 local_music_dir 记录: id=${insertedId}, path=${normalizedPath}`)

    // 确保数据立即写入（WAL 模式下可能需要 checkpoint）
    // better-sqlite3 是同步的，数据应该立即写入，但为了确保，我们可以显式 checkpoint
    try {
      this.db!.pragma('wal_checkpoint(TRUNCATE)')
      console.log(`✅ WAL checkpoint 完成，数据已同步到主数据库文件`)

      // 验证数据是否真的写入
      const verify = this.db!.prepare('SELECT id, path FROM local_music_dir WHERE id = ?').get(insertedId)
      if (verify) {
        console.log(`✅ 验证成功：数据已写入数据库`)
      } else {
        console.error(`❌ 验证失败：数据未找到！`)
      }
    } catch (e: any) {
      console.error('⚠️  checkpoint 错误:', e?.message || e)
    }

    return this.getLocalMusicDirById(insertedId)!
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

    const sortAllow = new Set(['display_order', 'created_at', 'path'])
    const orderAllow = new Set(['ASC', 'DESC'])
    const sortBy = options?.sortBy && sortAllow.has(options.sortBy) ? options.sortBy : 'display_order'
    const orderRaw = (options?.order || 'ASC').toUpperCase()
    const order = orderAllow.has(orderRaw) ? orderRaw : 'ASC'
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
      const trimmed = query.trim()
      if (!trimmed) return

      // 同关键词先删后插，保证置顶且不堆积重复
      this.db.prepare(`
        DELETE FROM search_history WHERE query = ?
      `).run(trimmed)

      // v1.0.6 新架构：search_history 表只有 query、search_type、created_at 列
      // criteria 信息不再单独存储（如果需要可以序列化到 query 中）
      const stmt = this.db.prepare(`
        INSERT INTO search_history (query, search_type)
        VALUES (?, ?)
      `)
      stmt.run(trimmed, searchType)

      // 只保留最近 10 条历史记录
      const deleteStmt = this.db.prepare(`
        DELETE FROM search_history
        WHERE id NOT IN (
          SELECT id FROM search_history
          ORDER BY created_at DESC, id DESC
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
      // 清理历史污染：程序化 advancedSearch（如发现页最近添加）曾写入无意义的「高级搜索」
      this.db.prepare(`
        DELETE FROM search_history
        WHERE query = '高级搜索' AND search_type = 'advanced'
      `).run()

      // 按关键词去重，取最近一次时间
      const stmt = this.db.prepare(`
        SELECT query, search_type, MAX(created_at) AS created_at, MAX(id) AS max_id
        FROM search_history
        GROUP BY query
        ORDER BY created_at DESC, max_id DESC
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

  /** 搜索建议：UNION 歌名/歌手/专辑命中项，拼音 query 同时查预计算列 */
  getSearchSuggestions(query: string, limit: number = 5): string[] {
    if (!this.db || !query || query.trim() === '') return []

    try {
      const q = query.trim()
      const likeQuery = `%${q}%`
      const pinyinQuery = `%${q.toLowerCase()}%`
      const mode = classifySearchQuery(q)

      const whereParts = ['am.title LIKE ?', 'am.artist LIKE ?', 'am.album LIKE ?']
      const params: any[] = [likeQuery, likeQuery, likeQuery]
      if (mode === 'pinyin' || mode === 'mixed') {
        whereParts.push('am.search_pinyin LIKE ?', 'am.search_initials LIKE ?')
        params.push(pinyinQuery, pinyinQuery)
      }

      const stmt = this.db.prepare(
        `SELECT suggestion FROM (
           SELECT am.title AS suggestion
           FROM local_music lm
           JOIN all_music am ON lm.music_id = am.id
           WHERE am.is_duplicate = 0
             AND (${whereParts.join(' OR ')})
           UNION ALL
           SELECT am.artist AS suggestion
           FROM local_music lm
           JOIN all_music am ON lm.music_id = am.id
           WHERE am.is_duplicate = 0
             AND (${whereParts.join(' OR ')})
           UNION ALL
           SELECT am.album AS suggestion
           FROM local_music lm
           JOIN all_music am ON lm.music_id = am.id
           WHERE am.is_duplicate = 0
             AND am.album IS NOT NULL
             AND (${whereParts.join(' OR ')})
         ) t
         WHERE suggestion IS NOT NULL AND suggestion != ''
         LIMIT ?`
      )
      const rows = stmt.all(...params, ...params, ...params, limit * 6) as Array<{ suggestion: string }>

      const seen = new Set<string>()
      const suggestions: string[] = []
      for (const row of rows) {
        const s = row.suggestion?.trim()
        if (!s || seen.has(s)) continue
        seen.add(s)
        suggestions.push(s)
        if (suggestions.length >= limit) break
      }
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
        lyricsOffset: 0,
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
      lyricsOffset: row.lyrics_offset || 0,
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
            unlinkSync(join(lyricsDir, file))
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
   * 清空数据库中除 settings、本地目录配置以外的全部表数据
   * （保留主题/语言/均衡器等设置，以及用户配置的扫描根目录）
   */
  clearAllExceptSettings(): void {
    if (!this.db) {
      throw new Error('数据库未初始化')
    }

    // 配置目录：local_music_dir（用户添加的扫描根目录）；旧表 music_directory 一并保留
    const preserve = new Set(['settings', 'local_music_dir', 'music_directory'])

    const tables = this.db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string; sql: string | null }>

    /** FTS5 影子表不可直接 DELETE（会报 may not be modified） */
    const isFtsShadowTable = (name: string) =>
      /_fts_(data|idx|content|docsize|config)$/i.test(name)

    /** 虚拟表（如 music_fts）：由内容表删除触发器同步，或事后 rebuild */
    const isVirtualTable = (sql: string | null) =>
      !!sql && /create\s+virtual\s+table/i.test(sql)

    const toClear = tables.filter(
      (t) => !preserve.has(t.name) && !isFtsShadowTable(t.name) && !isVirtualTable(t.sql)
    )
    const ftsVirtual = tables.filter(
      (t) => !preserve.has(t.name) && isVirtualTable(t.sql)
    )

    console.log(
      `🗑️  清除所有（保留 settings + 配置目录），共 ${toClear.length} 张普通表` +
        (ftsVirtual.length ? `、${ftsVirtual.length} 个 FTS 虚拟表` : '')
    )

    this.db.exec('PRAGMA foreign_keys = OFF')
    try {
      const tx = this.db.transaction(() => {
        for (const table of toClear) {
          this.db!.prepare(`DELETE FROM "${table.name}"`).run()
          console.log(`   已清空: ${table.name}`)
        }

        // 外部内容 FTS：内容表已删后 rebuild，避免残留索引；勿直接 DELETE 影子表
        for (const fts of ftsVirtual) {
          try {
            this.db!.prepare(
              `INSERT INTO "${fts.name}"("${fts.name}") VALUES('rebuild')`
            ).run()
            console.log(`   已重建 FTS: ${fts.name}`)
          } catch (error) {
            console.warn(`   重建 FTS ${fts.name} 失败（可忽略）:`, error)
          }
        }
      })
      tx()
      console.log('✅ 除 settings / 配置目录外的表数据已清空')
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON')
    }

    // 设置里可能存了播放队列/进度等运行时状态，一并清掉，避免重启后又灌回空库
    const playbackKeys = [
      'playQueue',
      'currentQueueIndex',
      'playPosition',
      'wasPlaying',
      'currentMusic'
    ]
    for (const key of playbackKeys) {
      try {
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
      } catch {
        // ignore
      }
    }
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
   * 获取歌曲在本地音乐列表中的下标（0 起，与 getLocalMusicPaginated 排序一致：added_at DESC, music_id DESC）
   */
  getLocalMusicIndexByMusicId(musicId: number): number | null {
    if (!this.isInLocalMusicByMusicId(musicId)) return null

    const targetStmt = this.db!.prepare('SELECT added_at FROM local_music WHERE music_id = ?')
    const target = targetStmt.get(musicId) as { added_at: string } | undefined
    if (!target) return null

    const indexStmt = this.db!.prepare(`
      SELECT COUNT(*) as count FROM local_music lm
      WHERE lm.added_at > ?
         OR (lm.added_at = ? AND lm.music_id > ?)
    `)
    const result = indexStmt.get(target.added_at, target.added_at, musicId) as { count: number }
    return result.count
  }

  /**
   * 分页获取本地音乐列表（v1.0.6 使用 music_id，包含收藏和队列状态）
   */
  getLocalMusicPaginated(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT
        am.*,
        md.path as dir_path,
        CASE WHEN f.music_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
        CASE WHEN pq.music_id IS NOT NULL THEN 1 ELSE 0 END as in_queue
      FROM local_music lm
      JOIN all_music am ON lm.music_id = am.id
      JOIN music_dir md ON am.dir_id = md.id
      LEFT JOIN favorites f ON am.id = f.music_id
      LEFT JOIN play_queue pq ON am.id = pq.music_id
      ORDER BY lm.added_at DESC, lm.music_id DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(row => {
      const fullPath = buildPathFromMusicRecord(this.db!, { dir_id: row.dir_id, file_name: row.file_name, dir_path: row.dir_path }, process.platform)
      const { fullPath: _, ...musicItem } = this.mapAllMusicRowToMusicItem(row, fullPath)
      // 添加收藏和队列状态
      musicItem.favorite = row.is_favorite === 1
      musicItem.inQueue = row.in_queue === 1
      return musicItem as MusicItem
    })
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
    const stmt = this.db!.prepare('SELECT COUNT(DISTINCT music_id) as count FROM recent_plays')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 分页获取最近播放列表
   */
  /**
   * @deprecated 使用 getRecentPlaysByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getRecentPlaysPaginated(offset: number, limit: number): MusicItem[] {
    // 使用新的基于 music_id 的方法，然后分页
    const allPlays = this.getRecentPlaysByMusicId(1000) // 获取足够多的记录
    return allPlays.slice(offset, offset + limit)
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
  /**
   * @deprecated 使用 getFavoritesByMusicId() 替代（v1.0.6 新架构）
   * 保留此方法以兼容旧代码
   */
  getFavoritesPaginated(offset: number, limit: number): MusicItem[] {
    // 使用新的基于 music_id 的方法，然后分页
    const allFavorites = this.getFavoritesByMusicId()
    return allFavorites.slice(offset, offset + limit)
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
   * 分页获取歌单歌曲列表（v1.0.6 使用 music_id，包含收藏和队列状态）
   * @deprecated 使用 getPlaylistSongsByMusicId() 替代，此方法保留兼容性
   */
  getPlaylistSongsPaginated(playlistId: number, offset: number, limit: number): MusicItem[] {
    // 使用新的基于 music_id 的方法，然后分页
    const allSongs = this.getPlaylistSongsByMusicId(playlistId)
    return allSongs.slice(offset, offset + limit).map(item => {
      const { fullPath, position, ...musicItem } = item
      return musicItem as MusicItem
    })
  }

  /**
   * 清空歌单
   */
  clearPlaylist(playlistId: number): void {
    this.db!.prepare('DELETE FROM playlist_item WHERE playlist_id = ?').run(playlistId)
  }
}
