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
- � **极致性能** - 虚拟滚动+分批加载,轻松应对万级曲库
- �🖥️ **跨平台** - 支持 macOS、Windows、Linux

## 🎯 最新版本 v1.0.4

### v1.0.4 更新内容
- **极致性能优化** - 歌单详情页首屏极速渲染，大列表滚动丝滑流畅
- **批量操作增强** - 支持异步批量添加歌曲，带进度条显示，拒绝卡顿
- **开发体验升级** - 开发环境数据库隔离，彻底解决 SQLITE_BUSY 错误
- **歌词系统完善** - 智能编码检测，支持模糊匹配，兼容性大幅提升

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
- **@vscode/sqlite3** `5.1.2` - SQLite数据库
- **ExcelJS** `4.4.0` - Excel导入导出
- **Fuse.js** `7.0.0` - 模糊搜索
- **Chokidar** `4.0.3` - 文件监控

## � 安装

### 下载安装包

从 [Releases](https://github.com/zdhsoft/xmmusic/releases) 页面下载对应平台的安装包:

- **macOS**:
  - Intel: `xmmusic-1.0.4.dmg`
  - Apple Silicon (M1/M2/M3): `xmmusic-1.0.4-arm64.dmg`
- **Windows**: `xmmusic-Setup-1.0.4.exe`
- **Linux**: `xmmusic-1.0.4.AppImage`

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

## � 开发

### 项目结构

```
xmmusic/
├── src/
│   ├── main/           # Electron主进程
│   │   ├── database/   # 数据库
│   │   ├── ipc/        # IPC通信
│   │   ├── services/   # 服务(托盘、快捷键等)
│   │   └── main.ts     # 主进程入口
│   └── renderer/       # Vue渲染进程
│       ├── components/ # 组件
│       ├── views/      # 页面
│       ├── stores/     # Pinia状态
│       ├── composables/# 组合式函数
│       └── utils/      # 工具函数
├── build/              # 构建资源
└── scripts/            # 构建脚本
```

### 开发环境要求

- Node.js >= 18
- npm >= 9

### 调试

```bash
# 启动开发服务器(带DevTools)
npm run dev

# 重新构建原生模块
# 重新构建原生模块
npm run rebuild
```

### 数据库隔离

开发环境会自动使用独立的 UserData 目录 (`xmmusic-dev`) 和数据库 (`xmmusic-dev.db`)，
确保开发测试数据不会污染已安装的生产版本数据，同时避免数据库锁定冲突。

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
