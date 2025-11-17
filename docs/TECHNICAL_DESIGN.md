# xmmusic 技术设计文档

**文档版本**: 1.0
**创建日期**: 2024
**文档类型**: 技术设计文档 (Technical Design Document)

---

## 📋 目录

1. [系统架构](#系统架构)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [核心模块设计](#核心模块设计)
5. [IPC 通信设计](#ipc-通信设计)
6. [性能优化策略](#性能优化策略)
7. [安全设计](#安全设计)
8. [错误处理](#错误处理)

---

## 🏗️ 系统架构

### 架构模式

采用 **Electron 主进程 + 渲染进程** 架构：

```
┌─────────────────────────────────────────┐
│         Electron Application            │
├─────────────────────────────────────────┤
│  Main Process (Node.js)                 │
│  - 窗口管理                              │
│  - 文件系统操作                          │
│  - 数据库操作                            │
│  - 文件监控                              │
│  - IPC 服务                              │
├─────────────────────────────────────────┤
│  Renderer Process (Vue 3)               │
│  - UI 渲染                               │
│  - 用户交互                              │
│  - 状态管理 (Pinia)                      │
│  - 组件化开发                            │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         SQLite Database                 │
│  - 音乐库数据                            │
│  - 播放列表                              │
│  - 设置                                  │
└─────────────────────────────────────────┘
```

### 数据流

```
用户操作 → Vue组件 → Pinia Store → IPC → Main Process → Database/FileSystem
                ↓
            UI更新
```

---

## 🛠️ 技术栈

### 核心技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 39.2.1 | 跨平台桌面应用框架 |
| Vue | 3.5.24 | 前端框架 |
| TypeScript | 5.9 | 类型安全 |
| SQLite (better-sqlite3) | latest | 本地数据库 |
| Vite | latest | 构建工具 |

### 功能库

| 库 | 版本 | 用途 |
|------|------|------|
| Pinia | latest | 状态管理 |
| Vue I18n | latest | 多语言 |
| Howler | latest | 音频播放 |
| music-metadata | latest | 元数据解析 |
| chokidar | latest | 文件监控 |
| exceljs | latest | Excel 导出 |
| iconv-lite | latest | 编码转换 |
| node-id3 | latest | ID3 标签写入 |

---

## 📁 项目结构

```
xmmusic/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.ts             # 主进程入口
│   │   ├── preload.ts          # 预加载脚本
│   │   ├── database/           # 数据库模块
│   │   │   ├── db.ts          # 数据库连接
│   │   │   ├── migrations/    # 数据库迁移
│   │   │   └── queries/      # 查询封装
│   │   ├── services/           # 服务模块
│   │   │   ├── fileScanner.ts # 文件扫描
│   │   │   ├── fileWatcher.ts # 文件监控
│   │   │   ├── metadataParser.ts # 元数据解析
│   │   │   ├── encodingFixer.ts  # ID3修复
│   │   │   ├── musicExporter.ts  # 音乐导出
│   │   │   └── excelExporter.ts # Excel导出
│   │   ├── utils/             # 工具函数
│   │   │   ├── md5.ts         # MD5计算
│   │   │   ├── fileUtils.ts   # 文件工具
│   │   │   └── similarity.ts  # 相似度计算
│   │   └── ipc/               # IPC 处理
│   │       └── handlers.ts   # IPC 处理器
│   ├── renderer/              # Vue 渲染进程
│   │   ├── main.ts           # 渲染进程入口
│   │   ├── App.vue           # 根组件
│   │   ├── components/       # 组件
│   │   │   ├── Header.vue
│   │   │   ├── Sidebar.vue
│   │   │   ├── Footer.vue
│   │   │   ├── MusicList.vue
│   │   │   ├── Player.vue
│   │   │   └── Settings/
│   │   ├── stores/           # Pinia 状态管理
│   │   │   ├── music.ts
│   │   │   ├── player.ts
│   │   │   ├── playlist.ts
│   │   │   └── settings.ts
│   │   ├── composables/      # 组合式函数
│   │   │   ├── useMusicList.ts
│   │   │   ├── usePlayer.ts
│   │   │   └── useSearch.ts
│   │   ├── utils/            # 工具函数
│   │   └── locales/          # 多语言文件
│   │       ├── zh.json
│   │       └── en.json
│   └── shared/               # 共享代码
│       ├── types/            # TypeScript 类型
│       │   ├── music.ts
│       │   ├── playlist.ts
│       │   └── settings.ts
│       └── constants/       # 常量
├── dist/                     # 构建输出
├── docs/                     # 文档
├── tests/                    # 测试
└── package.json
```

---

## 🔧 核心模块设计

### 1. 数据库模块

**文件**: `src/main/database/db.ts`

```typescript
class MusicDatabase {
  private db: Database.Database;

  // 初始化数据库
  initialize(): void;

  // 音乐相关
  insertMusic(music: MusicItem): void;
  getMusicList(offset: number, limit: number): MusicItem[];
  searchMusic(query: string): MusicItem[];
  getMusicByHash(hash: string): MusicItem[];

  // 播放列表相关
  createPlaylist(name: string): number;
  addToPlaylist(playlistId: number, musicId: number): void;
  getPlaylistSongs(playlistId: number): MusicItem[];

  // 去重相关
  getDuplicateGroups(): DuplicateGroup[];
  getFilesByHash(hash: string): MusicItem[];

  // 备份相关
  backupDatabase(path: string): Promise<void>;
  restoreDatabase(path: string): Promise<void>;
}
```

### 2. 文件扫描模块

**文件**: `src/main/services/fileScanner.ts`

```typescript
class FileScanner {
  // 扫描目录
  scanDirectory(path: string, options: ScanOptions): Promise<ScanResult>;

  // 增量扫描
  incrementalScan(path: string, lastScanTime: Date): Promise<ScanResult>;

  // 计算 MD5
  calculateMD5(filePath: string): Promise<string>;

  // 检测损坏文件
  detectCorruptedFile(filePath: string): Promise<boolean>;

  // 进度回调
  onProgress(callback: (progress: ScanProgress) => void): void;
}
```

### 3. 文件监控模块

**文件**: `src/main/services/fileWatcher.ts`

```typescript
class FileWatcher {
  private watchers: Map<string, FSWatcher>;
  private fileList: Map<string, FileInfo>; // 本地文件列表

  // 监控目录
  watchDirectory(dir: MusicDirectory): void;

  // 停止监控
  stopWatching(dirId: string): void;

  // 实时同步
  syncFileList(dir: string): Promise<void>;

  // 文件变化处理
  private handleFileChange(type: 'add' | 'delete' | 'modify', path: string): void;
}
```

### 4. ID3 修复模块

**文件**: `src/main/services/encodingFixer.ts`

```typescript
class ID3EncodingFixer {
  // 自动检测编码
  detectEncoding(text: string): Promise<EncodingResult[]>;

  // 修复 ID3 标签
  fixID3Tags(filePath: string, fields: ID3Fields, encoding: string): Promise<void>;

  // 备份文件
  backupFile(filePath: string): Promise<string>;

  // 恢复文件
  restoreFile(backupPath: string, targetPath: string): Promise<void>;
}
```

### 5. 音频播放模块

**文件**: `src/renderer/composables/usePlayer.ts`

```typescript
export function usePlayer() {
  const isPlaying = ref(false);
  const currentMusic = ref<MusicItem | null>(null);
  const currentTime = ref(0);
  const volume = ref(80);

  // 播放控制
  const play = (music: MusicItem) => void;
  const pause = () => void;
  const next = () => void;
  const previous = () => void;
  const seek = (time: number) => void;

  return { isPlaying, currentMusic, play, pause, next, previous, seek };
}
```

---

## 🔌 IPC 通信设计

### IPC 通道定义

**主进程 → 渲染进程**

```typescript
// src/main/ipc/handlers.ts

// 窗口控制
ipcMain.handle('window-minimize', () => void);
ipcMain.handle('window-maximize', () => void);
ipcMain.handle('window-close', () => void);

// 文件操作
ipcMain.handle('select-music-folder', () => Promise<string[]>);
ipcMain.handle('scan-music-folder', (_, path: string) => Promise<ScanResult>);

// 数据库操作
ipcMain.handle('get-music-list', (_, offset: number, limit: number) => Promise<MusicItem[]>);
ipcMain.handle('search-music', (_, query: string) => Promise<MusicItem[]>);
ipcMain.handle('get-music-total-count', () => Promise<number>);

// 播放列表
ipcMain.handle('create-playlist', (_, name: string) => Promise<number>);
ipcMain.handle('add-to-playlist', (_, playlistId: number, musicId: number) => Promise<void>);

// ID3 修复
ipcMain.handle('detect-id3-encoding', (_, filePath: string) => Promise<EncodingResult[]>);
ipcMain.handle('fix-id3-tags', (_, filePath: string, fields: ID3Fields, encoding: string) => Promise<void>);

// 去重
ipcMain.handle('get-duplicate-groups', () => Promise<DuplicateGroup[]>);
ipcMain.handle('delete-music-file', (_, fileId: number) => Promise<void>);

// 数据库备份
ipcMain.handle('backup-database', (_, path: string) => Promise<void>);
ipcMain.handle('restore-database', (_, path: string) => Promise<void>);
```

**渲染进程 → 主进程**

```typescript
// src/electron/preload.ts

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // 文件操作
  selectMusicFolder: () => Promise<string[]>;
  scanMusicFolder: (path: string) => Promise<ScanResult>;

  // 数据库操作
  getMusicList: (offset: number, limit: number) => Promise<MusicItem[]>;
  searchMusic: (query: string) => Promise<MusicItem[]>;
  getMusicTotalCount: () => Promise<number>;

  // ... 其他 API
});
```

---

## ⚡ 性能优化策略

### 1. 数据库优化

- **WAL 模式**: 提升并发性能
- **索引优化**: 复合索引、全文搜索 FTS5
- **批量操作**: 批量插入、批量更新
- **连接池**: 复用数据库连接

### 2. 界面优化

- **虚拟滚动**: 使用 @tanstack/vue-virtual
- **懒加载**: 分页加载，每次 50-100 首
- **防抖搜索**: 300ms 延迟
- **缓存**: 内存缓存最近访问的数据

### 3. 文件扫描优化

- **并发控制**: 限制并发数（10 个）
- **增量扫描**: 仅扫描新增/修改文件
- **Worker 线程**: 后台处理，不阻塞 UI
- **进度反馈**: 实时显示扫描进度

### 4. 文件监控优化

- **防抖处理**: 500ms 延迟
- **批量处理**: 累积变化后批量处理
- **选择性监控**: 仅监控启用的目录

---

## 🔒 安全设计

### 1. 进程隔离

- **Context Isolation**: 启用上下文隔离
- **Sandbox**: 启用沙盒模式（Electron 39+）
- **Node Integration**: 禁用（渲染进程不直接访问 Node.js）

### 2. 数据安全

- **本地存储**: 所有数据存储在本地
- **文件权限**: 检查文件读写权限
- **备份验证**: 备份文件完整性验证

### 3. 错误处理

- **异常捕获**: 全局异常处理
- **错误日志**: 记录错误日志
- **用户提示**: 友好的错误提示

---

## 🚨 错误处理

### 错误类型

1. **文件系统错误**
   - 文件不存在
   - 权限不足
   - 磁盘空间不足

2. **数据库错误**
   - 数据库损坏
   - 连接失败
   - 查询超时

3. **音频播放错误**
   - 文件格式不支持
   - 文件损坏
   - 解码失败

### 错误处理策略

```typescript
// 统一错误处理
class ErrorHandler {
  handleFileError(error: Error): void {
    // 记录日志
    // 用户提示
    // 恢复操作
  }

  handleDatabaseError(error: Error): void {
    // 尝试修复
    // 备份数据
    // 用户提示
  }
}
```

---

## 📝 开发规范

### 代码规范

- **TypeScript**: 严格模式
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **Git**: 提交规范

### 测试策略

- **单元测试**: Jest
- **集成测试**: 关键功能
- **E2E 测试**: 主要流程

---

**文档状态**: ✅ 已完成
**下一步**: 开始数据库设计和 UI 设计
