# XM Music

> 基于 Electron + Vue 3 + TypeScript 的高颜值本地音乐播放器

[![GitHub release](https://img.shields.io/github/v/release/rosesmall2010/xmmusic)](https://github.com/rosesmall2010/xmmusic/releases)
[![License](https://img.shields.io/github/license/rosesmall2010/xmmusic)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

## ✨ 特性

- 🎨 **现代化UI设计** - 仿QQ音乐设计风格,视觉体验出色
- 🎵 **本地音乐管理** - 智能扫描、元数据编辑、封面提取
- 📁 **歌单管理** - 创建、编辑、设置封面、复制歌曲到目录、导入导出
- ❤️ **收藏功能** - 快速收藏喜欢的音乐
- 🎧 **高品质播放** - 基于Howler.js,支持多种音频格式
- 🎛️ **均衡器** - 内置多种预设音效,可自定义调节
- 🔍 **智能搜索** - 支持歌曲、艺术家、专辑多维度搜索
- 🎤 **歌词显示** - 支持 LRC 歌词、全屏歌词与桌面歌词（毛玻璃 / 锁定穿透）
- 🏷️ **智能标签编辑** - 智能解析文件名修复乱码标签，支持歌手/歌名对调
- 🗄️ **同步到数据库** - 仅写库不改文件，快速修复列表乱码（支持单曲与批量；英文标签防误转码）
- 📝 **文件名显示** - 列表显示文件名，便于识别和管理
- 🎨 **主题切换** - 浅色/深色/跟随系统
- 📱 **迷你模式** - 简洁的迷你播放器窗口
- ⚡ **极致性能** - 虚拟滚动+分批加载，轻松应对万级曲库
- 🖥️ **跨平台** - 支持 macOS（Apple Silicon）、Windows、Linux

## 🎯 最新版本 v1.1.4

### v1.1.4 更新内容
- **设置歌单封面** - 可选本地图片、歌单内歌曲封面（分页，每页最多 100），或使用应用内置默认封面图
- **复制到目录** - 歌单详情页可将全部歌曲按原文件名复制到所选目录，同名覆盖并显示进度
- **自定义封面优先** - 歌单列表 / 侧边栏 / 添加到歌单对话框优先显示自定义封面
- **同步到数据库增强** - 避免英文 ID3 误转码；无实质变化时跳过写库并反馈「无需变更」
- **依赖升级** - Vite 8、lucide-vue-next 1.x、vue-i18n 等；协作规范要求改完代码须 `npm run build` 验证

完整变更见 [CHANGELOG.md](CHANGELOG.md)。v1.1.3 功能说明仍见 [docs/1.1.3/README.md](docs/1.1.3/README.md)。

### v1.1.3 更新内容
- **同步到数据库** - 编辑标签 / 批量操作可将 ID3 与文件名解析结果写回数据库，不改写文件 ID3，修复列表乱码
- **桌面歌词全面修复** - 开发/生产模式可用；IPC 推送播放状态；系统毛玻璃背景；锁定后透明描边文字
- **播放与进度条** - 拖动进度条后声音与歌词继续跟随；修复均衡器跨域导致的「有进度无声音」
- **最近播放** - 同一首歌只保留一条并置顶；侧边栏收藏/最近数量实时刷新
- **界面细节** - 主题切换恢复正常；全屏播放页按钮悬停不再放大抖动

### v1.1.2 更新内容
- **macOS 仅保留 Apple Silicon（arm64）**，不再提供 Intel 安装包
- **最低 Node.js 提升至 24**；GitHub Actions 运行时同步升级
- **依赖升级** - Electron 42.7、Vue 3.5.40、better-sqlite3 12.11.1 等

### 更早版本
v1.1.1 及以前的更新（国际化、标签编辑增强、扫描目录、better-sqlite3 迁移等）请见 [CHANGELOG.md](CHANGELOG.md)

## 🛠️ 技术栈

### 核心框架
- **Electron** `42.7` - 跨平台桌面应用框架
- **Vue 3** `3.5.40` - 渐进式 JavaScript 框架
- **TypeScript** `7.x` - JavaScript 的超集
- **Vite** `8.x` - 前端构建工具

### 状态管理 & 路由
- **Pinia** `4.x` - Vue 3 状态管理
- **Vue Router** `5.x` - Vue 官方路由
- **vue-i18n** `11.x` - 国际化

### 音频 & 媒体
- **Howler.js** / 原生 Audio API - 音频播放
- **music-metadata** - 音频元数据提取
- **node-id3** - ID3 标签编辑

### UI组件 & 图标
- **Lucide Icons** (`lucide-vue-next` 1.x) - 现代化图标库
- **@vueuse/core** - Vue 组合式 API 工具集
- **@tanstack/vue-virtual** - 虚拟滚动

### 数据 & 工具
- **better-sqlite3** `12.11` - SQLite 数据库
- **ExcelJS** - Excel 导入导出
- **Fuse.js** - 模糊搜索
- **Chokidar** - 文件监控

## 📦 安装

### 下载安装包

从 [Releases](https://github.com/rosesmall2010/xmmusic/releases) 页面下载对应平台的安装包:

- **macOS**（仅 Apple Silicon / arm64）: `xmmusic-1.1.4-arm64.dmg`
- **Windows**: `xmmusic Setup 1.1.4.exe`
- **Linux**: `xmmusic-1.1.4.AppImage`

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/rosesmall2010/xmmusic.git
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

### 常用功能

- **设置歌单封面**：打开歌单详情 →「设置封面」→ 选择本地图片 / 从歌曲封面分页挑选 /「使用默认封面」
- **复制到目录**：歌单详情 →「复制到目录」→ 选择目标文件夹；按原文件名复制，同名覆盖，可看复制进度
- **桌面歌词**：播放栏打开桌面歌词；可锁定（鼠标穿透）与解锁；支持系统毛玻璃背景
- **同步到数据库**：列表显示乱码但文件本身正确时，右键「编辑标签」→「同步到数据库」，或批量操作栏批量同步（只改数据库，不改文件 ID3；英文标签不会被误转码）
- **主题**：顶部栏或设置页切换浅色 / 深色 / 跟随系统

变更详情见 [CHANGELOG.md](CHANGELOG.md)；v1.1.3 专项说明见 [docs/1.1.3/README.md](docs/1.1.3/README.md)。

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
    *   **Node.js**: >= 24.0.0 (推荐 v24 LTS)
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

2.  **提交前构建校验**（重要）:
    ```bash
    npm run build
    ```
    功能或 Bug 修复改完代码后，应执行一次生产构建，确认渲染进程（Vite）与主进程（tsc）均通过后再提交。仅改 Markdown 等文档时可跳过；`npm run dev` 不能替代生产构建校验。

3.  **DevTools (开发者工具)**:
    *   **自动开启**: 在 `npm run dev` 模式下，主窗口会自动打开 DevTools。
    *   **手动切换**:
        *   **macOS**: `Cmd + Option + I`
        *   **Windows / Linux**: `Ctrl + Shift + I`
    *   **功能**: 可用于查看 Console 日志、调试 DOM/CSS、监控 Network 请求 (仅限渲染进程请求)。

4.  **数据库调试**:
    *   **开发环境**: 使用完全独立的数据库，避免污染生产数据。
    *   **文件位置**:
        *   macOS: `~/Library/Application Support/xmmusic-dev/xmmusic-dev.db`
        *   Windows: `%APPDATA%/xmmusic-dev/xmmusic-dev.db`
    *   **查看**: 推荐使用 **DB Browser for SQLite** 或 VS Code 插件打开该文件查看实时数据。

5.  **常见问题**:
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

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Howler.js](https://howlerjs.com/)
- [Lucide Icons](https://lucide.dev/)

---

<p align="center">Made with ❤️ by zdhsoft</p>
