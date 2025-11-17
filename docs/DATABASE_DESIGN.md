# xmmusic 数据库设计文档

**文档版本**: 1.0
**创建日期**: 2024
**数据库**: SQLite (better-sqlite3)

---

## 📋 目录

1. [数据库概述](#数据库概述)
2. [表结构设计](#表结构设计)
3. [索引设计](#索引设计)
4. [数据关系](#数据关系)
5. [性能优化](#性能优化)

---

## 🗄️ 数据库概述

### 数据库配置

- **数据库引擎**: SQLite 3
- **驱动**: better-sqlite3
- **模式**: WAL (Write-Ahead Logging)
- **字符编码**: UTF-8
- **文件位置**: `{userData}/xmmusic.db`

### 性能配置

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -32000;  -- 32MB
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;  -- 256MB
PRAGMA page_size = 4096;
PRAGMA foreign_keys = ON;
```

---

## 📊 表结构设计

### 1. music 表（音乐信息）

存储所有音乐文件的基本信息和元数据。

```sql
CREATE TABLE music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 基本信息
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,

  -- 文件信息
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,  -- MD5 哈希值
  file_extension TEXT NOT NULL,

  -- 音频技术信息
  duration INTEGER,  -- 秒
  bitrate INTEGER,   -- kbps
  sample_rate INTEGER,  -- Hz
  channels INTEGER,  -- 声道数

  -- 元数据
  cover_path TEXT,
  lyrics_path TEXT,

  -- 统计信息
  play_count INTEGER DEFAULT 0,
  last_played_at DATETIME,
  favorite INTEGER DEFAULT 0,  -- 0/1 布尔值

  -- 时间戳
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 状态
  is_corrupted INTEGER DEFAULT 0,  -- 0/1 是否损坏
  is_duplicate INTEGER DEFAULT 0    -- 0/1 是否为重复文件
);
```

**字段说明**:
- `file_hash`: MD5 哈希值，用于去重
- `is_corrupted`: 标记损坏文件
- `is_duplicate`: 标记重复文件（非代表文件）

---

### 2. music_directory 表（音乐目录）

存储监控的音乐目录信息。

```sql
CREATE TABLE music_directory (
  id TEXT PRIMARY KEY,  -- UUID
  path TEXT UNIQUE NOT NULL,
  name TEXT,

  -- 配置
  enabled INTEGER DEFAULT 1,  -- 0/1 是否启用
  auto_scan INTEGER DEFAULT 1,  -- 0/1 是否自动监控
  scan_depth TEXT DEFAULT 'recursive',  -- 'current' | 'recursive'

  -- 文件类型过滤（JSON 数组）
  file_types TEXT,  -- JSON: ["mp3", "flac", ...]

  -- 排除路径（JSON 数组）
  exclude_paths TEXT,  -- JSON: ["path1", "path2", ...]

  -- 优先级
  priority INTEGER DEFAULT 0,

  -- 统计信息
  song_count INTEGER DEFAULT 0,
  last_scanned_at DATETIME,

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**约束**: 最多 10 个目录（应用层限制）

---

### 3. playlist 表（播放列表）

存储播放列表信息。

```sql
CREATE TABLE playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,

  -- 统计信息
  song_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,  -- 秒

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_played_at DATETIME
);
```

**说明**: 播放列表数量无限制

---

### 4. playlist_item 表（播放列表关联）

存储播放列表与音乐的关联关系。

```sql
CREATE TABLE playlist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  music_id INTEGER NOT NULL,
  position INTEGER NOT NULL,  -- 排序位置

  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, music_id)
);
```

---

### 5. play_history 表（播放历史）

存储播放历史记录。

```sql
CREATE TABLE play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE
);
```

---

### 6. corrupted_file 表（损坏文件）

存储损坏文件信息。

```sql
CREATE TABLE corrupted_file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  error_reason TEXT,  -- 错误原因
  error_code TEXT,     -- 错误代码

  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_resolved INTEGER DEFAULT 0,  -- 0/1 是否已处理

  FOREIGN KEY (file_path) REFERENCES music(file_path) ON DELETE CASCADE
);
```

---

### 7. id3_backup 表（ID3 修复备份）

存储 ID3 修复前的文件备份记录。

```sql
CREATE TABLE id3_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_file_path TEXT NOT NULL,
  backup_file_path TEXT NOT NULL,
  backup_reason TEXT,  -- 备份原因（ID3修复）

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (original_file_path) REFERENCES music(file_path) ON DELETE CASCADE
);
```

---

### 8. database_backup 表（数据库备份记录）

存储数据库备份历史。

```sql
CREATE TABLE database_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_file_path TEXT NOT NULL,
  backup_size INTEGER,  -- 字节
  backup_type TEXT,     -- 'manual' | 'auto'

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);
```

---

### 9. settings 表（设置）

存储应用设置。

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,  -- JSON 字符串
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**常用设置键**:
- `ui.theme`: 主题（'light' | 'dark' | 'system'）
- `ui.language`: 语言（'zh' | 'en'）
- `audio.volume`: 默认音量（0-100）
- `audio.playMode`: 默认播放模式
- `library.autoScan`: 自动扫描（0/1）
- `backup.id3BackupPath`: ID3 备份路径

---

## 🔍 索引设计

### 主键索引

所有表都有主键，自动创建索引。

### 复合索引

```sql
-- music 表索引
CREATE INDEX idx_music_artist_title ON music(artist, title);
CREATE INDEX idx_music_album_year ON music(album, year);
CREATE INDEX idx_music_genre ON music(genre);
CREATE INDEX idx_music_favorite ON music(favorite);
CREATE INDEX idx_music_last_played ON music(last_played_at DESC);
CREATE INDEX idx_music_added_at ON music(added_at DESC);
CREATE INDEX idx_music_file_hash ON music(file_hash);  -- 去重关键索引
CREATE INDEX idx_music_corrupted ON music(is_corrupted);
CREATE INDEX idx_music_duplicate ON music(is_duplicate);

-- playlist_item 表索引
CREATE INDEX idx_playlist_item_playlist ON playlist_item(playlist_id, position);
CREATE INDEX idx_playlist_item_music ON playlist_item(music_id);

-- play_history 表索引
CREATE INDEX idx_play_history_music ON play_history(music_id);
CREATE INDEX idx_play_history_time ON play_history(played_at DESC);

-- corrupted_file 表索引
CREATE INDEX idx_corrupted_resolved ON corrupted_file(is_resolved);
```

### 全文搜索索引（FTS5）

```sql
-- 全文搜索虚拟表
CREATE VIRTUAL TABLE music_fts USING fts5(
  title,
  artist,
  album,
  genre,
  content='music',
  content_rowid='id'
);

-- 触发器：同步更新 FTS 索引
CREATE TRIGGER music_fts_insert AFTER INSERT ON music BEGIN
  INSERT INTO music_fts(rowid, title, artist, album, genre)
  VALUES (new.id, new.title, new.artist, new.album, new.genre);
END;

CREATE TRIGGER music_fts_delete AFTER DELETE ON music BEGIN
  DELETE FROM music_fts WHERE rowid = old.id;
END;

CREATE TRIGGER music_fts_update AFTER UPDATE ON music BEGIN
  UPDATE music_fts SET
    title = new.title,
    artist = new.artist,
    album = new.album,
    genre = new.genre
  WHERE rowid = new.id;
END;
```

---

## 🔗 数据关系

### ER 图（简化）

```
music (1) ──< (N) playlist_item (N) >── (1) playlist
  │
  │ (1)
  │
  └──< (N) play_history

music_directory (1) ──< (N) music [通过 file_path 关联]

music (1) ──< (N) id3_backup [通过 file_path 关联]

music (1) ──< (1) corrupted_file [通过 file_path 关联]
```

---

## ⚡ 性能优化

### 1. 查询优化

**分页查询**:
```sql
-- 使用 LIMIT 和 OFFSET
SELECT * FROM music
ORDER BY added_at DESC
LIMIT 50 OFFSET 0;
```

**全文搜索**:
```sql
-- 使用 FTS5
SELECT m.*, rank
FROM music_fts fts
JOIN music m ON m.id = fts.rowid
WHERE music_fts MATCH ?
ORDER BY rank
LIMIT 50;
```

**去重查询**:
```sql
-- 查找重复文件组
SELECT file_hash, COUNT(*) as count
FROM music
WHERE file_hash IS NOT NULL
GROUP BY file_hash
HAVING COUNT(*) > 1;
```

### 2. 批量操作

**批量插入**:
```typescript
const insert = db.prepare('INSERT INTO music (...) VALUES (...)');
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insert.run(item);
  }
});
insertMany(musicList);
```

### 3. 数据库维护

**VACUUM**: 定期清理数据库
```sql
VACUUM;
```

**ANALYZE**: 更新统计信息
```sql
ANALYZE;
```

---

## 📝 数据库迁移

### 版本管理

使用版本号管理数据库结构变更。

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 迁移脚本示例

```typescript
// migrations/001_initial_schema.ts
export function up(db: Database) {
  db.exec(`
    CREATE TABLE music (...);
    CREATE TABLE playlist (...);
    -- ... 其他表
  `);
}

export function down(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS music;
    DROP TABLE IF EXISTS playlist;
    -- ... 其他表
  `);
}
```

---

## 🔒 数据备份与恢复

### 备份策略

1. **手动备份**: 用户手动触发
2. **自动备份**: 关键操作前自动备份（可选）
3. **备份位置**: 用户指定目录

### 备份实现

```typescript
async function backupDatabase(db: Database, backupPath: string) {
  // 使用 SQLite 备份 API
  const backup = db.backup(backupPath);
  await backup.step(-1);  // 备份所有页
  backup.finish();
}
```

---

## 📊 数据统计查询

### 常用统计查询

```sql
-- 音乐总数
SELECT COUNT(*) FROM music;

-- 按流派统计
SELECT genre, COUNT(*) as count
FROM music
WHERE genre IS NOT NULL
GROUP BY genre
ORDER BY count DESC;

-- 播放次数统计
SELECT
  artist,
  COUNT(*) as song_count,
  SUM(play_count) as total_plays
FROM music
GROUP BY artist
ORDER BY total_plays DESC
LIMIT 10;
```

---

**文档状态**: ✅ 已完成
**下一步**: UI 设计和开发计划
