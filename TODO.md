# TODO 任务清单

**最后更新**: 2025-11-20
**项目状态**: 🚧 开发中 - MVP 阶段

---

## 🔴 紧急任务（本周必做）

### 安全与稳定性
- [ ] **验证沙箱模式下的本地文件访问**
  - [ ] 测试 `local-file://` 协议在 sandbox 模式下能否正常工作
  - [ ] 验证音乐文件封面图片加载
  - [ ] 验证音频文件播放功能
  - [ ] 如有问题，调整文件访问策略
  - 📍 相关文件: `src/main/main.ts` (L241-L251)

- [ ] **依赖版本锁定**
  - [ ] 移除 package.json 中所有依赖的 `^` 符号
  - [ ] 确保 package-lock.json 已提交到 Git
  - [ ] 验证 `npm ci` 命令可正常工作
  - [ ] 更新 README.md 中的安装说明
  - 📍 相关文件: `package.json`

- [ ] **DevTools 生产环境验证**
  - [ ] 执行 `npm run build` 构建生产版本
  - [ ] 执行 `npm run pack` 打包应用
  - [ ] 验证打包后的应用无法打开 DevTools
  - [ ] 测试快捷键 (Cmd+Option+I / F12) 被禁用
  - 📍 相关文件: `src/main/main.ts` (L125)

---

## 🟡 高优先级（2周内）

### 代码质量工具
- [ ] **配置 ESLint**
  - [ ] 安装 ESLint 和相关插件
    ```bash
    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
    npm install -D eslint-plugin-vue
    ```
  - [ ] 创建 `.eslintrc.js` 配置文件
  - [ ] 配置 TypeScript 严格规则
  - [ ] 集成到 VS Code
  - [ ] 修复现有代码的 lint 错误

- [ ] **配置 Prettier**
  - [ ] 安装 Prettier
    ```bash
    npm install -D prettier eslint-config-prettier eslint-plugin-prettier
    ```
  - [ ] 创建 `.prettierrc` 配置文件
  - [ ] 创建 `.prettierignore` 文件
  - [ ] 格式化现有代码
  - [ ] 集成到 VS Code

- [ ] **配置 Git Hooks**
  - [ ] 安装 husky 和 lint-staged
    ```bash
    npm install -D husky lint-staged
    npx husky install
    ```
  - [ ] 配置 pre-commit hook
  - [ ] 配置 commit-msg hook (Conventional Commits)
  - [ ] 更新 package.json scripts

### 核心功能开发
- [ ] **文件扫描服务**
  - [ ] 实现递归目录扫描
  - [ ] 实现文件类型过滤 (.mp3, .flac, .wav, .aac, .m4a)
  - [ ] 实现扫描进度计算和反馈
  - [ ] 实现批量数据插入优化
  - [ ] 添加错误处理和日志
  - [ ] 单元测试
  - 📍 创建文件: `src/main/services/fileScanner.ts`

- [ ] **MD5 计算模块**
  - [ ] 实现高效的文件 MD5 计算
  - [ ] 支持大文件分块读取
  - [ ] 添加计算进度反馈
  - [ ] 缓存机制（避免重复计算）
  - [ ] 单元测试
  - 📍 创建文件: `src/main/utils/md5Calculator.ts`

- [ ] **元数据解析**
  - [ ] 集成 music-metadata 库
  - [ ] 解析 ID3 标签信息
  - [ ] 处理编码问题（GB2312/GBK/UTF-8）
  - [ ] 提取封面图片
  - [ ] 获取音频时长和比特率
  - [ ] 单元测试
  - 📍 创建文件: `src/main/services/metadataParser.ts`

- [ ] **损坏文件检测**
  - [ ] 实现文件完整性检测
  - [ ] 检测音频格式有效性
  - [ ] 标记损坏文件
  - [ ] 添加修复建议
  - 📍 扩展: `src/main/services/metadataParser.ts`

---

## 🟢 中优先级（本月内）

### 基础 UI 开发
- [ ] **布局框架**
  - [ ] 实现主布局组件 (Header + Sidebar + Main + Footer)
  - [ ] 实现响应式布局
  - [ ] 支持侧边栏折叠/展开
  - [ ] 窗口大小调整适配
  - 📍 创建文件: `src/renderer/layouts/MainLayout.vue`

- [ ] **Header 组件**
  - [ ] 窗口控制按钮（最小化、最大化、关闭）
  - [ ] 搜索框
  - [ ] 用户设置入口
  - [ ] 主题切换按钮
  - 📍 创建文件: `src/renderer/components/Header.vue`

- [ ] **Sidebar 组件**
  - [ ] 导航菜单（音乐库、播放列表、收藏等）
  - [ ] 播放列表列表
  - [ ] 统计信息展示
  - [ ] 目录管理入口
  - 📍 创建文件: `src/renderer/components/Sidebar.vue`

- [ ] **Footer/播放控制栏**
  - [ ] 播放/暂停按钮
  - [ ] 上一曲/下一曲
  - [ ] 进度条和时间显示
  - [ ] 音量控制
  - [ ] 播放模式切换（顺序/随机/单曲循环）
  - [ ] 当前播放歌曲信息
  - 📍 创建文件: `src/renderer/components/PlayerBar.vue`

