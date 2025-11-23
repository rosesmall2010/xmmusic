-- 歌单管理增强字段
-- 用于支持歌单排序、封面设置、描述等功能

-- 添加歌单排序字段
ALTER TABLE playlist ADD COLUMN display_order INTEGER DEFAULT 0;

-- 添加歌单封面路径
ALTER TABLE playlist ADD COLUMN cover_path TEXT;

-- 添加歌单描述
ALTER TABLE playlist ADD COLUMN description TEXT;

-- 更新现有歌单的display_order（按ID顺序）
UPDATE playlist
SET display_order = id
WHERE display_order = 0;
