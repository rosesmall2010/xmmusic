# XMMusic v1.0.5 系统架构设计文档

**文档版本**: v1.0.5  
**创建日期**: 2025-01-XX  
**架构师**: Winston  
**项目版本**: 1.0.5  

---

## 📋 目录

1. [架构概述](#架构概述)
2. [技术栈](#技术栈)
3. [系统架构设计](#系统架构设计)
4. [数据库架构设计](#数据库架构设计)
5. [API 架构设计](#api-架构设计)
6. [前端架构设计](#前端架构设计)
7. [数据流设计](#数据流设计)
8. [关键设计决策](#关键设计决策)
9. [性能优化策略](#性能优化策略)

---

## 🏗️ 架构概述

### 架构类型

**桌面应用架构** - Electron 多进程架构

XMMusic 是基于 Electron 的跨平台本地音乐播放器，采用主进程 + 渲染进程的架构模式，无传统后端服务器。界面风格遵循仿 QQ 音乐设计，功能范围仅限于本地音乐管理。

### 核心架构原则

1. **列表完全独立性** - 所有列表（本地音乐、发现音乐、我喜欢、最近播放、歌单、播放队列）完全独立存储和操作
2. **基于文件路径的标识** - 使用文件完整路径的 MD5 作为唯一标识，实时计算
3. **数据库版本控制** - 版本不匹配时清空重建，不执行数据迁移
4. **纯本地功能** - 不包含任何在线音乐功能

### 架构层次

```
┌─────────────────────────────────────────────────────────┐
│              用户界面层 (UI Layer)                       │
│  Vue 3 + Composition API + Pinia + Vue Router          │
│  - 仿 QQ 音乐界面风格                                     │
│  - 组件化开发                                            │
│  - 虚拟滚动优化                                          │
└─────────────────────────────────────────────────────────┘
                          ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────────────┐
│            IPC 通信层 (IPC Layer)                        │
│  Preload Script (contextBridge)                         │
│  - 安全的 API 暴露                                       │
│  - 类型安全接口                                          │
└─────────────────────────────────────────────────────────┘
                          ↕ IPC (ipcMain/ipcRenderer)
┌─────────────────────────────────────────────────────────┐
│              业务逻辑层 (Business Layer)                 │
│  Main Process Services (Node.js)                        │
│  - FileScanner: 文件扫描和元数据提取                     │
│  - MusicDatabase: 数据库操作（单例模式）                 │
│  - MetadataEditor: 标签编辑                              │
│  - FileMonitor: 文件监控                                 │
│  - 其他服务层组件                                        │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│              数据访问层 (Data Layer)                     │
│  SQLite Database (better-sqlite3)                       │
│  - 版本控制机制 (dbver.ts)                               │
│  - WAL 模式                                              │
│  - 独立列表表结构                                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              文件系统层 (File System Layer)              │
│  - 本地音乐文件                                          │
│  - 封面图片缓存                                          │
│  - 歌词文件                                              │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ 技术栈

### 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 39.2.1 | 跨平台桌面应用框架 |
| Vue 3 | 3.5.24 | 前端框架（Composition API） |
| TypeScript | 5.9.3 | 类型安全 |
| Vite | 7.2.2 | 构建工具 |

### 状态管理与路由

| 技术 | 版本 | 用途 |
|------|------|------|
| Pinia | 3.0.4 | 状态管理 |
| Vue Router | 4.4.5 | 路由管理 |

### 音频与媒体

| 技术 | 版本 | 用途 |
|------|------|------|
| Howler.js | 2.2.4 | 音频播放引擎 |
| music-metadata | 11.10.1 | 音频元数据提取 |
| node-id3 | 0.2.9 | ID3 标签编辑 |

### UI 组件与图标

| 技术 | 版本 | 用途 |
|------|------|------|
| Lucide Icons | 0.554.0 | 图标库（仿 QQ 音乐风格） |
| @vueuse/core | 11.3.0 | Vue 组合式 API 工具集 |
| @tanstack/vue-virtual | 3.13.12 | 虚拟滚动（大列表优化） |

### 数据与工具

| 技术 | 版本 | 用途 |
|------|------|------|
| @vscode/sqlite3 | 5.1.2 | SQLite 数据库 |
| ExcelJS | 4.4.0 | Excel 导入导出 |
| Fuse.js | 7.0.0 | 模糊搜索 |
| Chokidar | 4.0.3 | 文件监控 |

---

## 🏛️ 系统架构设计

### 进程架构

#### 主进程 (Main Process)

**职责**:
- 窗口生命周期管理
- 文件系统操作
- 数据库操作
- IPC 通信处理
- 系统服务集成（托盘、快捷键等）

**关键模块**:
- `src/main/main.ts` - 应用入口和窗口管理
- `src/main/database/db.ts` - 数据库单例类
- `src/main/ipc/handlers.ts` - IPC 处理器
- `src/main/services/` - 各种服务层

#### 渲染进程 (Renderer Process)

**职责**:
- UI 渲染和用户交互
- 状态管理
- 音频播放控制
- 组件化开发

**关键模块**:
- `src/renderer/main.ts` - 渲染进程入口
- `src/renderer/App.vue` - 根组件
- `src/renderer/stores/` - Pinia 状态管理
- `src/renderer/composables/` - 组合式函数
- `src/renderer/views/` - 页面视图组件

#### 预加载脚本 (Preload Script)

**职责**:
- 通过 `contextBridge` 暴露安全的 API
- 类型安全接口定义
- IPC 通信封装

**位置**: `src/main/preload.ts`

---

## 🗄️ 数据库架构设计

### 数据库版本控制机制

#### 版本定义

```typescript
// src/main/database/dbver.ts (需要创建)
export const DB_VERSION = '1.0.5'
```

#### 版本检查流程

```
应用启动
  ↓
db.initialize()
  ↓
检查 dbver.ts 中的版本号
  ↓
读取数据库 settings 表中的 db_version
  ↓
版本比较
  ├─ 版本匹配 → 继续初始化流程
  └─ 版本不匹配或不存在 → 清空重建数据库
      ├─ 删除数据库文件
      ├─ 删除关联文件（封面、歌词等）
      ├─ 重建数据库结构
      └─ 设置新版本号
```

#### 数据库配置

**位置**: `{userData}/xmmusic.db` (生产环境) 或 `xmmusic-dev.db` (开发环境)

**性能配置**:
```sql
PRAGMA journal_mode = WAL;              -- 写前日志模式
PRAGMA synchronous = NORMAL;            -- 同步模式
PRAGMA cache_size = -32000;             -- 32MB 缓存
PRAGMA temp_store = MEMORY;             -- 临时数据存储在内存
PRAGMA mmap_size = 268435456;           -- 256MB 内存映射
PRAGMA page_size = 4096;                -- 4KB 页大小
PRAGMA foreign_keys = ON;               -- 启用外键约束
```

### 数据库 Schema 设计 (v1.0.5)

#### 核心表结构

**1. music 表（音乐元数据主表）**
- 作为所有音乐信息的元数据存储
- 不依赖任何列表，列表通过 `file_path` 关联

```sql
CREATE TABLE music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,
  file_path TEXT UNIQUE NOT NULL,      -- 完整文件路径
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,             -- 文件内容的 MD5（用于去重）
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
```

**2. local_music 表（本地音乐列表）**
- 独立的本地音乐列表
- 通过 `file_path` 关联 `music` 表获取元数据

```sql
CREATE TABLE local_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,      -- 完整文件路径
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**3. discover_music 表（发现音乐列表）**
- 展示最近添加的歌曲（DiscoverView）

```sql
CREATE TABLE discover_music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**4. favorites 表（我喜欢列表）**
- 独立的收藏列表
- 已存在，符合要求

```sql
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**5. recent_plays 表（最近播放列表）**
- 独立的最近播放列表
- 替代或补充现有的 `play_history` 表

```sql
CREATE TABLE recent_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**6. playlist_item 表（播放列表项）**
- 已存在，使用 `file_path` 关联
- 保持独立于 `music` 表

```sql
CREATE TABLE playlist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,             -- 完整文件路径
  position INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlist(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, file_path)
);
```

**7. play_queue 表（播放队列）**
- 持久化播放队列存储
- 支持两个位置的队列同步

```sql
CREATE TABLE play_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,             -- 完整文件路径
  position INTEGER NOT NULL,           -- 队列位置
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**8. settings 表（设置）**
- 存储应用设置
- 包含数据库版本号

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 索引设计

```sql
-- music 表索引
CREATE INDEX idx_music_file_hash ON music(file_hash);
CREATE INDEX idx_music_file_path ON music(file_path);
CREATE INDEX idx_music_artist_title ON music(artist, title);

-- 列表表索引
CREATE INDEX idx_local_music_file_path ON local_music(file_path);
CREATE INDEX idx_favorites_file_path ON favorites(file_path);
CREATE INDEX idx_recent_plays_file_path ON recent_plays(file_path);
CREATE INDEX idx_play_queue_file_path ON play_queue(file_path);
CREATE INDEX idx_play_queue_position ON play_queue(position);

-- playlist_item 表索引
CREATE INDEX idx_playlist_item_playlist ON playlist_item(playlist_id);
CREATE INDEX idx_playlist_item_file_path ON playlist_item(file_path);
```

### MD5 计算策略

#### 文件路径 MD5（用于列表标识）

```typescript
// 工具函数
function calculateFilePathMD5(filePath: string): string {
  const crypto = require('crypto')
  return crypto.createHash('md5').update(filePath).digest('hex')
}
```

**使用场景**:
- 列表项唯一标识
- 列表项去重
- 判断歌曲是否在列表中

**特性**:
- 实时计算，不缓存
- 不存储在数据库中
- 基于文件完整路径

#### 文件内容 MD5（用于去重）

- 存储在 `music.file_hash` 字段
- 用于检测重复文件（相同内容的文件）
- 在文件扫描时计算并存储

---

## 🔌 API 架构设计

### IPC 通信架构

#### 通信模式

```
渲染进程 (Renderer)
  ↓
window.electronAPI.xxx()
  ↓
Preload Script (contextBridge)
  ↓
ipcRenderer.invoke('xxx', ...args)
  ↓
主进程 (Main Process)
  ↓
ipcMain.handle('xxx', ...)
  ↓
Service Layer / Database
  ↓
返回结果
```

#### API 分类

##### 1. 窗口控制 API

```typescript
window.electronAPI.minimizeWindow()
window.electronAPI.maximizeWindow()
window.electronAPI.closeWindow()
window.electronAPI.setMiniMode(enabled: boolean)
window.electronAPI.setWindowTheme(theme: 'light' | 'dark' | 'system')
```

##### 2. 文件操作 API

```typescript
window.electronAPI.selectMusicFolder(): Promise<string[]>
window.electronAPI.scanMusicFolder(path: string): Promise<ScanResult>
window.electronAPI.pauseScan(): Promise<boolean>
window.electronAPI.resumeScan(): Promise<boolean>
window.electronAPI.cancelScan(): Promise<boolean>
window.electronAPI.getScanState(): Promise<ScanState>
```

##### 3. 数据库操作 API

```typescript
// 列表管理（需要新增）
window.electronAPI.getLocalMusicList(offset: number, limit: number): Promise<MusicItem[]>
window.electronAPI.getLocalMusicCount(): Promise<number>
window.electronAPI.addToLocalMusic(filePath: string): Promise<void>
window.electronAPI.removeFromLocalMusic(filePath: string): Promise<void>
window.electronAPI.clearLocalMusic(): Promise<void>

window.electronAPI.getDiscoverMusicList(offset: number, limit: number): Promise<MusicItem[]>
window.electronAPI.getRecentPlaysList(offset: number, limit: number): Promise<MusicItem[]>

// 播放队列管理（需要新增）
window.electronAPI.getPlayQueue(): Promise<MusicItem[]>
window.electronAPI.addToPlayQueue(filePath: string, position?: number): Promise<void>
window.electronAPI.removeFromPlayQueue(filePath: string): Promise<void>
window.electronAPI.clearPlayQueue(): Promise<void>
window.electronAPI.isFileInPlayQueue(filePath: string): Promise<boolean>

// MD5 计算工具（需要新增）
window.electronAPI.calculateFilePathMD5(filePath: string): Promise<string>

// 标签编辑同步（需要增强）
window.electronAPI.updateMusicMetadata(musicId: number, updates: any): Promise<boolean>
```

##### 4. 批量操作 API（需要新增）

```typescript
window.electronAPI.batchAddToFavorites(filePaths: string[]): Promise<{ success: number; failed: number }>
window.electronAPI.batchAddToPlaylist(playlistId: number, filePaths: string[]): Promise<{ added: number; skipped: number }>
window.electronAPI.batchDeleteFromList(listType: string, filePaths: string[]): Promise<{ deleted: number }>
window.electronAPI.batchAddToPlayQueue(filePaths: string[]): Promise<{ added: number; skipped: number }>
```

##### 5. 列表清空 API（需要新增）

```typescript
window.electronAPI.clearList(listType: 'local' | 'favorites' | 'recent' | 'playlist'): Promise<void>
```

##### 6. 详细信息 API（需要新增）

```typescript
window.electronAPI.getMusicDetails(filePath: string): Promise<{
  title: string
  artist: string
  album: string | null
  duration: number
  hasLyrics: boolean
  fileType: string
  fileName: string
  filePath: string
  filePathMD5: string
  fileSize: { friendly: string; bytes: number }
}>
```

---

## 🎨 前端架构设计

### 组件层次结构

```
App.vue
├── AppLayout
│   ├── AppHeader          (头部：搜索、主题、窗口控制)
│   ├── AppSidebar         (侧边栏：菜单导航)
│   ├── RouterView         (主内容区)
│   │   ├── DiscoverView
│   │   ├── LocalMusicView
│   │   ├── FavoritesView
│   │   ├── PlaylistDetailView
│   │   ├── RecentPlayView
│   │   ├── NowPlayingView
│   │   └── SettingsView
│   └── PlayerBar          (底部播放控制栏)
│       └── PlayQueueDrawer (Footer 播放队列抽屉)
└── MiniPlayerView         (迷你播放器窗口)
```

### 状态管理架构

#### Pinia Stores

**1. playerStore** (`src/renderer/stores/player.ts`)
- 播放器状态（当前歌曲、播放状态、进度、音量）
- 播放队列管理
- 播放模式管理
- 状态持久化

**2. musicStore** (`src/renderer/stores/music.ts`)
- 音乐列表状态
- 搜索状态
- 当前视图状态
- 分页加载状态

**3. scanStore** (`src/renderer/stores/scan.ts`)
- 扫描进度
- 扫描状态

**4. settingsStore** (`src/renderer/stores/settings.ts`)
- 应用设置
- 主题设置

### 组合式函数 (Composables)

**1. usePlayer** (`src/renderer/composables/usePlayer.ts`)
- 播放控制（play、pause、seek）
- Howler.js 封装
- 原生 Audio API 回退

**2. useEqualizer** (`src/renderer/composables/useEqualizer.ts`)
- 均衡器控制

### 列表组件统一设计

所有列表组件需要遵循统一的接口和数据结构：

```typescript
interface ListComponentProps {
  listType: 'local' | 'favorites' | 'recent' | 'discover' | 'playlist' | 'queue'
  listId?: number  // 对于歌单，传入歌单ID
}

interface ListItem {
  id: number                    // 列表自增ID
  filePath: string             // 完整路径
  filePathMd5: string          // 路径MD5（实时计算）
  title: string                // 从 music 表 JOIN
  album: string | null         // 从 music 表 JOIN
  coverPath: string | null     // 从 music 表 JOIN
  addedAt: string              // 加入时间
}
```

---

## 🔄 数据流设计

### 列表加载流程

```
用户打开列表视图
  ↓
前端请求列表总数 (getXXXListCount)
  ↓
后端查询数据库 COUNT(*)
  ↓
返回总数 → 前端更新滚动条/分页
  ↓
用户滚动/翻页
  ↓
前端检查缓存
  ├─ 缓存命中 → 使用缓存数据
  └─ 缓存未命中 → 请求后端
      ↓
      后端查询数据库 (LIMIT/OFFSET)
      ↓
      JOIN music 表获取元数据
      ↓
      返回数据 → 前端缓存并显示
```

### 标签编辑同步流程

```
用户在列表A中右键"编辑标签"
  ↓
打开编辑对话框
  ↓
用户保存标签
  ↓
前端调用 updateMusicMetadata(filePath, updates)
  ↓
后端更新 music 表中对应 file_path 的记录
  ↓
触发 IPC 事件 'music-metadata-updated'
  ↓
前端所有组件监听该事件
  ↓
更新所有显示该歌曲的组件
  ├─ 当前列表
  ├─ 播放队列（两个位置）
  ├─ 当前播放UI
  └─ 缓存数据
```

### 文件扫描流程

```
用户触发扫描
  ↓
IPC: scan-music-folder(path)
  ↓
FileScanner Service
  ↓
递归收集文件
  ↓
异步队列处理（并发限制：5-10个）
  ├─ 计算文件内容 MD5
  ├─ 解析元数据
  └─ 批量插入数据库
      ├─ 插入 music 表（如果不存在）
      └─ 插入 local_music 表
  ↓
进度回调 (IPC: scan-progress)
  ↓
前端更新进度条
  ↓
扫描完成
  ├─ 更新 local_music 总数
  └─ 刷新列表显示
```

### 播放队列管理流程

```
用户点击"播放队列"图标
  ↓
前端计算 file_path 的 MD5
  ↓
查询播放队列（数据库或内存）
  ├─ 不在队列 → 添加到队列尾部
  └─ 在队列 → 从队列移除
  ↓
更新数据库 play_queue 表（持久化）
  ↓
更新前端状态（playerStore）
  ↓
同步更新两个显示位置
  ├─ Footer PlayQueueDrawer
  └─ NowPlayingView 右侧面板
```

---

## 🎯 关键设计决策

### 1. 列表完全独立性

**决策**: 所有列表独立存储，通过 `file_path` 关联 `music` 表

**原因**:
- 列表操作互不影响
- 删除列表项不影响其他列表
- 便于维护和扩展

**实现**:
- 每个列表使用独立表
- 通过 `file_path` JOIN `music` 表获取元数据
- MD5 实时计算用于列表项标识

### 2. MD5 实时计算

**决策**: 文件路径 MD5 实时计算，不存储不缓存

**原因**:
- 减少数据库存储
- 避免缓存一致性问题
- 计算开销小（字符串 MD5）

**实现**:
- 工具函数：`calculateFilePathMD5(filePath: string)`
- 仅在需要时计算（列表项比较、去重）

### 3. 数据库版本控制

**决策**: 版本不匹配时清空重建，不执行数据迁移

**原因**:
- v1.0.5 架构变化较大
- 简化开发复杂度
- 避免迁移数据的不一致性

**实现**:
- 版本定义在 `dbver.ts`
- 版本存储在 `settings` 表
- 不匹配时删除数据库文件重建

### 4. 播放队列持久化

**决策**: 播放队列存储到数据库，支持持久化

**原因**:
- 应用重启后恢复队列
- 支持两个位置的队列同步

**实现**:
- `play_queue` 表存储队列
- 前端播放队列与数据库同步

### 5. 分页加载策略

**决策**: 按需加载 + 缓存机制

**原因**:
- 支持大列表（10万+歌曲）
- 减少内存占用
- 提升加载速度

**实现**:
- 总数量从数据库 COUNT 获取
- 按页加载（LIMIT/OFFSET）
- 前端维护分页缓存
- 预加载前后各一页

---

## ⚡ 性能优化策略

### 数据库优化

1. **索引优化**
   - 为 `file_path` 创建索引（所有列表表）
   - 为常用查询字段创建索引
   - 使用覆盖索引减少回表

2. **查询优化**
   - 使用 LEFT JOIN 一次性获取列表数据和元数据
   - 批量查询代替 N+1 查询
   - 分页查询使用 LIMIT/OFFSET

3. **WAL 模式**
   - 提升并发读写性能
   - 32MB 缓存减少磁盘 I/O

### 前端优化

1. **虚拟滚动**
   - 使用 `@tanstack/vue-virtual` 优化大列表
   - 只渲染可见区域

2. **响应式优化**
   - 使用 `shallowRef` 优化大数组
   - 避免深度响应式

3. **缓存策略**
   - 分页数据缓存
   - 封面图片缓存
   - 元数据缓存

4. **异步处理**
   - 文件扫描异步队列
   - 批量操作异步处理
   - 进度更新节流

### MD5 计算优化

1. **计算时机优化**
   - 仅在需要时计算
   - 批量计算使用事务

2. **计算性能**
   - 使用 Node.js crypto 模块（高效）
   - 字符串 MD5 计算快速

---

## 📁 项目结构

```
xmmusic/
├── src/
│   ├── main/                    # 主进程
│   │   ├── database/
│   │   │   ├── db.ts            # 数据库类（单例）
│   │   │   ├── dbver.ts         # 数据库版本定义（需要创建）
│   │   │   ├── sqlite3-sync.ts  # SQLite 同步封装
│   │   │   └── migrations/      # 数据库迁移脚本
│   │   ├── ipc/
│   │   │   └── handlers.ts      # IPC 处理器
│   │   ├── services/            # 服务层
│   │   │   ├── fileScanner.ts   # 文件扫描
│   │   │   ├── metadataEditor.ts # 标签编辑
│   │   │   ├── fileMonitor.ts   # 文件监控
│   │   │   └── ...              # 其他服务
│   │   ├── main.ts              # 主进程入口
│   │   └── preload.ts           # 预加载脚本
│   ├── renderer/                # 渲染进程
│   │   ├── components/          # 组件
│   │   │   ├── layout/          # 布局组件
│   │   │   ├── music/           # 音乐相关组件
│   │   │   └── common/          # 通用组件
│   │   ├── views/               # 页面视图
│   │   ├── stores/              # Pinia 状态管理
│   │   ├── composables/         # 组合式函数
│   │   ├── router/              # 路由配置
│   │   ├── utils/               # 工具函数
│   │   └── styles/              # 样式文件
│   └── shared/                  # 共享代码
│       └── types/               # 类型定义
├── docs/
│   └── 1.0.5/                   # v1.0.5 文档
│       ├── REQUIREMENTS_ANALYSIS.md
│       └── SYSTEM_ARCHITECTURE.md (本文档)
└── package.json
```

---

## 🔐 安全设计

### 进程隔离

- **Context Isolation**: 启用（`contextIsolation: true`）
- **Node Integration**: 禁用（`nodeIntegration: false`）
- **Sandbox**: 启用（`sandbox: true`）

### IPC 安全

- **Preload Script**: 通过 `contextBridge` 暴露安全 API
- **输入验证**: IPC 处理器验证所有输入
- **权限控制**: 文件操作需要用户授权

### 文件访问安全

- **本地文件协议**: 使用 `local-file://` 协议
- **路径验证**: 验证文件路径合法性
- **沙箱模式**: 在沙箱模式下正常访问本地文件

---

## 🚀 实施路线图

### Phase 1: 数据库架构重构

1. 创建 `dbver.ts` 文件
2. 实现版本检查逻辑
3. 创建新的列表表结构
4. 实现数据库清理和重建函数
5. 实现 MD5 计算工具函数

### Phase 2: 后端 API 开发

1. 实现列表管理 API
2. 实现播放队列管理 API
3. 实现批量操作 API
4. 实现标签编辑同步机制
5. 实现详细信息查询 API

### Phase 3: 前端组件重构

1. 统一列表组件接口
2. 实现分页和缓存机制
3. 实现"我喜欢"图标按钮
4. 实现"播放队列"图标按钮
5. 实现右键菜单扩展
6. 实现详细信息对话框

### Phase 4: 功能增强

1. 实现列表清空功能
2. 实现批量操作功能
3. 实现播放全部功能
4. 优化异步扫描

---

## 📚 相关文档

- [需求分析文档](./REQUIREMENTS_ANALYSIS.md)
- [数据库 Schema 设计文档](./DATABASE_SCHEMA.md) (待创建)
- [API 接口设计文档](./API_DESIGN.md) (待创建)

---

**文档状态**: ✅ 已完成  
**下一步**: 创建数据库 Schema 设计文档和 API 接口设计文档

