# xmmusic

一个基于 Electron + Vue 3 + TypeScript 的跨平台桌面音乐播放器，专注于本地音乐管理和大规模音乐库（10万+）的高性能处理。

---

## ✨ 特性

- 🎵 **专注本地**: 无需联网，保护隐私
- ⚡ **高性能**: 支持 10 万+ 音乐库，毫秒级搜索
- 🎨 **现代化 UI**: 年轻人喜爱的设计风格
- 🧠 **智能化**: 去重、推荐、修复等智能功能
- 🌍 **跨平台**: Windows、macOS、Linux
- 💰 **完全免费开源**

---

## 🚀 快速开始

### 环境要求

- Node.js 18+ (LTS)
- npm/yarn/pnpm

### 安装

```bash
# 克隆项目
git clone https://github.com/zdhsoft/xmmusic.git
cd xmmusic

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包
npm run pack
```

---

## 📚 文档

### 架构文档

- [系统架构文档](./docs/SYSTEM_ARCHITECTURE.md) - 完整系统架构设计
- [前端架构文档](./docs/FRONTEND_ARCHITECTURE.md) - 前端架构设计
- [API 接口设计](./docs/API_DESIGN.md) - IPC API 接口定义
- [数据库设计](./docs/DATABASE_DESIGN.md) - 数据库设计文档

### 技术文档

- [技术设计文档](./docs/TECHNICAL_DESIGN.md) - 技术实现细节
- [技术选型文档](./docs/TECHNOLOGY_SELECTION.md) - 技术选型理由
- [性能优化方案](./docs/PERFORMANCE_OPTIMIZATION.md) - 性能优化策略
- [安全架构设计](./docs/SECURITY_ARCHITECTURE.md) - 安全架构设计
- [基础设施规划](./docs/INFRASTRUCTURE_PLAN.md) - 基础设施规划

### 设计文档

- [UI 设计文档](./docs/UI_DESIGN.md) - 用户界面设计
- [架构文档索引](./docs/ARCHITECTURE_INDEX.md) - 文档导航

### 产品文档

- [产品需求文档](./docs/PRD.md) - 产品需求文档
- [功能史诗](./docs/EPICS.md) - 功能史诗
- [用户故事](./docs/USER_STORIES.md) - 用户故事
- [开发计划](./docs/DEVELOPMENT_PLAN.md) - 开发计划

---

## 🛠️ 技术栈

- **Electron**: 39.2.1 - 桌面应用框架
- **Vue**: 3.5.24 - 前端框架
- **TypeScript**: 5.9 - 类型系统
- **SQLite**: better-sqlite3 - 本地数据库
- **Vite**: 构建工具
- **Pinia**: 状态管理
- **Howler.js**: 音频播放
- **music-metadata**: 元数据解析

---

## 📁 项目结构

```
xmmusic/
├── src/
│   ├── main/           # Electron 主进程
│   ├── renderer/       # Vue 渲染进程
│   └── shared/         # 共享代码
├── docs/               # 文档
├── tests/              # 测试
└── dist/               # 构建输出
```

详细结构参见 [技术设计文档](./docs/TECHNICAL_DESIGN.md)

---

## 🎯 核心功能

### MVP 功能
- ✅ 多目录管理（最多 10 个）
- ✅ 文件扫描和索引
- ✅ MD5 计算和去重
- ✅ 基础播放控制
- ✅ 音乐列表展示（虚拟滚动）
- ✅ 基础搜索
- ✅ 播放列表管理
- ✅ ID3 标签修复
- ✅ 主题切换
- ✅ 多语言支持

### V1.0 功能
- ✅ 文件监控
- ✅ 高级搜索
- ✅ 相似乐曲推荐
- ✅ Excel 导出
- ✅ 自动更新

---

## 📊 性能指标

- **扫描速度**: 10 万首歌曲 < 30 分钟
- **搜索响应**: < 100ms
- **列表滚动**: 60fps
- **内存占用**: < 200MB (10 万首)

---

## 🔒 安全

- Context Isolation 启用
- Sandbox 模式启用
- Node Integration 禁用
- IPC 输入验证
- 文件路径验证

详细安全设计参见 [安全架构文档](./docs/SECURITY_ARCHITECTURE.md)

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

MIT License

---

## 👥 作者

zdhsoft

---

## 🙏 致谢

感谢所有开源项目的贡献者！

---

**项目状态**: 🚧 开发中
**当前版本**: 规划阶段
**目标版本**: V1.0
