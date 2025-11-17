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
   - Howler.js 音频播放
   - 播放控制
   - 进度条
   - 音量控制

## 📝 下一步开发

### 待实现功能

1. **文件监控**
   - chokidar 实时监控
   - 文件变化同步

2. **ID3 修复**
   - 编码检测
   - 标签修复
   - 文件备份

3. **去重功能**
   - 重复文件检测
   - 重复文件管理

4. **播放列表**
   - 创建/编辑播放列表
   - 播放列表管理

5. **导出功能**
   - Excel 导出
   - 文件导出

6. **相似音乐**
   - 相似度计算
   - 推荐算法

## 🐛 已知问题

1. 文件扫描中的重复检测需要优化
2. 虚拟滚动需要处理动态高度
3. 播放器需要实现播放模式（顺序/随机/单曲循环）

## 📚 相关文档

- [README.md](./README.md) - 项目概述
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - 实现指南
- [MODULE_DESIGN.md](./MODULE_DESIGN.md) - 模块设计
