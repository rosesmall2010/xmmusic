# xmmusic 系统架构文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 系统架构文档

---

## 📋 文档概述

本文档描述了 xmmusic 跨平台桌面音乐播放器的完整系统架构，包括架构模式、组件设计、数据流、技术选型和关键设计决策。

---

## 🏗️ 架构概览

### 架构类型

**桌面应用架构** - Electron 多进程架构

xmmusic 是一个基于 Electron 的跨平台桌面应用，采用主进程 + 渲染进程的架构模式，无传统后端服务器。

### 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                   用户界面层 (UI Layer)                 │
│  Vue 3 Components + Pinia State Management             │
└─────────────────────────────────────────────────────────┘
                          ↕ IPC
┌─────────────────────────────────────────────────────────┐
│                 业务逻辑层 (Business Layer)              │
│  Main Process Services (Node.js)                        │
│  - File Scanner, File Watcher, Metadata Parser          │
│  - ID3 Fixer, Music Exporter, Similarity Calculator    │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                   数据访问层 (Data Layer)                │
│  SQLite Database (better-sqlite3)                       │
│  File System Access                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 架构原则

### 1. 进程隔离
- **主进程**: 负责系统级操作（文件系统、数据库、窗口管理）
- **渲染进程**: 负责 UI 渲染和用户交互
- **安全隔离**: Context Isolation + Sandbox 模式

### 2. 关注点分离
- **UI 层**: 纯展示和交互逻辑
- **业务层**: 核心业务逻辑和数据处理
- **数据层**: 数据持久化和访问

### 3. 性能优先
- **虚拟滚动**: 支持 10 万+ 数据流畅展示
- **批量操作**: 减少 IPC 通信次数
- **异步处理**: 避免阻塞 UI 线程

### 4. 可扩展性
- **模块化设计**: 易于添加新功能
- **插件化架构**: 为未来扩展预留接口
- **配置驱动**: 通过配置而非代码修改行为

---

## 🏛️ 系统架构详细设计

### 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐         ┌──────────────────────┐  │
│  │  Main Process      │         │  Renderer Process     │  │
│  │  (Node.js)         │◄──IPC──►│  (Vue 3)             │  │
│  │                    │         │                       │  │
│  │  ┌──────────────┐  │         │  ┌────────────────┐ │  │
│  │  │ Window Mgmt  │  │         │  │  UI Components │ │  │
│  │  └──────────────┘  │         │  └────────────────┘ │  │
│  │                    │         │  ┌────────────────┐ │  │
│  │  ┌──────────────┐  │         │  │  Pinia Stores  │ │  │
│  │  │ IPC Handlers │  │         │  └────────────────┘ │  │
│  │  └──────────────┘  │         │  ┌────────────────┐ │  │
│  │                    │         │  │  Composables   │ │  │
│  │  ┌──────────────┐  │         │  └────────────────┘ │  │
│  │  │ Services     │  │         │                       │  │
│  │  │ - Scanner    │  │         │  ┌────────────────┐ │  │
│  │  │ - Watcher    │  │         │  │  Howler.js     │ │  │
│  │  │ - Parser     │  │         │  │  (Audio Play)  │ │  │
│  │  │ - Fixer      │  │         │  └────────────────┘ │  │
│  │  │ - Exporter   │  │         │                       │  │
│  │  └──────────────┘  │         │                       │  │
│  │                    │         │                       │  │
│  │  ┌──────────────┐  │         │                       │  │
│  │  │ Database     │  │         │                       │  │
│  │  │ (SQLite)     │  │         │                       │  │
│  │  └──────────────┘  │         │                       │  │
│  │                    │         │                       │  │
│  └────────────────────┘         └──────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   File System         │
              │   (Local Files)       │
              └───────────────────────┘
