# XM Music

> 基于 Electron + Vue 3 + TypeScript 的高颜值本地音乐播放器

[![GitHub release](https://img.shields.io/github/v/release/zdhsoft/xmmusic)](https://github.com/zdhsoft/xmmusic/releases)
[![License](https://img.shields.io/github/license/zdhsoft/xmmusic)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

## ✨ 特性

- 🎨 **现代化UI设计** - 仿QQ音乐设计风格,视觉体验出色
- 🎵 **本地音乐管理** - 智能扫描、元数据编辑、封面提取
- 📁 **歌单管理** - 创建、编辑、导入导出歌单
- ❤️ **收藏功能** - 快速收藏喜欢的音乐
- 🎧 **高品质播放** - 基于Howler.js,支持多种音频格式
- 🎛️ **均衡器** - 内置多种预设音效,可自定义调节
- 🔍 **智能搜索** - 支持歌曲、艺术家、专辑多维度搜索
- 🎤 **歌词显示** - 支持LRC格式歌词,桌面歌词窗口
- 🏷️ **智能标签编辑** - 智能解析文件名修复乱码标签,支持歌手/歌名对调
- 📝 **文件名显示** - 列表显示文件名,便于识别和管理
- 🎨 **主题切换** - 浅色/深色/跟随系统
- 📱 **迷你模式** - 简洁的迷你播放器窗口
-  **极致性能** - 虚拟滚动+分批加载,轻松应对万级曲库
- 🖥️ **跨平台** - 支持 macOS、Windows、Linux

## 🎯 最新版本 v1.1.0

### v1.1.0 更新内容
- **完整的中英文国际化支持** - 扩展语言文件，添加所有界面文本的中英文翻译，在设置页面添加语言切换功能（中文/英文）
- **编辑标签对话框增强功能** - 新增ID3元数据显示区域，支持编码转换（GB2312/GBK），左右两栏布局优化
- **设置页面关于部分显示应用 Logo** - 使用新的应用 Logo，提升视觉效果
- **应用图标和音乐缺省封面更新** - 使用新生成的应用图标和音乐缺省封面
- **macOS Dock 图标优化** - 开发模式下优先使用 PNG 格式，修复图标显示问题
- **数据库初始化时序问题修复** - 修复 IPC handler 报错"数据库未初始化"的问题

### v1.0.9 更新内容
- **正在播放界面可读性优化** - 为音乐标题、歌手和专辑名称添加黑色描边效果，提升在背景特效下的可读性
- **窗口切换体验优化** - 修复正在播放窗口切换到 mini 窗口时的变灰白闪烁问题
- **Mini 窗口风格统一** - Mini 窗口全面支持主题系统，背景和文字颜色自动适配深色/浅色主题，与主界面风格保持一致

### v1.0.8 更新内容
- **全屏播放界面增强** - 音效对话框居中显示、音量控件布局优化
- **播放队列体验优化** - 播放队列自动滚动定位到当前播放歌曲；队列/收藏图标状态刷新更及时
- **随机播放优化** - 随机模式下当队列歌曲数大于 1 时，下一首不会重复刚刚播放的那一首
- **标签编辑修复** - 修复编辑标签保存失败（`no such table: music`），并修复标签更新后多处显示不同步问题
- **主界面交互优化** - 顶部搜索框改为矩形圆角；顶部空白区域可拖动窗口；底部播放栏按钮与进度条细节优化
- **正在播放界面可读性优化** - 为音乐标题、歌手和专辑名称添加黑色描边效果，提升在背景特效下的可读性
- **窗口切换体验优化** - 修复正在播放窗口切换到 mini 窗口时的变灰白闪烁问题
- **Mini 窗口风格统一** - Mini 窗口全面支持主题系统，背景和文字颜色自动适配深色/浅色主题，与主界面风格保持一致

### v1.0.7 更新内容
- **不可播放文件标记** - Howler加载失败时自动标记文件状态和原因
- **列表状态图标** - 歌曲列表显示文件状态（不存在/不可播放），悬停显示原因
- **扫描缺失文件标记** - 扫描结束后自动标记目录中缺失的文件
- **右键菜单优化** - 修复屏幕边缘右键菜单被裁切问题
- **歌词自动匹配** - 改进同目录歌词查找逻辑，确保正确回写数据库
- **音效设置修复** - 修复均衡器设置保存失败问题
- **音量持久化** - 修复音量保存/恢复异常问题

### v1.0.6 更新内容
- **扫描目录管理** - 新增扫描目录管理功能，支持添加、编辑、删除、启用/禁用
- **歌单封面显示** - 添加到歌单对话框和侧边栏显示歌单封面
- **数据库驱动升级** - 使用 better-sqlite3 替换原驱动，性能提升 3-20 倍
- **扫描流程优化** - 简化扫描流程，直接读取启用的目录开始扫描

### v1.0.5 更新内容
- **本地音乐管理增强** - 新增"清除所有"功能，保留歌单、收藏和播放历史
- **扫描进度显示** - 扫描音乐时显示实时进度条
- **数据持久化修复** - 修复 macOS 下 Dock 还原窗口时数据加载失败
- **歌单加载提速** - 优化数据库查询，解决 N+1 查询问题

### v1.0.4 更新内容
- **播放体验优化** - 修复启动播放问题，优化桌面歌词加载
- **界面细节打磨** - Now Playing 界面新增专属播放队列，支持文件名显示
- **交互体验提升** - 优化按钮提示和队列切换逻辑
- **极致性能优化** - 歌单详情页首屏极速渲染，大列表滚动丝滑流畅
- **批量操作增强** - 支持异步批量添加歌曲，带进度条显示
- **开发体验升级** - 开发环境数据库隔离，彻底解决 SQLITE_BUSY 错误
- **歌词系统完善** - 智能编码检测，支持模糊匹配

### v1.0.3 更新内容
- **文件名列显示** - 所有歌曲列表新增文件名列
- **智能标签编辑器** - 智能解析文件名修复乱码标签，支持对调按钮
- **元数据全局同步** - 标签编辑后所有视图实时更新
- **播放状态恢复** - 修复启动时播放恢复问题

### v1.0.2 重大更新
- **UI全面重构** - 采用仿QQ音乐设计风格
- **图标系统升级** - 使用Lucide Icons替换emoji
- **性能大幅优化** - 解决窗口切换卡顿和GPU错误
- **macOS体验改进** - 修复红绿灯失焦颜色问题

详见 [CHANGELOG.md](CHANGELOG.md)

## 🛠️ 技术栈

### 核心框架
- **Electron** `39.2.1` - 跨平台桌面应用框架
- **Vue 3** `3.5.24` - 渐进式JavaScript框架
- **TypeScript** `5.9.3` - JavaScript的超集
- **Vite** `7.2.2` - 新一代前端构建工具

### 状态管理 & 路由
- **Pinia** `3.0.4` - Vue 3状态管理
- **Vue Router** `4.4.5` - Vue官方路由

### 音频 & 媒体
- **Howler.js** `2.2.4` - 音频播放引擎
- **music-metadata** `11.10.1` - 音频元数据提取
- **node-id3** `0.2.9` - ID3标签编辑

### UI组件 & 图标
- **Lucide Icons** `0.554.0` - 现代化图标库
- **@vueuse/core** `11.3.0` - Vue组合式API工具集
- **@tanstack/vue-virtual** `3.13.12` - 虚拟滚动

### 数据 & 工具
- **better-sqlite3** `12.5.0` - SQLite数据库
- **ExcelJS** `4.4.0` - Excel导入导出
- **Fuse.js** `7.0.0` - 模糊搜索
- **Chokidar** `4.0.3` - 文件监控

## � 安装

### 下载安装包

从 [Releases](https://github.com/zdhsoft/xmmusic/releases) 页面下载对应平台的安装包:

- **macOS**:
  - Intel: `xmmusic-1.1.0.dmg`
  - Apple Silicon (M1/M2/M3): `xmmusic-1.1.0-arm64.dmg`
- **Windows**: `xmmusic-Setup-1.1.0.exe`
- **Linux**: `xmmusic-1.1.0.AppImage`

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/zdhsoft/xmmusic.git
cd xmmusic

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建应用
npm run build

# 打包
npm run dist        # 当前平台
npm run dist:mac    # macOS
npm run dist:win    # Windows
```

## 🚀 使用指南

### 首次使用

1. **添加音乐目录** - 在设置中添加本地音乐文件夹
2. **扫描音乐库** - 自动扫描并提取音乐信息和封面
3. **开始播放** - 双击歌曲即可播放

### 快捷键

| 功能 | macOS | Windows/Linux |
|------|-------|---------------|
| 播放/暂停 | `Space` | `Space` |
| 上一曲 | `⌘+←` | `Ctrl+←` |
| 下一曲 | `⌘+→` | `Ctrl+→` |
| 音量增加 | `⌘+Shift+↑` | `Ctrl+Shift+↑` |
| 音量减小 | `⌘+Shift+↓` | `Ctrl+Shift+↓` |
| 切换收藏 | `⌘+Shift+F` | `Ctrl+Shift+F` |
| 迷你模式 | `⌘+Option+M` | `Ctrl+Alt+M` |

## 📸 截图

> 待添加应用截图

## 💻 开发指南

### 🔧 环境搭建

在开始开发之前，请确保你的环境满足以下要求：

1.  **基础环境**:
    *   **Node.js**: >= 18.0.0 (推荐 v20 LTS)
    *   **Git**: 最新版本
    *   **包管理器**: npm (随 Node 安装)

2.  **平台特定要求** (必须配置，因为项目使用了原生模块 `better-sqlite3`)：

    *   **macOS**:
        *   安装 Xcode Command Line Tools: `xcode-select --install`
        *   Python 3.11+ (推荐使用 Homebrew安装: `brew install python@3.11`)

    *   **Windows**:
        *   **方案 A (推荐)**: 以管理员身份运行 Powershell 安装构建工具:
            ```powershell
            npm install --global --production windows-build-tools
            ```
        *   **方案 B**: 安装 Visual Studio Community (勾选 "Desktop development with C++")
        *   需安装 Python 3.11+ 并添加到 PATH

    *   **Linux (Ubuntu/Debian)**:
        ```bash
        sudo apt-get install build-essential libsqlite3-dev python3
        ```

### 📂 项目目录结构

```
xmmusic/
├── src/
│   ├── main/                 # 🟢 Electron 主进程 (Node.js 环境)
│   │   ├── database/         # 数据库层 (SQLite 封装, 定义 Model 和 Migration)
│   │   ├── ipc/              # IPC 通信处理 (注册 invoke/on 事件)
│   │   ├── services/         # 业务逻辑服务 (文件扫描, 托盘, 快捷键)
│   │   └── main.ts           # 应用入口，负责创建窗口和初始化服务
│   │
│   ├── renderer/             # 🔵 Vue 渲染进程 (浏览器环境)
│   │   ├── components/       # 通用 UI 组件 (Button, Modal 等)
│   │   ├── views/            # 路由页面 (Home, Playlist, Settings 等)
│   │   ├── stores/           # Pinia 状态管理 (PlayerStore, DataStore)
│   │   └── utils/            # 前端工具函数
│   │
│   └── shared/               # 🟡 共享代码
│       └── types/            # TypeScript 类型定义 (前后端共用)
│
├── build/                    # 构建所需的静态资源 (应用图标等)
└── scripts/                  # 工程脚本 (数据库迁移, 构建辅助)
```

### 🐛 调试与工具

1.  **启动开发模式**:
    ```bash
    npm run dev
    ```
    此命令会同时启动 Vite 开发服务器 (渲染进程) 和 Electron (主进程)。

2.  **DevTools (开发者工具)**:
    *   **自动开启**: 在 `npm run dev` 模式下，主窗口会自动打开 DevTools。
    *   **手动切换**:
        *   **macOS**: `Cmd + Option + I`
        *   **Windows / Linux**: `Ctrl + Shift + I`
    *   **功能**: 可用于查看 Console 日志、调试 DOM/CSS、监控 Network 请求 (仅限渲染进程请求)。

3.  **数据库调试**:
    *   **开发环境**: 使用完全独立的数据库，避免污染生产数据。
    *   **文件位置**:
        *   macOS: `~/Library/Application Support/xmmusic-dev/xmmusic-dev.db`
        *   Windows: `%APPDATA%/xmmusic-dev/xmmusic-dev.db`
    *   **查看**: 推荐使用 **DB Browser for SQLite** 或 VS Code 插件打开该文件查看实时数据。

4.  **常见问题**:
    *   **原生模块报错**: 如果遇到 `Module not found` 或 DLL 错误，请运行 `npm run rebuild`。
    *   **端口占用**: 默认使用 3000 端口，如果被占用，Vite 会自动切换，控制台会显示实际地址。

### 🔌 跨平台开发注意事项

*   **路径处理**: 严禁硬编码分隔符 (如 `\\` 或 `/`)，必须使用 `path.join()`。
*   **窗口控制**:
    *   **macOS**: 使用原生"红绿灯"按钮 (HiddenInset 风格)。
    *   **Windows**: 隐藏原生标题栏，使用前端模拟的控制按钮。
    *   代码中通过 `process.platform === 'darwin'` 区分处理逻辑。

## 📘 开发流程指南

如果你想为 xmmusic 开发新功能（特别是涉及数据库、文件操作和 UI 的功能），请参考以下标准流程。本指南特别适合使用 **Cursor**、**VS Code + Copilot** 等 AI IDE 的开发者。

### 🤖 AI 辅助开发建议

在使用 AI IDE 时，为了获得最佳代码生成效果：

1.  **明确上下文**: 在提问前，打开相关文件（如 `db.ts`, `types/music.ts`, `handlers.ts`）。
2.  **分步指令**: 不要一次性要求完成所有功能，建议按 `数据库 -> 后端逻辑 -> IPC接口 -> 前端UI` 的顺序分步进行。
3.  **遵循规范**: 提示 AI "请遵循项目现有的代码风格和设计模式"。

### 📋 标准开发步骤

以"开发一个功能"为例（例如：添加"音乐备注"功能）：

#### Step 1: 数据库设计 & 类型定义

1.  **定义类型**: 在 `src/shared/types/` 下修改或创建类型定义。
2.  **创建迁移脚本**:
    - 在 `src/main/database/migrations/` 创建新 SQL 文件（自增序号）。
    - 编写 `ALTER TABLE` 或 `CREATE TABLE` 语句。
3.  **更新数据库类**:
    - 在 `src/main/database/db.ts` 中实现 CRUD 方法。
    - **注意**: 涉及文件路径时，必须同步计算并存储 `file_path_md5`。

#### Step 2: 后端服务与文件操作

如果功能涉及文件读写（如封面提取、歌词保存）：

1.  **创建/更新服务**: 在 `src/main/services/` 下编写逻辑（如 `NoteManager.ts`）。
2.  **处理文件路径**: 始终使用绝对路径，注意跨平台兼容性 (`path.join`)。

#### Step 3: IPC 通信定义

1.  **注册 Handler**: 在 `src/main/ipc/handlers.ts` 中注册 `ipcMain.handle`。
2.  **暴露接口**: 在 `src/main/preload.ts` 中暴露方法给渲染进程。
3.  **扩展类型**: 更新 `src/electron.d.ts` 确保 TypeScript 类型安全。

#### Step 4: 前端界面实现

1.  **状态管理**: 在 `src/renderer/stores/` 中更新 Pinia store（如果数据需要全局共享）。
2.  **组件开发**:
    - 在 `src/renderer/components/` 创建 Vue 组件。
    - 使用 `window.electronAPI.xxx` 调用后端接口。
3.  **页面集成**: 将组件添加到 `src/renderer/views/` 下的对应页面。

### 💡 最佳实践

- **数据库隔离**: 开发时项目会自动使用 `xmmusic-dev.db`，放心测试，不会影响生产数据。
- **文件操作**: 避免直接在渲染进程使用 Node.js API，必须通过 IPC 调用主进程方法。
- **图标使用**: 请使用 `lucide-vue-next` 图标库，保持风格统一。
- **异步处理**: 耗时操作（如批量扫描）应支持进度回调，避免阻塞主线程。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📄 许可证

[MIT License](LICENSE)

## � 致谢

- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Howler.js](https://howlerjs.com/)
- [Lucide Icons](https://lucide.dev/)

---

<p align="center">Made with ❤️ by zdhsoft</p>
