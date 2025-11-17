# 故障排除指南

## npm 安装问题

### 问题：npm 缓存权限错误

如果遇到以下错误：
```
npm error Your cache folder contains root-owned files
```

### 解决方案

#### 方案 1：修复 npm 缓存权限（推荐）

在终端运行：
```bash
sudo chown -R $(whoami) ~/.npm
```

然后重新安装：
```bash
npm install
```

#### 方案 2：使用不同的包管理器

**使用 yarn：**
```bash
# 安装 yarn（如果还没有）
npm install -g yarn

# 使用 yarn 安装依赖
yarn install

# 运行开发模式
yarn dev
```

**使用 pnpm：**
```bash
# 安装 pnpm（如果还没有）
npm install -g pnpm

# 使用 pnpm 安装依赖
pnpm install

# 运行开发模式
pnpm dev
```

#### 方案 3：使用 npm 但跳过缓存

```bash
npm install --cache /tmp/npm-cache
```

---

## 开发模式运行

安装依赖后，运行：

```bash
npm run dev
```

这将同时启动：
- Vite 开发服务器（端口 3000）
- Electron 应用

---

## 常见问题

### 1. 端口 3000 被占用

修改 `vite.config.ts` 中的端口：
```typescript
server: {
  port: 3001  // 或其他可用端口
}
```

### 2. Electron 无法找到 preload.js

确保已编译主进程代码：
```bash
npm run build:electron
```

### 3. 数据库初始化失败

检查用户数据目录权限：
- macOS: `~/Library/Application Support/xmmusic/`
- Windows: `%APPDATA%/xmmusic/`
- Linux: `~/.config/xmmusic/`
