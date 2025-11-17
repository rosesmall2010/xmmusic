# xmmusic 基础设施规划

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 基础设施规划文档

---

## 📋 文档概述

本文档描述了 xmmusic 桌面应用的基础设施规划，包括开发环境、构建系统、打包分发、CI/CD 等。

---

## 🛠️ 开发环境

### 1. 开发工具

#### 必需工具
- **Node.js**: 18+ (LTS 版本)
- **npm/yarn/pnpm**: 包管理器
- **Git**: 版本控制
- **VS Code**: 推荐 IDE

#### 推荐插件
- **Vue Language Features (Volar)**: Vue 3 支持
- **TypeScript**: TypeScript 支持
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **GitLens**: Git 增强

---

### 2. 开发环境配置

#### 项目初始化
```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包
npm run pack
```

#### 环境变量
```env
# .env.development
NODE_ENV=development
VITE_DEV_SERVER_PORT=3000

# .env.production
NODE_ENV=production
```

---

### 3. 开发工作流

#### Git 工作流
- **主分支**: main (保护分支)
- **开发分支**: develop
- **功能分支**: feature/功能名
- **修复分支**: fix/问题描述

#### 代码规范
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **Husky**: Git hooks
- **Commitlint**: 提交信息规范

---

## 🏗️ 构建系统

### 1. 构建工具链

#### Vite (渲染进程)
**配置**: `vite.config.ts`

**功能**:
- 开发服务器 (HMR)
- 生产构建
- TypeScript 编译
- Vue 单文件组件处理

**构建输出**: `dist/renderer/`

---

#### TypeScript (主进程)
**配置**: `tsconfig.electron.json`

**功能**:
- TypeScript 编译
- 类型检查
- 代码转换

**构建输出**: `dist/electron/`

---

### 2. 构建流程

```
源代码
  ↓
┌─────────────────┐
│  TypeScript     │ → dist/electron/
│  (主进程)       │
└─────────────────┘
  ↓
┌─────────────────┐
│  Vite           │ → dist/renderer/
│  (渲染进程)     │
└─────────────────┘
  ↓
┌─────────────────┐
│  electron-builder│ → dist/安装包
│  (打包)         │
└─────────────────┘
```

---

### 3. 构建配置

#### package.json 脚本
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "electron .",
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "pack": "electron-builder",
    "dist": "npm run build && electron-builder"
  }
}
```

---

## 📦 打包与分发

### 1. 打包工具

#### electron-builder
**配置**: `electron-builder.yml` 或 `package.json`

**功能**:
- 跨平台打包
- 自动更新支持
- 代码签名（可选）
- 安装包生成

---

### 2. 平台支持

#### Windows
**格式**: NSIS 安装包 (.exe)

**配置**:
```json
{
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"
  }
}
```

**特点**:
- 自动更新支持
- 安装向导
- 卸载支持

---

#### macOS
**格式**: DMG 磁盘映像

**配置**:
```json
{
  "mac": {
    "target": "dmg",
    "icon": "build/icon.icns",
    "category": "public.app-category.music"
  }
}
```

**特点**:
- 代码签名（需要 Apple Developer）
- 公证（可选）
- Gatekeeper 兼容

---

#### Linux
**格式**: AppImage / DEB / RPM

**配置**:
```json
{
  "linux": {
    "target": ["AppImage", "deb", "rpm"],
    "icon": "build/icon.png",
    "category": "Audio"
  }
}
```

**特点**:
- 无需安装（AppImage）
- 系统集成（DEB/RPM）
- 包管理器支持

---

### 3. 自动更新

#### electron-updater
**配置**: GitHub Releases

**实现**:
```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
```

**流程**:
1. 检查 GitHub Releases
2. 下载更新包
3. 安装更新
4. 重启应用

---

## 🔄 CI/CD 流程

### 1. GitHub Actions

#### 工作流配置
**文件**: `.github/workflows/build.yml`

**流程**:
1. **代码检查**: ESLint, TypeScript 检查
2. **构建测试**: 构建应用
3. **单元测试**: 运行测试
4. **打包**: 打包所有平台
5. **发布**: 创建 GitHub Release

---

#### CI 配置示例
```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run build
      - run: npm run pack

      - uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: dist/
