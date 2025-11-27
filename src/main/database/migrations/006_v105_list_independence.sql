-- v1.0.5 列表独立性架构重构
-- 所有列表完全独立，添加 file_path_md5 字段

-- 1. 创建 local_music 表（本地音乐列表）
CREATE TABLE IF NOT EXISTS local_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_path_md5 TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_music_file_path ON local_music(file_path);
CREATE INDEX IF NOT EXISTS idx_local_music_file_path_md5 ON local_music(file_path_md5);
CREATE INDEX IF NOT EXISTS idx_local_music_added_at ON local_music(added_at DESC);

-- 2. 创建 discover_music 表（发现音乐列表）
CREATE TABLE IF NOT EXISTS discover_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_path_md5 TEXT NOT NULL,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discover_music_file_path ON discover_music(file_path);
CREATE INDEX IF NOT EXISTS idx_discover_music_file_path_md5 ON discover_music(file_path_md5);
CREATE INDEX IF NOT EXISTS idx_discover_music_discovered_at ON discover_music(discovered_at DESC);

-- 3. 更新 favorites 表（添加 file_path_md5 字段）
-- 检查是否已有 file_path_md5 列
-- 如果没有，则添加
ALTER TABLE favorites ADD COLUMN file_path_md5 TEXT;

CREATE INDEX IF NOT EXISTS idx_favorites_file_path_md5 ON favorites(file_path_md5);

-- 4. 创建 recent_plays 表（最近播放列表）
CREATE TABLE IF NOT EXISTS recent_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_path_md5 TEXT NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recent_plays_file_path ON recent_plays(file_path);
CREATE INDEX IF NOT EXISTS idx_recent_plays_file_path_md5 ON recent_plays(file_path_md5);
CREATE INDEX IF NOT EXISTS idx_recent_plays_played_at ON recent_plays(played_at DESC);

-- 5. 更新 playlist_item 表（添加 file_path_md5 字段）
-- 检查是否已有 file_path_md5 列
ALTER TABLE playlist_item ADD COLUMN file_path_md5 TEXT;

CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path_md5 ON playlist_item(file_path_md5);
CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist_position ON playlist_item(playlist_id, position);

-- 6. 创建 play_queue 表（播放队列）
CREATE TABLE IF NOT EXISTS play_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_path_md5 TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_play_queue_file_path ON play_queue(file_path);
CREATE INDEX IF NOT EXISTS idx_play_queue_file_path_md5 ON play_queue(file_path_md5);
CREATE INDEX IF NOT EXISTS idx_play_queue_position ON play_queue(position);

