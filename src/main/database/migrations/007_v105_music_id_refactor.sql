-- v1.0.5 数据库架构重构
-- 核心设计：music表是唯一音乐库，所有列表通过music_id关联
-- 数据库直接重置，不考虑迁移

-- ============================================
-- 1. 核心表：music（音乐文件库）
-- ============================================
-- 这是所有音乐文件的唯一表，包含完整的元数据信息
-- 使用 file_path 作为唯一标识（移除 file_hash 字段）
CREATE TABLE IF NOT EXISTS music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,
  file_path TEXT UNIQUE NOT NULL,  -- 完整路径，唯一标识
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_extension TEXT NOT NULL,
  duration INTEGER,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  cover_path TEXT,
  lyrics_path TEXT,
  play_count INTEGER DEFAULT 0,
  last_played_at DATETIME,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_corrupted INTEGER DEFAULT 0,
  is_duplicate INTEGER DEFAULT 0
);

-- ============================================
-- 2. 列表表：local_music（本地音乐列表）
-- ============================================
-- 通过 music_id 关联 music 表
CREATE TABLE IF NOT EXISTS local_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE(music_id)
);

-- ============================================
-- 3. 列表表：discover_music（发现音乐列表）
-- ============================================
CREATE TABLE IF NOT EXISTS discover_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE(music_id)
);

-- ============================================
-- 4. 列表表：favorites（我喜欢的音乐）
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE(music_id)
);

-- ============================================
-- 5. 列表表：recent_plays（最近播放）
-- ============================================
CREATE TABLE IF NOT EXISTS recent_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE
);

-- ============================================
-- 6. 列表表：playlist（歌单）
-- ============================================
CREATE TABLE IF NOT EXISTS playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  song_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. 列表表：playlist_item（歌单项）
-- ============================================
-- 通过 music_id 关联 music 表
CREATE TABLE IF NOT EXISTS playlist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  music_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, music_id)
);

-- ============================================
-- 8. 列表表：play_queue（播放队列）
-- ============================================
CREATE TABLE IF NOT EXISTS play_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE
);

-- ============================================
-- 9. 其他表（保持不变）
-- ============================================

-- 音乐目录表
CREATE TABLE IF NOT EXISTS music_directory (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT,
  enabled INTEGER DEFAULT 1,
  auto_scan INTEGER DEFAULT 1,
  scan_depth TEXT DEFAULT 'recursive',
  file_types TEXT,
  exclude_paths TEXT,
  priority INTEGER DEFAULT 0,
  song_count INTEGER DEFAULT 0,
  last_scanned_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 播放历史表（保留，用于统计）
CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 损坏文件表
CREATE TABLE IF NOT EXISTS corrupted_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  error TEXT NOT NULL,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved INTEGER DEFAULT 0
);

-- ID3 备份表
CREATE TABLE IF NOT EXISTS id3_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 搜索历史表
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 10. 全文搜索虚拟表 (FTS5)
-- ============================================
CREATE VIRTUAL TABLE IF NOT EXISTS music_fts USING fts5(
  title,
  artist,
  album,
  genre,
  content='music',
  content_rowid='id'
);

-- ============================================
-- 11. 创建索引
-- ============================================

-- music 表索引
CREATE INDEX IF NOT EXISTS idx_music_file_path ON music(file_path);
CREATE INDEX IF NOT EXISTS idx_music_artist_title ON music(artist, title);
CREATE INDEX IF NOT EXISTS idx_music_genre ON music(genre);
CREATE INDEX IF NOT EXISTS idx_music_added_at ON music(added_at DESC);

-- local_music 表索引
CREATE INDEX IF NOT EXISTS idx_local_music_music_id ON local_music(music_id);
CREATE INDEX IF NOT EXISTS idx_local_music_added_at ON local_music(added_at DESC);

-- discover_music 表索引
CREATE INDEX IF NOT EXISTS idx_discover_music_music_id ON discover_music(music_id);
CREATE INDEX IF NOT EXISTS idx_discover_music_discovered_at ON discover_music(discovered_at DESC);

-- favorites 表索引
CREATE INDEX IF NOT EXISTS idx_favorites_music_id ON favorites(music_id);
CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at DESC);

-- recent_plays 表索引
CREATE INDEX IF NOT EXISTS idx_recent_plays_music_id ON recent_plays(music_id);
CREATE INDEX IF NOT EXISTS idx_recent_plays_played_at ON recent_plays(played_at DESC);

-- playlist_item 表索引
CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist_id ON playlist_item(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_music_id ON playlist_item(music_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist_position ON playlist_item(playlist_id, position);

-- play_queue 表索引
CREATE INDEX IF NOT EXISTS idx_play_queue_music_id ON play_queue(music_id);
CREATE INDEX IF NOT EXISTS idx_play_queue_position ON play_queue(position);

-- play_history 表索引
CREATE INDEX IF NOT EXISTS idx_play_history_music_id ON play_history(music_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);

-- ============================================
-- 12. 触发器：更新 music_fts
-- ============================================
CREATE TRIGGER IF NOT EXISTS music_fts_insert AFTER INSERT ON music BEGIN
  INSERT INTO music_fts(rowid, title, artist, album, genre)
  VALUES (new.id, new.title, new.artist, new.album, new.genre);
END;

CREATE TRIGGER IF NOT EXISTS music_fts_update AFTER UPDATE ON music BEGIN
  UPDATE music_fts SET
    title = new.title,
    artist = new.artist,
    album = new.album,
    genre = new.genre
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS music_fts_delete AFTER DELETE ON music BEGIN
  DELETE FROM music_fts WHERE rowid = old.id;
END;
