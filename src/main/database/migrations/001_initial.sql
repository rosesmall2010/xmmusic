-- 音乐表
CREATE TABLE IF NOT EXISTS music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  duration INTEGER,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  cover_path TEXT,
  lyrics_path TEXT,
  play_count INTEGER DEFAULT 0,
  last_played_at DATETIME,
  favorite INTEGER DEFAULT 0,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_corrupted INTEGER DEFAULT 0,
  is_duplicate INTEGER DEFAULT 0
);

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

-- 播放列表表
CREATE TABLE IF NOT EXISTS playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  song_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 播放列表项表（使用 file_path 而不是 music_id，使其独立于音乐库）
CREATE TABLE IF NOT EXISTS playlist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, file_path)
);

-- 播放历史表（使用 file_path 独立存储，不依赖 music 表）
CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- 全文搜索虚拟表 (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS music_fts USING fts5(
  title,
  artist,
  album,
  genre,
  content='music',
  content_rowid='id'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_music_file_hash ON music(file_hash);
CREATE INDEX IF NOT EXISTS idx_music_artist_title ON music(artist, title);
CREATE INDEX IF NOT EXISTS idx_music_genre ON music(genre);
CREATE INDEX IF NOT EXISTS idx_music_favorite ON music(favorite);
CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist ON playlist_item(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path ON playlist_item(file_path);
CREATE INDEX IF NOT EXISTS idx_play_history_file_path ON play_history(file_path);
CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);

-- 触发器：更新 music_fts
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
