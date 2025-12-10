/**
 * 数据库版本控制
 *
 * 版本号规则：
 * - 使用纯数字版本号
 * - 人工控制，不与 package.json 对应
 * - 版本不匹配时，数据库将被清空并重建
 */

/**
 * 当前数据库版本
 *
 * 修改此版本号时，数据库将自动清空并重建
 *
 * 版本历史：
 * - 1: 初始版本（v1.0.4及之前）
 * - 2: v1.0.5 架构重构版本
 *   - 列表完全独立性
 *   - 所有列表表添加 file_path_md5 字段
 *   - 新增 local_music, discover_music, recent_plays, play_queue 表
 * - 3: v1.0.6 数据库重构版本
 *   - music 表 -> all_music 表
 *   - 新增 music_dir 表（目录表）
 *   - 新增 local_music_dir 表（扫描根目录配置）
 *   - 所有列表表改为使用 music_id 关联（替代 file_path）
 *   - 数据库文件名变更：xm.db -> m.db
 */
export const DB_VERSION = 3

/**
 * 数据库版本设置键名
 */
export const DB_VERSION_KEY = 'db_version'
