-- ============================================================================
-- XMMusic v1.0.6 数据库重构迁移脚本
-- ============================================================================
-- 说明：本次迁移为破坏性变更，不进行数据迁移，直接重建数据库结构
-- 数据库名称变更：xm.db/xm-dev.db -> m.db/m-dev.db
-- 核心变更：
--   1. music 表 -> all_music 表
--   2. 新增 music_dir 表（目录表）
--   3. 新增 local_music_dir 表（扫描根目录配置）
--   4. 所有列表表改为使用 music_id 关联（替代 file_path）
-- ============================================================================

-- ============================================================================
-- 第一步：删除旧表（如果存在）
-- ============================================================================

-- 删除全文搜索虚拟表和触发器
DROP TRIGGER IF EXISTS music_fts_insert;
DROP TRIGGER IF EXISTS music_fts_update;
DROP TRIGGER IF EXISTS music_fts_delete;
DROP TABLE IF EXISTS music_fts;

-- 删除列表表
DROP TABLE IF EXISTS discover_music;
DROP TABLE IF EXISTS play_queue;
DROP TABLE IF EXISTS recent_plays;
DROP TABLE IF EXISTS playlist_item;
DROP TABLE IF EXISTS playlist;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS local_music;

-- 删除核心表
DROP TABLE IF EXISTS all_music;
DROP TABLE IF EXISTS music;

-- 删除目录表
DROP TABLE IF EXISTS local_music_dir;
DROP TABLE IF EXISTS music_dir;
DROP TABLE IF EXISTS music_directory;

-- 删除其他表
DROP TABLE IF EXISTS corrupted_files;
DROP TABLE IF EXISTS id3_backup;
DROP TABLE IF EXISTS play_history;
DROP TABLE IF EXISTS search_history;

-- 注意：settings 表保留，用于存储数据库版本等信息

