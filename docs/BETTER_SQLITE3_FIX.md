# better-sqlite3 编译问题解决方案

## 问题描述

`better-sqlite3` 是原生 Node.js 模块，需要为 Electron 的 Node.js 版本重新编译。

当前遇到两个问题：
1. **Python 环境问题**：Python 3.12 移除了 `distutils`，导致编译失败
2. **版本兼容性问题**：`better-sqlite3@12.4.1` 与 Electron 39.2.1 不兼容

## 解决方案

### 方案 1：安装 Python distutils（推荐）

```bash
# macOS (使用 Homebrew)
brew install python3.11

# 然后设置环境变量
export PYTHON=/opt/homebrew/bin/python3.11
npm run rebuild
```

### 方案 2：使用预编译二进制文件

```bash
# 尝试使用预编译版本
npm install better-sqlite3@latest --save
```

### 方案 3：使用兼容的 Electron 版本

```bash
# 降级到 Electron 30.x（与 better-sqlite3 更兼容）
npm install electron@30.9.0 --save-dev
npm run rebuild
```

### 方案 4：使用替代数据库（临时方案）

如果以上方案都不行，可以考虑：
- 使用 `sql.js`（纯 JavaScript SQLite）
- 使用 `better-sqlite3` 的最新开发版本

## 当前状态

应用已经添加了错误处理，即使数据库初始化失败也能启动（但数据库功能不可用）。

## 临时解决方案

对于开发阶段，可以先：
1. 注释掉数据库初始化代码
2. 使用模拟数据
3. 后续再处理编译问题

## 相关链接

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [Electron 原生模块重建](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
