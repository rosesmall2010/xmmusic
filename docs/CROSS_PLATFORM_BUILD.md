# 跨平台打包说明

## 快速回答：可以，但需要特殊方法 ✅

**是否可以在 macOS 上构建 Windows 版本？**

- 🚫 **直接构建**：不可以 - node-gyp 不支持交叉编译原生模块
- ✅ **使用 GitHub Actions**：可以 - 推荐方案（最简单）
- ✅ **使用 Docker**：可以 - 需要 Docker Desktop（macOS 上运行 Windows 容器有限制）
- ✅ **手动替换原生模块**：可以 - 需要从 Windows 系统获取预编译文件

## 问题说明

xmmusic 使用了原生 Node.js 模块（`better-sqlite3`），这些模块需要为不同平台编译不同的二进制文件。

### 技术限制

- ❌ **node-gyp 不支持交叉编译** - 原生 C/C++ 模块必须在目标平台编译
- ⚠️ **npm install 只下载当前平台的预编译版本** - macOS 安装只得到 Mach-O 格式
- ✅ **electron-builder 可以打包其他平台** - 但需要原生模块文件

## 解决方案

### ⭐ 方案 1：使用 GitHub Actions（最佳方案）

这是**在 macOS 上构建 Windows 版本的最佳方法**，无需任何手动操作。

#### 配置步骤

1. **将代码推送到 GitHub**

```bash
git add .
git commit -m "Add GitHub Actions workflow"
git push origin main
```

2. **GitHub Actions 自动构建**

已创建配置文件：`.github/workflows/build.yml`

- ✅ 自动在 Windows runner 上构建 Windows 版本
- ✅ 自动在 macOS runner 上构建 macOS 版本
- ✅ 自动在 Linux runner 上构建 Linux 版本
- ✅ 自动上传构建产物到 Artifacts
- ✅ Tag 推送时自动创建 Release

3. **手动触发构建**

访问 GitHub 仓库 → Actions → Build Multi-Platform → Run workflow

4. **下载构建产物**

构建完成后，在 Actions 页面下载各平台的安装包。

#### 优点

- ✅ **真正的跨平台构建** - 在 macOS 开发，自动构建所有平台
- ✅ **完全自动化** - 推送代码即可触发
- ✅ **免费使用** - GitHub Actions 对公开仓库免费
- ✅ **可靠性高** - 每个平台使用原生环境构建

### 方案 2：在目标平台上构建（最直接）

#### 在 Windows 上构建 Windows 版本

```bash
# 1. 克隆仓库
git clone <repository-url>
cd xmmusic

# 2. 安装依赖
npm install

# 3. 构建 Windows 版本
npm run dist:win
```

#### 在 macOS 上构建 macOS 版本

```bash
# 1. 克隆仓库
git clone <repository-url>
cd xmmusic

# 2. 安装依赖（需要 Python 3.11）
PYTHON=/opt/homebrew/bin/python3.11 npm install

# 3. 构建 macOS 版本
npm run dist:mac
```

### 方案 3：使用脚本手动替换原生模块（高级）

如果你有访问 Windows 系统的权限，可以预先构建原生模块并复制回 macOS。

#### 步骤

1. **在 Windows 系统上**：

```bash
# 克隆项目
git clone <repository>
cd xmmusic

# 安装依赖（会构建 Windows 版本的原生模块）
npm install

# 打包原生模块
tar -czf windows-native-modules.tar.gz \
  node_modules/better-sqlite3/build
```

2. **传输到 macOS**：

```bash
# 使用 scp、云盘或其他方式传输 windows-native-modules.tar.gz
```

3. **在 macOS 上**：

```bash
# 解压并替换
cd xmmusic
tar -xzf windows-native-modules.tar.gz

# 现在可以打包 Windows 版本
npm run dist:win
```

#### 使用提供的脚本

```bash
# 运行辅助脚本（显示详细说明）
node scripts/download-native-modules.js win32 x64
```

### 方案 4：使用 Docker（实验性，macOS 限制较多）

**注意**：macOS 上的 Docker Desktop 对 Windows 容器支持有限。如果你有 Windows 主机或云服务器，可以使用：

```bash
# 1. 构建容器
docker build -f Dockerfile.win -t xmmusic-win-builder .

# 2. 创建临时容器
docker create --name xmmusic-temp xmmusic-win-builder

# 3. 复制原生模块
docker cp xmmusic-temp:/app/node_modules/better-sqlite3/build ./node_modules/better-sqlite3/

# 4. 清理
docker rm xmmusic-temp

# 5. 打包
npm run dist:win
```

## 当前构建状态

### ✅ macOS 版本
- **平台**: macOS (arm64，Apple Silicon)
- **构建命令**: `npm run dist:mac`
- **输出**: `dist/xmmusic-*.dmg`

### ⚠️ Windows 版本
- **平台**: Windows (x64)
- **构建命令**: `npm run dist:win`
- **注意**: 必须在 Windows 系统上构建
- **输出**: `dist/xmmusic Setup *.exe`

## 技术细节

### 原生模块

项目依赖以下原生模块：

1. **better-sqlite3** - SQLite 数据库驱动
   - 用于音乐元数据存储
   - 需要为每个平台编译
   - v12.11.x 配合 Electron 42；安装依赖时会按当前 Electron ABI 拉取/编译原生二进制

### electron-builder 配置

在 `electron-builder.yml` 中已配置：

```yaml
# 跨平台打包时跳过原生模块重新构建
buildDependenciesFromSource: false
nodeGypRebuild: false
npmRebuild: false

# 原生模块从 asar 中解包
asarUnpack:
  - node_modules/better-sqlite3/**/*
```

## 常见问题

### Q: 为什么不能直接交叉编译？

A:
- **node-gyp 限制**：原生模块编译工具 node-gyp 明确不支持交叉编译
- **工具链依赖**：需要目标平台的编译器、链接器和系统库
- **预编译二进制**：npm 包只包含当前平台的预编译文件

### Q: 在 macOS 上能构建 Windows 版本吗？

A: **能，但不是直接构建：**

| 方法 | 可行性 | 推荐度 | 说明 |
|------|--------|--------|------|
| GitHub Actions | ✅ 完全可行 | ⭐⭐⭐⭐⭐ | 最推荐，已配置好 |
| 手动替换原生模块 | ✅ 可行 | ⭐⭐⭐ | 需要访问 Windows 系统 |
| Docker Windows 容器 | ⚠️ 有限 | ⭐⭐ | macOS Docker 对 Windows 容器支持有限 |
| Wine + 交叉编译 | ⚠️ 复杂 | ⭐ | 不稳定，不推荐 |

### Q: 推荐的工作流程是什么？

A: **推荐使用 GitHub Actions：**

1. **日常开发**：在 macOS 上开发和测试
2. **构建全平台**：推送到 GitHub，自动构建所有平台
3. **测试验证**：下载对应平台的构建产物测试
4. **发布**：打 tag 自动创建 Release

```bash
# 开发完成后
git add .
git commit -m "feat: 新功能"
git push

# 等待 GitHub Actions 构建完成（约 5-10 分钟）
# 访问 Actions 页面下载构建产物

# 准备发布时
git tag v1.0.2
git push --tags
# 自动创建 Release，包含所有平台的安装包
```

## 相关资源

- [electron-builder 文档](https://www.electron.build/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [Node.js 原生模块指南](https://nodejs.org/api/addons.html)
