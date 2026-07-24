# xmmusic 部署架构文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 部署架构文档

---

## 📋 文档概述

本文档描述了 xmmusic 应用的部署架构，包括构建流程、打包配置、分发策略等。

---

## 🏗️ 部署架构

### 构建流程

```
源代码
  ↓
┌─────────────────┐
│  TypeScript     │ → dist/electron/
│  编译 (主进程)  │
└─────────────────┘
  ↓
┌─────────────────┐
│  Vite           │ → dist/renderer/
│  构建 (渲染进程)│
└─────────────────┘
  ↓
┌─────────────────┐
│  electron-builder│ → dist/安装包
│  打包           │
└─────────────────┘
  ↓
┌─────────────────┐
│  GitHub Releases│
│  分发           │
└─────────────────┘
```

---

## 📦 打包配置

### electron-builder 配置

```json
{
  "build": {
    "appId": "com.rosesmall2010.xmmusic",
    "productName": "xmmusic",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "files": [
      "dist/electron/**/*",
      "dist/renderer/**/*",
      "package.json"
    ],
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "mac": {
      "target": "dmg",
      "icon": "build/icon.icns",
      "category": "public.app-category.music"
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"],
      "icon": "build/icon.png",
      "category": "Audio"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    },
    "publish": {
      "provider": "github",
      "owner": "rosesmall2010",
      "repo": "xmmusic"
    }
  }
}
```

---

## 🚀 部署流程

### 1. 开发环境

**本地开发**:
```bash
npm run dev
```

**流程**:
- Vite 开发服务器 (端口 3000)
- Electron 加载 http://localhost:3000
- HMR 热更新

---

### 2. 构建环境

**生产构建**:
```bash
npm run build
```

**流程**:
- TypeScript 编译主进程
- Vite 构建渲染进程
- 输出到 dist/

---

### 3. 打包环境

**打包应用**:
```bash
npm run pack
```

**流程**:
- electron-builder 读取配置
- 打包所有平台
- 生成安装包

---

### 4. 分发环境

**GitHub Releases**:
- 自动创建 Release
- 上传安装包
- 发布更新

---

## 🔄 CI/CD 流程

### GitHub Actions 工作流

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

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v3
      - uses: softprops/action-gh-release@v1
        with:
          files: dist/**/*
```

---

## 📚 相关文档

- [INFRASTRUCTURE_PLAN.md](./INFRASTRUCTURE_PLAN.md) - 基础设施规划
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档

---

**文档状态**: ✅ 已完成
