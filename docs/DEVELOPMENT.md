# xmmusic 开发指南

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run dev
```

这将同时启动：
- Vite 开发服务器（端口 3000）
- Electron 应用

### 3. 构建

```bash
npm run build
```

会依次执行：
- `build:renderer`：Vite 生产构建（会严格检查 Vue/TS 语法）
- `build:electron`：主进程 TypeScript 编译

**说明**：功能或 Bug 修复改完代码后，应执行一次 `npm run build`，确认编译通过后再提交。仅改 Markdown 等文档时可跳过。`npm run dev` 不能替代生产构建校验。

### 4. 打包

```bash
npm run pack
```

## 📁 项目结构

```
xmmusic/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 主进程入口
│   │   ├── preload.ts     # Preload 脚本
│   │   ├── database/     # 数据库模块
│   │   ├── services/      # 服务模块
│   │   └── ipc/           # IPC 处理器
│   ├── renderer/          # Vue 渲染进程
│   │   ├── main.ts        # Vue 应用入口
│   │   ├── App.vue        # 根组件
│   │   ├── components/    # Vue 组件
│   │   ├── stores/        # Pinia 状态管理
│   │   ├── composables/   # 组合式函数
│   │   └── locales/       # 国际化
│   └── shared/            # 共享代码
│       └── types/         # TypeScript 类型定义
├── dist/                  # 构建输出
└── docs/                  # 文档

```

## 🔧 已实现功能

### ✅ 核心功能

1. **项目初始化**
   - 完整的项目结构
   - TypeScript 配置
   - Vite 配置
   - Electron 配置

2. **数据库模块**
   - SQLite 数据库操作
   - 音乐数据 CRUD
   - 播放列表管理
   - 全文搜索（FTS5）

3. **主进程**
   - Electron 窗口管理
   - IPC 通信
   - 文件系统操作

4. **前端基础**
   - Vue 3 应用结构
   - Pinia 状态管理
   - 国际化（i18n）
   - 主题切换

5. **文件扫描**
   - 递归扫描目录
   - MD5 计算
   - 元数据解析
   - 损坏文件检测
   - 并发处理

6. **音乐列表**
   - 虚拟滚动
   - 分页加载
   - 搜索功能

7. **播放器**
   - Howler.js / 原生 Audio API
   - 播放控制、进度条、音量、均衡器
   - 播放模式（顺序 / 随机 / 单曲循环）

8. **桌面歌词**
   - 独立窗口 + IPC 状态推送
   - 系统毛玻璃（macOS vibrancy / Windows acrylic）
   - 锁定穿透与描边文字

9. **元数据同步**
   - 编辑标签写 ID3 + 数据库
   - 「同步到数据库」仅写 `all_music`（单曲 / 批量）

## 🔌 关键实现说明（v1.1.3）

### `local-file` 媒体协议

播放本地音频必须支持 Range seek，并兼容 Web Audio（均衡器）：

1. `registerSchemesAsPrivileged`：`standard` + `secure` + `supportFetchAPI` + `corsEnabled`（不要加 `stream: true`）
2. `protocol.handle` 手动返回 Range 206
3. URL 形如 `local-file://media/<绝对路径>`（`toLocalFileUrl`）
4. 音频元素设置 `crossOrigin = 'anonymous'`

详见 [1.1.3 功能说明](./1.1.3/README.md)。

### 桌面歌词

主窗口在歌词窗口打开时通过 IPC 推送播放状态；歌词窗口不跑主窗口初始化，避免双端互相推送。

## 📝 后续方向

可继续打磨的方向（详见根目录 `TODO.md`）：

1. 重复文件检测与管理
2. 相似音乐推荐
3. ESLint / 测试与发布流程完善

## 📚 相关文档

- [../README.md](../README.md) - 项目概述
- [1.1.3/README.md](./1.1.3/README.md) - v1.1.3 功能与技术说明
- [CROSS_PLATFORM_BUILD.md](./CROSS_PLATFORM_BUILD.md) - 跨平台打包
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - 实现指南
- [MODULE_DESIGN.md](./MODULE_DESIGN.md) - 模块设计