```

---

## 🔧 核心组件设计

### 1. 主进程组件 (Main Process)

#### 1.1 窗口管理器 (Window Manager)
**职责**: 管理应用窗口生命周期

**功能**:
- 创建和管理主窗口
- 窗口状态管理（最小化、最大化、关闭）
- 窗口配置和持久化

**位置**: `src/main/window.ts`

---

#### 1.2 IPC 处理器 (IPC Handlers)
**职责**: 处理渲染进程的 IPC 请求

**功能**:
- 窗口控制 IPC
- 文件操作 IPC
- 数据库操作 IPC
- 服务调用 IPC

**位置**: `src/main/ipc/handlers.ts`

---

#### 1.3 数据库服务 (Database Service)
**职责**: 数据库连接和操作

**功能**:
- 数据库初始化和迁移
- CRUD 操作封装
- 查询优化
- 备份和恢复

**位置**: `src/main/database/db.ts`

---

#### 1.4 文件扫描服务 (File Scanner Service)
**职责**: 扫描和索引音乐文件

**功能**:
- 递归扫描目录
- MD5 计算
- 元数据解析
- 损坏文件检测
- 进度报告

**位置**: `src/main/services/fileScanner.ts`

---

#### 1.5 文件监控服务 (File Watcher Service)
**职责**: 监控文件系统变化

**功能**:
- 实时监控目录变化
- 文件列表同步
- 增量扫描触发
- 批量处理优化

**位置**: `src/main/services/fileWatcher.ts`

---

#### 1.6 元数据解析服务 (Metadata Parser Service)
**职责**: 解析音频文件元数据

**功能**:
- ID3 标签解析
- 音频技术信息提取
- 封面提取
- 编码检测

**位置**: `src/main/services/metadataParser.ts`

---

#### 1.7 ID3 修复服务 (ID3 Fixer Service)
**职责**: 修复 ID3 标签乱码

**功能**:
- 编码自动检测
- ID3 标签修复
- 文件备份
- 备份管理

**位置**: `src/main/services/encodingFixer.ts`

---

#### 1.8 音乐导出服务 (Music Exporter Service)
**职责**: 导出音乐文件

**功能**:
- 播放列表导出
- 音乐文件复制
- Excel 导出
- 文件组织

**位置**: `src/main/services/musicExporter.ts`

---

#### 1.9 相似度计算服务 (Similarity Service)
**职责**: 计算音乐相似度

**功能**:
- 相似度算法
- 推荐生成
- 缓存优化

**位置**: `src/main/services/similarity.ts`

---

### 2. 渲染进程组件 (Renderer Process)

#### 2.1 UI 组件层 (UI Components)
**职责**: 用户界面展示

**组件**:
- Header: 头部导航
- Sidebar: 侧边栏菜单
- MainContent: 主内容区
- Footer: 播放控制区
- MusicList: 音乐列表
- Player: 播放器组件
- Settings: 设置页面

**位置**: `src/renderer/components/`

---

#### 2.2 状态管理层 (State Management)
**职责**: 应用状态管理

**Stores**:
- musicStore: 音乐库状态
- playerStore: 播放器状态
- playlistStore: 播放列表状态
- settingsStore: 设置状态

**位置**: `src/renderer/stores/`

---

#### 2.3 组合式函数层 (Composables)
**职责**: 可复用的业务逻辑

**Composables**:
- useMusicList: 音乐列表逻辑
- usePlayer: 播放器逻辑
- useSearch: 搜索逻辑
- usePlaylist: 播放列表逻辑

**位置**: `src/renderer/composables/`

---

#### 2.4 音频播放层 (Audio Player)
**职责**: 音频播放控制

**技术**: Howler.js

**功能**:
- 播放/暂停控制
- 进度控制
- 音量控制
- 播放模式

**位置**: `src/renderer/composables/usePlayer.ts`

---

## 🔄 数据流设计

### 用户操作流程

```
用户操作
  ↓
Vue 组件
  ↓
Pinia Store (状态更新)
  ↓
IPC 调用 (electronAPI)
  ↓
Preload Script (contextBridge)
  ↓
Main Process IPC Handler
  ↓
Service Layer (业务逻辑)
  ↓
Database / File System
  ↓
响应返回 (反向流程)
  ↓
UI 更新
```

### 文件扫描流程

```
用户触发扫描
  ↓
IPC: scan-music-folder
  ↓
FileScanner Service
  ↓
递归扫描目录
  ↓
并行处理 (MD5 + Metadata)
  ↓
批量插入数据库
  ↓
进度回调 (IPC)
  ↓
UI 更新进度
```

### 播放流程

```
用户点击播放
  ↓
usePlayer Composable
  ↓
Howler.js 加载音频
  ↓
播放控制
  ↓
进度更新 (定时器)
  ↓
UI 更新
```

---

## 🗄️ 数据架构

### 数据存储

#### 1. SQLite 数据库
**位置**: `{userData}/xmmusic.db`

**表结构**:
- music: 音乐信息
- music_directory: 音乐目录
- playlist: 播放列表
- playlist_item: 播放列表项
- play_history: 播放历史
- corrupted_file: 损坏文件
- id3_backup: ID3 备份
- database_backup: 数据库备份
- settings: 设置

**详细设计**: 参见 [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)

---

#### 2. 文件系统
**存储内容**:
- 音乐文件（用户指定目录）
- ID3 备份文件（用户指定目录）
- 数据库备份文件（用户指定目录）
- 应用缓存（临时文件）

---

#### 3. 应用配置
**位置**: `{userData}/config.json`

**配置内容**:
- 窗口状态
- 用户偏好
- 目录配置

---

## 🔌 通信架构

### IPC 通信模式

#### 请求-响应模式 (Request-Response)
```typescript
// 渲染进程
const result = await window.electronAPI.getMusicList(0, 50);

// 主进程
ipcMain.handle('get-music-list', async (_, offset, limit) => {
  return db.getMusicList(offset, limit);
});
```

#### 事件推送模式 (Event Push)
```typescript
// 主进程推送事件
mainWindow.webContents.send('scan-progress', progress);

