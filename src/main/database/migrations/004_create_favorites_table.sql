-- 创建独立的收藏表（基于文件路径）
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_favorites_file_path ON favorites(file_path);
CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at DESC);

-- 迁移现有收藏数据（从 music 表的 favorite 字段）
INSERT INTO favorites (file_path, added_at)
SELECT file_path, added_at
FROM music
WHERE favorite = 1
ON CONFLICT(file_path) DO NOTHING;
