import Database from 'better-sqlite3'
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
  private db: Database.Database | null = null

  static getInstance(): MusicDatabase {
    if (!MusicDatabase.instance) {
      MusicDatabase.instance = new MusicDatabase()
    }
    return MusicDatabase.instance
  }

  initialize(dbPath?: string): void {
    const path = dbPath || join(app.getPath('userData'), 'xmmusic.db')
    this.db = new Database(path)

    // 配置优化
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -32000') // 32MB
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 268435456') // 256MB
    this.db.pragma('page_size = 4096')
    this.db.pragma('foreign_keys = ON')

    // 执行迁移
    this.migrate()

    // 创建索引
    this.createIndexes()
  }

  private migrate(): void {
    const migrationPath = join(__dirname, 'migrations', '001_initial.sql')
    if (existsSync(migrationPath)) {
      const sql = readFileSync(migrationPath, 'utf8')
      this.db!.exec(sql)
    }
  }

  private createIndexes(): void {
    // 索引已在迁移文件中创建
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
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
      conditions.push('favorite = ?')
      params.push(criteria.favorite ? 1 : 0)
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

  getSimilarMusic(musicId: number, limit: number = 20): MusicItem[] {
    const target = this.getMusicById(musicId)
    if (!target) {
      return []
    }

    const similarityConditions: string[] = []
    const similarityParams: any[] = []

    if (target.artist) {
      similarityConditions.push('artist = ?')
      similarityParams.push(target.artist)
    }
    if (target.album) {
      similarityConditions.push('album = ?')
      similarityParams.push(target.album)
    }
    if (target.genre) {
      similarityConditions.push('genre = ?')
      similarityParams.push(target.genre)
    }

    if (similarityConditions.length === 0) {
      const directory = dirname(target.filePath)
      similarityConditions.push('file_path LIKE ?')
      similarityParams.push(`${directory}%`)
    }

    const stmt = this.db!.prepare(`
      SELECT m.*,
        (
          (CASE WHEN m.artist = ? THEN 2 ELSE 0 END) +
          (CASE WHEN m.album = ? THEN 1 ELSE 0 END) +
          (CASE WHEN m.genre = ? THEN 1 ELSE 0 END) -
          (ABS(m.duration - ?) / 600.0)
        ) AS score
      FROM music m
      WHERE m.id != ?
        AND m.is_duplicate = 0
        AND (${similarityConditions.join(' OR ')})
      ORDER BY score DESC, ABS(m.duration - ?) ASC, m.play_count DESC
      LIMIT ?
    `)

    const rows = stmt.all(
      target.artist || '',
      target.album || '',
      target.genre || '',
      target.duration || 0,
      target.id,
      ...similarityParams,
      target.duration || 0,
      limit
    ) as any[]

    return rows.map(row => this.mapRowToMusicItem(row))
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

  addToPlaylist(playlistId: number, musicId: number, position?: number): void {
    if (position === undefined) {
      const stmt = this.db!.prepare('SELECT MAX(position) as max_pos FROM playlist_item WHERE playlist_id = ?')
      const result = stmt.get(playlistId) as { max_pos: number | null }
      position = (result.max_pos ?? -1) + 1
    }

    const stmt = this.db!.prepare(`
      INSERT OR IGNORE INTO playlist_item (playlist_id, music_id, position)
      VALUES (?, ?, ?)
    `)
    stmt.run(playlistId, musicId, position)

    // 更新播放列表统计
    this.updatePlaylistStats(playlistId)
  }

  getPlaylistSongs(playlistId: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT m.*
      FROM music m
      JOIN playlist_item pi ON m.id = pi.music_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position
    `)
    const rows = stmt.all(playlistId) as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
  }

  private updatePlaylistStats(playlistId: number): void {
    const stmt = this.db!.prepare(`
      UPDATE playlist SET
        song_count = (SELECT COUNT(*) FROM playlist_item WHERE playlist_id = ?),
        total_duration = (SELECT COALESCE(SUM(duration), 0) FROM music m JOIN playlist_item pi ON m.id = pi.music_id WHERE pi.playlist_id = ?),
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

  toggleFavorite(musicId: number): void {
    const stmt = this.db!.prepare('UPDATE music SET favorite = NOT favorite WHERE id = ?')
    stmt.run(musicId)
  }

  getFavorites(): MusicItem[] {
    const stmt = this.db!.prepare('SELECT * FROM music WHERE favorite = 1 AND is_duplicate = 0 ORDER BY added_at DESC')
    const rows = stmt.all() as any[]
    return rows.map(row => this.mapRowToMusicItem(row))
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

  // ========== 数据库备份 ==========

  async backupDatabase(targetPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const dbPath = this.db.name
    await copyFileAsync(dbPath, targetPath)
  }

  // ========== 辅助方法 ==========

  private mapRowToMusicItem(row: any): MusicItem {
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
      favorite: row.favorite === 1,
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
}
