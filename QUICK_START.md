# 快速启动指南

## 🚀 开始调试运行

### 步骤 1：解决依赖安装问题

当前遇到两个问题：
1. **npm 缓存权限问题**
2. **网络代理问题（端口 7890）**

#### 解决方案 A：修复 npm 权限（推荐）

```bash
# 修复 npm 缓存权限
sudo chown -R $(whoami) ~/.npm

# 然后安装依赖
npm install
```

#### 解决方案 B：禁用代理后安装

```bash
# 临时禁用代理
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY

# 安装依赖
npm install
```

#### 解决方案 C：使用国内镜像（如果在中国）

```bash
# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com

# 安装依赖
npm install
```

### 步骤 2：启动开发模式

安装依赖成功后，运行：

```bash
npm run dev
```

这将：
1. 启动 Vite 开发服务器（http://localhost:3000）
2. 启动 Electron 应用窗口

### 步骤 3：调试

- **Vite 开发服务器**：自动热重载前端代码
- **Electron DevTools**：自动打开开发者工具
- **控制台日志**：查看主进程和渲染进程的日志

---

## 📝 当前项目状态

✅ **已完成**：
- 项目结构
- 数据库模块
- 主进程和 IPC
- 前端基础框架
- 文件扫描功能
- 音乐列表（虚拟滚动）
- 播放器基础功能

⚠️ **待测试**：
- 依赖安装
- 实际运行测试
- 功能验证

---

## 🐛 如果遇到问题

1. **端口被占用**：修改 `vite.config.ts` 中的端口号
2. **Electron 无法启动**：确保已编译主进程代码 `npm run build:electron`
3. **数据库错误**：检查用户数据目录权限
4. **模块找不到**：确保所有依赖已正确安装

详细故障排除请查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