-- ============================================================================
-- 第二步：创建新表结构
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 local_music_dir 表（扫描根目录配置表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_music_dir (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,              -- 扫描根目录完整路径
  display_order INTEGER DEFAULT 0,        -- 显示顺序
  enabled INTEGER DEFAULT 1,              -- 是否启用扫描（1=启用，0=禁用）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_music_dir_order ON local_music_dir(display_order);
CREATE INDEX IF NOT EXISTS idx_local_music_dir_enabled ON local_music_dir(enabled);
CREATE INDEX IF NOT EXISTS idx_local_music_dir_path ON local_music_dir(path);

-- ----------------------------------------------------------------------------
-- 2.2 music_dir 表（音乐目录表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS music_dir (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,              -- 目录完整路径（规范化后）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_music_dir_path ON music_dir(path);

-- ----------------------------------------------------------------------------
-- 2.3 all_music 表（核心音乐表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS all_music (
  -- 主键和路径
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dir_id INTEGER NOT NULL,                -- 目录ID（外键 -> music_dir.id）
  file_name TEXT NOT NULL,                -- 文件名（不含路径）

  -- 元数据
  title TEXT NOT NULL,                    -- 标题
  artist TEXT NOT NULL,                   -- 艺术家
  album TEXT,                             -- 专辑
  year INTEGER,                           -- 年份
  genre TEXT,                             -- 流派

  -- 文件信息
  file_size INTEGER NOT NULL,              -- 文件大小（字节）
  file_hash TEXT NOT NULL,                 -- 文件哈希值（用于去重）
  file_extension TEXT NOT NULL,            -- 文件扩展名（如：mp3, flac）

  -- 音频属性
  duration INTEGER,                        -- 时长（秒）
  bitrate INTEGER,                         -- 比特率（kbps）
  sample_rate INTEGER,                     -- 采样率（Hz）
  channels INTEGER,                        -- 声道数（1=单声道，2=立体声）

  -- 关联资源路径
  cover_path TEXT,                         -- 封面路径（相对路径或完整路径）
  lyrics_path TEXT,                        -- 歌词路径（相对路径或完整路径）

  -- 状态字段
  is_exists INTEGER DEFAULT 1,           -- 文件是否存在（1=存在，0=不存在）
  is_playable INTEGER DEFAULT 1,          -- 是否可以播放（1=可播放，0=不可播放）
  play_error_reason TEXT,                  -- 不能播放的原因

  -- 播放统计
  play_count INTEGER DEFAULT 0,           -- 播放次数
  last_played_at DATETIME,                 -- 最后播放时间

  -- 时间戳
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 标记字段
  is_corrupted INTEGER DEFAULT 0,         -- 是否损坏（1=损坏，0=正常）
  is_duplicate INTEGER DEFAULT 0,         -- 是否重复（1=重复，0=不重复）

  -- 外键约束
  FOREIGN KEY (dir_id) REFERENCES music_dir(id) ON DELETE RESTRICT,

  -- 唯一性约束：同一目录下文件名唯一
  UNIQUE(dir_id, file_name)
);

-- all_music 表索引
CREATE INDEX IF NOT EXISTS idx_all_music_dir_id ON all_music(dir_id);
CREATE INDEX IF NOT EXISTS idx_all_music_dir_file ON all_music(dir_id, file_name);
CREATE INDEX IF NOT EXISTS idx_all_music_exists ON all_music(is_exists);
CREATE INDEX IF NOT EXISTS idx_all_music_playable ON all_music(is_playable);
CREATE INDEX IF NOT EXISTS idx_all_music_corrupted ON all_music(is_corrupted);
CREATE INDEX IF NOT EXISTS idx_all_music_artist_title ON all_music(artist, title);
CREATE INDEX IF NOT EXISTS idx_all_music_album ON all_music(album);
CREATE INDEX IF NOT EXISTS idx_all_music_genre ON all_music(genre);
CREATE INDEX IF NOT EXISTS idx_all_music_file_hash ON all_music(file_hash);
CREATE INDEX IF NOT EXISTS idx_all_music_play_count ON all_music(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_all_music_last_played ON all_music(last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_all_music_added_at ON all_music(added_at DESC);

-- ----------------------------------------------------------------------------
-- 2.4 local_music 表（本地音乐列表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL UNIQUE,       -- 关联 all_music.id
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_music_music_id ON local_music(music_id);
CREATE INDEX IF NOT EXISTS idx_local_music_added_at ON local_music(added_at DESC);

-- ----------------------------------------------------------------------------
-- 2.5 favorites 表（收藏列表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL UNIQUE,       -- 关联 all_music.id
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_music_id ON favorites(music_id);
CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at DESC);

-- ----------------------------------------------------------------------------
-- 2.6 playlist 表（播放列表）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                     -- 歌单名称
  description TEXT,                        -- 描述
  cover_path TEXT,                         -- 封面路径
  display_order INTEGER DEFAULT 0,        -- 显示顺序
  song_count INTEGER DEFAULT 0,           -- 歌曲数量（冗余字段，用于快速查询）
  total_duration INTEGER DEFAULT 0,       -- 总时长（秒，冗余字段）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playlist_display_order ON playlist(display_order);
CREATE INDEX IF NOT EXISTS idx_playlist_created_at ON playlist(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2.7 playlist_item 表（播放列表项）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,           -- 关联 playlist.id
  music_id INTEGER NOT NULL,              -- 关联 all_music.id
  position INTEGER NOT NULL,               -- 排序位置
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, music_id)            -- 同一歌单中不能重复添加同一首歌
);

CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist_id ON playlist_item(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_music_id ON playlist_item(music_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_position ON playlist_item(playlist_id, position);

-- ----------------------------------------------------------------------------
-- 2.8 recent_plays 表（最近播放）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recent_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,              -- 关联 all_music.id
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recent_plays_music_id ON recent_plays(music_id);
CREATE INDEX IF NOT EXISTS idx_recent_plays_played_at ON recent_plays(played_at DESC);

-- ----------------------------------------------------------------------------
-- 2.9 play_queue 表（播放队列）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS play_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,              -- 关联 all_music.id
  position INTEGER NOT NULL,               -- 队列位置
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_play_queue_music_id ON play_queue(music_id);
CREATE INDEX IF NOT EXISTS idx_play_queue_position ON play_queue(position);

-- ----------------------------------------------------------------------------
-- 2.10 discover_music 表（发现音乐）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discover_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL UNIQUE,       -- 关联 all_music.id
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES all_music(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discover_music_music_id ON discover_music(music_id);
CREATE INDEX IF NOT EXISTS idx_discover_music_discovered_at ON discover_music(discovered_at DESC);

-- ----------------------------------------------------------------------------
-- 2.11 settings 表（设置表，如果不存在则创建）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2.12 search_history 表（搜索历史，如果不存在则创建）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  search_type TEXT DEFAULT 'basic',       -- 'basic' 或 'advanced'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);

-- ============================================================================
-- 第三步：创建全文搜索虚拟表和触发器
-- ============================================================================

-- 创建全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS music_fts USING fts5(
  title,
  artist,
  album,
  genre,
  content='all_music',
  content_rowid='id'
);

-- 插入触发器
CREATE TRIGGER IF NOT EXISTS music_fts_insert AFTER INSERT ON all_music BEGIN
  INSERT INTO music_fts(rowid, title, artist, album, genre)
  VALUES (new.id, new.title, new.artist, new.album, new.genre);
END;

-- 更新触发器
CREATE TRIGGER IF NOT EXISTS music_fts_update AFTER UPDATE ON all_music BEGIN
  UPDATE music_fts SET
    title = new.title,
    artist = new.artist,
    album = new.album,
    genre = new.genre
  WHERE rowid = new.id;
END;

-- 删除触发器
CREATE TRIGGER IF NOT EXISTS music_fts_delete AFTER DELETE ON all_music BEGIN
  DELETE FROM music_fts WHERE rowid = old.id;
END;

-- ============================================================================
-- 第四步：初始化数据库版本
-- ============================================================================

INSERT OR REPLACE INTO settings (key, value, updated_at)
VALUES ('db_version', '3', CURRENT_TIMESTAMP);

-- ============================================================================
-- 迁移完成
-- ============================================================================
