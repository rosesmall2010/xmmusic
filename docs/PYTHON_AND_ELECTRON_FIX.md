# Python 和 Electron 版本问题解决方案

## ✅ 已解决的问题

### 1. Python 3.12 distutils 问题
**问题**：Python 3.12 移除了 `distutils`，导致 `better-sqlite3` 编译失败

**解决方案**：
```bash
# 安装 Python 3.11
brew install python@3.11

# 验证安装
/opt/homebrew/bin/python3.11 --version
# 输出: Python 3.11.14
```

### 2. better-sqlite3 与 Electron 39.2.1 不兼容
**问题**：`better-sqlite3@12.4.1` 使用的 V8 API 与 Electron 39.2.1 不兼容
- 错误：`no member named 'GetIsolate' in 'v8::Context'`

**解决方案**：降级 Electron 到 32.3.3
```bash
npm install electron@32.3.3 --save-dev
```

### 3. 重新编译 better-sqlite3
**步骤**：
```bash
# 设置 Python 环境变量
export PYTHON=/opt/homebrew/bin/python3.11

# 重新编译
npm run rebuild
```

## ✅ 最终配置

- **Python**: 3.11.14 (通过 Homebrew 安装)
- **Electron**: 32.3.3
- **better-sqlite3**: 12.4.1 (成功编译)
- **编译文件**: `node_modules/better-sqlite3/build/Release/better_sqlite3.node`

## 📝 package.json 配置

```json
{
  "devDependencies": {
    "electron": "^32.3.3"
  },
  "scripts": {
    "postinstall": "PYTHON=/opt/homebrew/bin/python3.11 electron-builder install-app-deps",
    "rebuild": "PYTHON=/opt/homebrew/bin/python3.11 electron-builder install-app-deps"
  }
}
```

## 🚀 使用

现在可以正常启动应用：
```bash
npm run dev
```

数据库功能应该可以正常工作！

## 📚 相关文档

- [BETTER_SQLITE3_FIX.md](./BETTER_SQLITE3_FIX.md) - better-sqlite3 问题解决
- [PYTHON_SETUP.md](./PYTHON_SETUP.md) - Python 设置指南
