# Python 3.11 设置指南

## 已完成的步骤

✅ Python 3.11.14 已通过 Homebrew 安装

## 配置 npm 使用 Python 3.11

### 方法 1：设置 npm 配置（推荐）

```bash
npm config set python /opt/homebrew/bin/python3.11
```

### 方法 2：设置环境变量（临时）

```bash
export PYTHON=/opt/homebrew/bin/python3.11
npm install
```

### 方法 3：在 .zshrc 或 .bashrc 中添加（永久）

```bash
echo 'export PYTHON=/opt/homebrew/bin/python3.11' >> ~/.zshrc
source ~/.zshrc
```

## 验证配置

```bash
# 检查 npm Python 配置
npm config get python

# 应该显示: /opt/homebrew/bin/python3.11
```

## 当前问题

即使使用 Python 3.11，`better-sqlite3` 仍存在编译问题：
- `better-sqlite3@12.4.1` 和 `11.7.0` 都与 Electron 39.2.1 的 V8 API 不兼容
- 错误：`no member named 'GetIsolate' in 'v8::Context'`

## 解决方案

### 方案 1：等待 better-sqlite3 更新（不推荐）

等待 better-sqlite3 支持 Electron 39.2.1

### 方案 2：降级 Electron（推荐）

```bash
npm install electron@30.9.0 --save-dev
npm run rebuild
```

### 方案 3：使用 sql.js（推荐用于开发）

```bash
npm install sql.js --save
```

sql.js 是纯 JavaScript SQLite，不需要编译，完全兼容。

### 方案 4：临时跳过数据库（当前状态）

应用已经配置为在数据库未初始化时仍可运行，可以先开发前端功能。

## 建议

对于开发阶段，建议：
1. 先使用 sql.js 作为临时方案，确保开发进度
2. 或降级到 Electron 30.x（更稳定）
3. 等待 better-sqlite3 更新支持 Electron 39.2.1