### 音频播放
- [ ] **Howler.js 集成**
  - [ ] 安装和配置 Howler.js
  - [ ] 创建音频播放服务
  - [ ] 实现播放控制（播放、暂停、停止）
  - [ ] 实现进度控制（跳转、快进、快退）
  - [ ] 实现音量控制
  - [ ] 实现播放模式（顺序、随机、循环）
  - [ ] 播放状态管理（Pinia store）
  - 📍 创建文件: `src/renderer/services/audioPlayer.ts`
  - 📍 创建 Store: `src/renderer/stores/player.ts`

---

## 🔵 低优先级（下个迭代）

### 音乐列表
- [ ] **虚拟滚动实现**
  - [ ] 集成 @tanstack/vue-virtual
  - [ ] 实现大数据量列表渲染
  - [ ] 优化滚动性能（60fps）
  - [ ] 添加滚动位置记忆
  - 📍 创建文件: `src/renderer/components/VirtualMusicList.vue`

- [ ] **列表功能**
  - [ ] 歌曲列表展示（标题、艺术家、专辑、时长等）
  - [ ] 列排序（点击表头排序）
  - [ ] 多选功能
  - [ ] 右键菜单
  - [ ] 拖拽排序（播放列表）
  - [ ] 双击播放

### 搜索功能
- [ ] **FTS5 全文搜索**
  - [ ] 设计 FTS5 虚拟表
  - [ ] 实现搜索索引构建
  - [ ] 实现搜索 API
  - [ ] 搜索结果高亮
  - [ ] 搜索历史记录
  - 📍 修改文件: `src/main/database/db.ts`

- [ ] **高级搜索**
  - [ ] 多条件组合搜索
  - [ ] 搜索过滤器（艺术家、专辑、流派等）
  - [ ] 搜索建议/自动补全
  - 📍 创建文件: `src/renderer/components/AdvancedSearch.vue`

### 播放列表管理
- [ ] **播放列表 CRUD**
  - [ ] 创建播放列表
  - [ ] 删除播放列表
  - [ ] 重命名播放列表
  - [ ] 添加歌曲到播放列表
  - [ ] 从播放列表移除歌曲
  - [ ] 导入/导出播放列表（M3U/PLS）

### 去重功能
- [ ] **基于 MD5 的去重**
  - [ ] 检测重复文件
  - [ ] 重复文件列表对话框
  - [ ] 选择性删除重复文件
  - [ ] 删除前确认
  - [ ] 回收站支持（可恢复）

---

## 📚 文档任务

- [ ] **API 文档**
  - [ ] IPC API 文档完善
  - [ ] 数据库 Schema 文档更新
  - [ ] 添加 JSDoc 注释

- [ ] **开发文档**
  - [ ] 创建 CONTRIBUTING.md
  - [ ] 创建 DEVELOPMENT.md
  - [ ] 更新 TROUBLESHOOTING.md
  - [ ] 补充安全配置说明

- [ ] **用户文档**
  - [ ] 用户手册（使用指南）
  - [ ] 常见问题 FAQ
  - [ ] 更新 README.md

- [ ] **变更日志**
  - [ ] 创建 CHANGELOG.md
  - [ ] 记录版本变更

---

## 🧪 测试任务

### 单元测试
- [ ] 数据库模块测试
- [ ] 文件扫描测试
- [ ] MD5 计算测试
- [ ] 元数据解析测试
- [ ] IPC handlers 测试

### 集成测试
- [ ] 完整扫描流程测试
- [ ] 播放功能测试
- [ ] 搜索功能测试
- [ ] 播放列表测试

### 性能测试
- [ ] 10 万+ 歌曲扫描性能
- [ ] 搜索响应时间（<100ms）
- [ ] 列表滚动性能（60fps）
- [ ] 内存占用测试（<200MB）

### 安全测试
- [ ] 沙箱模式验证
- [ ] IPC 输入验证测试
- [ ] 文件路径验证测试
- [ ] XSS/注入攻击测试

### 兼容性测试
- [ ] Windows 10/11 测试
- [ ] macOS 10.15+ 测试
- [ ] Linux (Ubuntu 20.04+) 测试

---

## 📝 笔记和想法

### 待决策事项
- [ ] 是否支持在线音乐（网易云、QQ音乐等）？
- [ ] 是否支持歌词显示？
- [ ] 是否支持音频均衡器？
- [ ] 图标设计是否需要更新？

### 技术债务
- [ ] 优化数据库查询性能
- [ ] 重构 main.ts（文件过大，考虑拆分）
- [ ] 添加错误边界处理
- [ ] 统一日志系统

### 优化想法
- [ ] 考虑使用 Worker 线程处理 MD5 计算
- [ ] 考虑使用 IndexedDB 缓存部分数据
- [ ] 考虑实现增量扫描（只扫描变更文件）

---

## ✅ 已完成

- [x] 项目基础结构搭建
- [x] Electron + Vue + TypeScript 配置
- [x] Vite 构建工具配置
- [x] 数据库设计和初始化
- [x] IPC 通信框架
- [x] Preload 脚本
- [x] 主题系统
- [x] 多语言支持 (i18n)
- [x] 文件监控服务
- [x] 快捷键管理器
- [x] 系统托盘服务
- [x] 安全配置（sandbox, webSecurity, contextIsolation）
- [x] 图标加载优化
- [x] Electron 39 网络服务崩溃修复

---

## 📊 统计

**总任务数**: ~80+
**已完成**: 15
**进行中**: 0
**待开始**: 65+
**完成率**: ~18%

---

**使用提示**:
- 使用 `[x]` 标记已完成任务
- 使用 `[/]` 标记进行中任务
- 定期更新此文件
- 每周回顾和调整优先级
