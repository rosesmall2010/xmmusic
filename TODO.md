# TODO 任务清单

**最后更新**: 2025-11-24
**项目状态**: 🚀 维护与迭代 (v1.0.3)

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

### 核心功能优化
- [ ] **损坏文件检测**
  - [ ] 实现文件完整性检测
  - [ ] 检测音频格式有效性
  - [ ] 标记损坏文件
  - [ ] 添加修复建议
  - 📍 扩展: `src/main/services/metadataParser.ts`

---

## 🟢 中优先级（本月内）

### 列表功能增强
- [ ] **列表功能**
  - [ ] 列排序（点击表头排序）
  - [ ] 多选功能
  - [ ] 右键菜单
  - [ ] 拖拽排序（播放列表）

### 搜索功能增强
- [ ] **FTS5 全文搜索优化**
  - [ ] 搜索结果高亮
  - [ ] 搜索历史记录持久化

- [ ] **高级搜索增强**
  - [ ] 多条件组合搜索
  - [ ] 搜索过滤器（艺术家、专辑、流派等）
  - [ ] 搜索建议/自动补全

### 播放列表管理增强
- [ ] **播放列表导入/导出**
  - [ ] 导入/导出播放列表（M3U/PLS）

### 去重功能增强
- [ ] **基于 MD5 的去重优化**
  - [ ] 重复文件列表对话框
  - [ ] 选择性删除重复文件
  - [ ] 删除前确认
  - [ ] 回收站支持（可恢复）

---

## 🔵 低优先级（下个迭代）

### 文档任务
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
- [ ] 是否支持歌词显示？(已支持基础LRC)
- [ ] 是否支持音频均衡器？(已支持)
- [ ] 图标设计是否需要更新？(已更新为Lucide)

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

### v1.0.3 (2025-11-24)
- [x] 修复GitHub Actions构建失败问题 (vuedraggable依赖)
- [x] 修复顺序播放模式按钮不可见问题

### v1.0.2 (2025-11-24)
- [x] **UI全面重构** (仿QQ音乐风格)
- [x] **图标系统升级** (Lucide Icons)
- [x] **性能优化** (Mini窗口切换、GPU错误修复)
- [x] **macOS体验改进** (红绿灯颜色修复)
- [x] Header 组件重构
- [x] Footer/播放控制栏重构
- [x] 侧边栏重构

### v1.0.1 (2025-11-20)
- [x] 均衡器功能修复
- [x] 播放队列状态图标
- [x] 数据库环境分离
- [x] 中文文件名播放修复

### v1.0.0 (MVP)
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
- [x] 文件扫描服务
- [x] MD5 计算模块
- [x] 元数据解析
- [x] 虚拟滚动实现
- [x] FTS5 全文搜索
- [x] 高级搜索
- [x] 播放列表 CRUD
- [x] 基于 MD5 的去重
- [x] Howler.js 集成

---

## 📊 统计

**总任务数**: ~100+
**已完成**: ~45
**进行中**: 0
**待开始**: ~55
**完成率**: ~45%