// 渲染进程监听
ipcRenderer.on('scan-progress', (_, progress) => {
  // 更新 UI
});
```

---

## 🎨 前端架构

### 组件架构

```
App.vue (根组件)
├── Header.vue
├── MainContainer
│   ├── Sidebar.vue
│   └── MainContent.vue
│       ├── MusicListView.vue
│       ├── PlaylistView.vue
│       └── SettingsView.vue
└── Footer.vue
    └── PlayerControls.vue
```

### 状态管理架构

```
Pinia Store
├── musicStore
│   ├── musicList: MusicItem[]
│   ├── totalCount: number
│   └── actions: loadMusic, searchMusic
├── playerStore
│   ├── currentMusic: MusicItem | null
│   ├── isPlaying: boolean
│   └── actions: play, pause, next
├── playlistStore
│   ├── playlists: Playlist[]
│   └── actions: createPlaylist, addSong
└── settingsStore
    ├── theme: 'light' | 'dark'
    ├── language: 'zh' | 'en'
    └── actions: updateSettings
```

---

## ⚡ 性能架构

### 性能优化策略

#### 1. 数据库性能
- **WAL 模式**: 提升并发读写性能
- **索引优化**: 复合索引、FTS5 全文搜索
- **批量操作**: 减少数据库调用次数
- **连接复用**: 单例数据库连接

#### 2. UI 性能
- **虚拟滚动**: @tanstack/vue-virtual
- **懒加载**: 分页加载数据
- **防抖/节流**: 搜索和滚动优化
- **缓存策略**: 内存缓存常用数据

#### 3. 文件操作性能
- **并发控制**: 限制并发文件操作数
- **Worker 线程**: 后台处理不阻塞 UI
- **增量处理**: 仅处理变化部分
- **批量处理**: 累积操作后批量执行

---

## 🔒 安全架构

### 安全设计原则

#### 1. 进程隔离
- **Context Isolation**: 启用上下文隔离
- **Sandbox**: 启用沙盒模式
- **Node Integration**: 禁用（渲染进程）

#### 2. 数据安全
- **本地存储**: 所有数据存储在本地
- **文件权限**: 仅访问用户指定目录
- **备份验证**: 备份文件完整性检查

#### 3. 代码安全
- **类型安全**: TypeScript 严格模式
- **输入验证**: 所有用户输入验证
- **错误处理**: 完善的错误处理机制

---

## 📦 部署架构

### 应用打包

#### 平台支持
- **Windows**: NSIS 安装包
- **macOS**: DMG 磁盘映像
- **Linux**: AppImage / DEB / RPM

#### 打包工具
- **electron-builder**: 跨平台打包

#### 自动更新
- **electron-updater**: GitHub Releases
- **增量更新**: 仅下载差异文件

---

## 🔄 扩展性设计

### 插件系统（未来）

```
Plugin System
├── Plugin Interface
├── Plugin Registry
└── Plugin Loader
```

### 模块化设计

- **服务模块**: 易于替换和扩展
- **组件模块**: 可独立开发和测试
- **配置驱动**: 通过配置扩展功能

---

## 📊 架构决策记录 (ADR)

### ADR-001: 选择 Electron
**决策**: 使用 Electron 作为桌面应用框架

**理由**:
- 跨平台支持（Windows、macOS、Linux）
- 成熟的生态系统
- 使用 Web 技术栈（Vue、TypeScript）
- 活跃的社区支持

**权衡**:
- ✅ 跨平台开发效率高
- ✅ 技术栈统一
- ❌ 应用体积较大
- ❌ 内存占用相对较高

---

### ADR-002: 选择 SQLite
**决策**: 使用 SQLite (better-sqlite3) 作为数据库

**理由**:
- 本地存储，无需服务器
- 性能满足需求（10 万+ 数据）
- 轻量级，易于部署
- 支持全文搜索（FTS5）

**权衡**:
- ✅ 零配置，开箱即用
- ✅ 性能满足需求
- ❌ 不支持并发写入（但 WAL 模式缓解）

---

### ADR-003: 选择 Vue 3
**决策**: 使用 Vue 3 作为前端框架

**理由**:
- 组合式 API，代码组织清晰
- 性能优秀
- 生态系统完善
- 学习曲线平缓

**权衡**:
- ✅ 开发效率高
- ✅ 性能优秀
- ✅ 社区活跃

---

### ADR-004: 主进程 + 渲染进程架构
**决策**: 采用 Electron 多进程架构

**理由**:
- 安全性（进程隔离）
- 性能（主进程处理重任务）
- 稳定性（渲染进程崩溃不影响主进程）

**权衡**:
- ✅ 安全性高
- ✅ 性能好
- ❌ IPC 通信开销
- ❌ 架构复杂度增加

---

## 📚 相关文档

- [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) - 技术设计文档
- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) - 数据库设计文档
- [API_DESIGN.md](./API_DESIGN.md) - API 接口设计文档
- [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md) - 性能优化方案
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) - 安全架构文档

---

**文档状态**: ✅ 已完成
**审核状态**: 待审核
**下一步**: 设计 API 接口和技术选型