```

---

### 2. 自动化测试

#### 测试类型
- **单元测试**: Vitest
- **集成测试**: 关键功能
- **E2E 测试**: Playwright (可选)

#### 测试配置
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test"
  }
}
```

---

## 📊 版本管理

### 1. 版本号规则

**语义化版本**: MAJOR.MINOR.PATCH

**示例**:
- `1.0.0`: 初始发布
- `1.1.0`: 新功能
- `1.1.1`: Bug 修复

---

### 2. 版本发布流程

1. **开发**: feature 分支开发
2. **测试**: 合并到 develop，测试
3. **发布**: 合并到 main，打 tag
4. **构建**: CI/CD 自动构建
5. **分发**: 创建 GitHub Release

---

## 🔐 代码签名

### Windows
**工具**: Windows Code Signing Certificate

**配置**:
```json
{
  "win": {
    "signingHashAlgorithms": ["sha256"],
    "certificateFile": "certificate.pfx",
    "certificatePassword": "${env.CERTIFICATE_PASSWORD}"
  }
}
```

---

### macOS
**工具**: Apple Developer Certificate

**配置**:
```json
{
  "mac": {
    "identity": "Developer ID Application: Your Name"
  }
}
```

**流程**:
1. 代码签名
2. 公证 (notarize)
3. 分发

---

## 📦 依赖管理

### 1. 依赖锁定

**工具**: `package-lock.json`

**策略**:
- 锁定所有依赖版本
- 定期更新依赖
- 安全漏洞检查

---

### 2. 依赖更新

**工具**: `npm audit`, `npm update`

**流程**:
1. 定期运行 `npm audit`
2. 修复安全漏洞
3. 更新依赖版本
4. 测试兼容性

---

## 🗄️ 数据存储

### 1. 用户数据目录

**位置**:
- **Windows**: `%APPDATA%/xmmusic/`
- **macOS**: `~/Library/Application Support/xmmusic/`
- **Linux**: `~/.config/xmmusic/`

**内容**:
- 数据库文件: `xmmusic.db`
- 配置文件: `config.json`
- 缓存文件: `cache/`
- 日志文件: `logs/`

---

### 2. 数据备份

**策略**:
- 用户手动备份
- 备份到用户指定位置
- 备份文件验证

---

## 📝 日志系统

### 1. 日志级别

- **ERROR**: 错误信息
- **WARN**: 警告信息
- **INFO**: 一般信息
- **DEBUG**: 调试信息（仅开发环境）

---

### 2. 日志存储

**位置**: `{userData}/logs/`

**格式**:
- 文件: `app-YYYY-MM-DD.log`
- 格式: JSON 或文本

**轮转**: 每天一个文件，保留 7 天

---

## 🔍 监控与诊断

### 1. 性能监控

**工具**: 内置性能监控

**指标**:
- 内存占用
- CPU 使用率
- 响应时间
- 错误率

---

### 2. 错误报告

**实现**: 错误日志记录

**流程**:
1. 捕获错误
2. 记录日志
3. 用户提示（可选）
4. 错误分析

---

## 🌐 分发渠道

### 1. GitHub Releases

**主要渠道**: GitHub Releases

**优势**:
- 免费
- 版本管理
- 自动更新支持
- 下载统计

---

### 2. 其他渠道（可选）

- **官网**: 提供下载链接
- **包管理器**:
  - Windows: Chocolatey, Scoop
  - macOS: Homebrew
  - Linux: 各发行版仓库

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) - 技术设计文档

---

**文档状态**: ✅ 已完成
**基础设施**: 完整规划
**下一步**: 项目文档化
