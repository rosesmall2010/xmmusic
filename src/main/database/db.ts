import Database from './sqlite3-sync'
import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, existsSync, copyFile } from 'fs'
import { promisify } from 'util'
import type {
  MusicItem,
  Playlist,
  DuplicateGroup,
  AdvancedSearchCriteria
} from '@shared/types/music'

const copyFileAsync = promisify(copyFile)

export default class MusicDatabase {
  private static instance: MusicDatabase
  private db: Database | null = null

  static getInstance(): MusicDatabase {
    if (!MusicDatabase.instance) {
      MusicDatabase.instance = new MusicDatabase()
    }
    return MusicDatabase.instance
  }

  initialize(dbPath?: string): void {
    try {
      // 根据环境变量选择数据库文件名
      const isDev = process.env.NODE_ENV !== 'production'
      const dbFileName = isDev ? 'xmmusic-dev.db' : 'xmmusic.db'
      const path = dbPath || join(app.getPath('userData'), dbFileName)

      console.log(`🌍 运行环境: ${isDev ? '开发环境' : '生产环境'}`)
      console.log(`📂 数据库路径: ${path}`)
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

      // 创建索引
      try {
        this.createIndexes()
        console.log(`✅ 数据库索引创建完成`)
      } catch (indexError: any) {
        console.error(`❌ 数据库索引创建失败: ${indexError?.message || indexError}`)
        throw indexError
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
      throw error
    }
  }

  private migrate(): void {
    // 执行初始迁移
    const migrationPath = join(__dirname, 'migrations', '001_initial.sql')
    if (existsSync(migrationPath)) {
      const sql = readFileSync(migrationPath, 'utf8')
      this.db!.exec(sql)
    }

    // 执行搜索历史迁移
    const searchHistoryPath = join(__dirname, 'migrations', '002_add_search_history.sql')
    if (existsSync(searchHistoryPath)) {
      try {
        const sql = readFileSync(searchHistoryPath, 'utf8')
        this.db!.exec(sql)
      } catch (error) {
        // 表可能已存在，忽略错误
        console.log('Search history migration:', error)
      }
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

  // ========== 音乐操作 ==========

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

  deleteMusic(id: number): void {
    const stmt = this.db!.prepare('DELETE FROM music WHERE id = ?')
    stmt.run(id)
  }

  deleteMusicByPath(filePath: string): void {
    const stmt = this.db!.prepare('DELETE FROM music WHERE file_path = ?')
    stmt.run(filePath)
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
    const stmt = this.db!.prepare('SELECT * FROM playlist ORDER BY created_at DESC')
    const rows = stmt.all() as any[]
    return rows.map(this.mapRowToPlaylist)
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
    // 从播放列表中获取文件路径，然后尝试从 music 表中查找对应的记录
    // 如果 music 表中没有，则创建一个临时的 MusicItem
    const stmt = this.db!.prepare(`
      SELECT pi.file_path, pi.position, pi.added_at
      FROM playlist_item pi
      WHERE pi.playlist_id = ?
      ORDER BY pi.position
    `)
    const playlistItems = stmt.all(playlistId) as Array<{ file_path: string; position: number; added_at: string }>

    return playlistItems.map(item => {
      // 尝试从 music 表中查找
      const musicStmt = this.db!.prepare('SELECT * FROM music WHERE file_path = ?')
      const musicRow = musicStmt.get(item.file_path) as any

      if (musicRow) {
        // 如果找到了，返回完整的 MusicItem
        return this.mapRowToMusicItem(musicRow)
      } else {
        // 如果没找到，创建一个临时的 MusicItem（基于文件路径）
        const path = require('path')
        const fileName = path.basename(item.file_path)
        const ext = path.extname(item.file_path).toLowerCase()

        return {
          id: -1, // 临时ID，表示不在 music 表中
          title: fileName.replace(ext, ''),
          artist: '未知艺术家',
          album: null,
          year: null,
          genre: null,
          filePath: item.file_path,
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
          addedAt: item.added_at,
          updatedAt: item.added_at,
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

  // ========== 收藏和历史 ==========

  toggleFavorite(filePath: string): void {
    // 检查是否已在收藏表中
    const checkStmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites WHERE file_path = ?')
    const result = checkStmt.get(filePath) as { count: number }

    if (result.count > 0) {
      // 如果已收藏，移除
      const deleteStmt = this.db!.prepare('DELETE FROM favorites WHERE file_path = ?')
      deleteStmt.run(filePath)
    } else {
      // 如果未收藏，添加
      const insertStmt = this.db!.prepare('INSERT INTO favorites (file_path) VALUES (?)')
      insertStmt.run(filePath)
    }
  }

  isFileFavorite(filePath: string): boolean {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites WHERE file_path = ?')
    const result = stmt.get(filePath) as { count: number }
    return result.count > 0
  }

  getFavorites(): MusicItem[] {
    // 从收藏表中获取文件路径，然后尝试从 music 表中查找对应的记录
    const stmt = this.db!.prepare(`
      SELECT f.file_path, f.added_at
      FROM favorites f
      ORDER BY f.added_at DESC
    `)
    const favorites = stmt.all() as Array<{ file_path: string; added_at: string }>

    return favorites.map(item => {
      // 尝试从 music 表中查找
      const musicStmt = this.db!.prepare('SELECT * FROM music WHERE file_path = ?')
      const musicRow = musicStmt.get(item.file_path) as any

      if (musicRow) {
        // 如果找到了，返回完整的 MusicItem
        return this.mapRowToMusicItem(musicRow)
      } else {
        // 如果没找到，创建一个临时的 MusicItem（基于文件路径）
        const path = require('path')
        const fileName = path.basename(item.file_path)
        const ext = path.extname(item.file_path).toLowerCase()

        return {
          id: -1, // 临时ID，表示不在 music 表中
          title: fileName.replace(ext, ''),
          artist: '未知艺术家',
          album: null,
          year: null,
          genre: null,
          filePath: item.file_path,
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
          favorite: true, // 标记为收藏
          addedAt: item.added_at,
          updatedAt: item.added_at,
          isCorrupted: false,
          isDuplicate: false
        }
      }
    })
  }

  recordPlay(musicId: number): void {
    // 插入播放历史
    const historyStmt = this.db!.prepare('INSERT INTO play_history (music_id) VALUES (?)')
    historyStmt.run(musicId)

    // 更新播放统计
    const updateStmt = this.db!.prepare(`
      UPDATE music SET
        play_count = play_count + 1,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    updateStmt.run(musicId)
  }

  getPlayHistory(limit: number = 50): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT m.*
      FROM music m
      JOIN play_history ph ON m.id = ph.music_id
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

  // ========== 音乐目录管理 ==========

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
      JOIN music m ON ph.music_id = m.id
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
}
