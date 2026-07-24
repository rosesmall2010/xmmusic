# 配置 GitHub MCP 以实现 AI 辅助构建

## 什么是 GitHub MCP？

MCP (Model Context Protocol) 是一个让 AI 助手可以访问外部资源的协议。配置 GitHub MCP 后，AI 可以：

- 访问 GitHub 仓库
- 读取和创建 Issues
- 触发 Workflows
- 管理 Pull Requests

## 配置步骤

### 1. 安装 GitHub MCP 服务器

目前可用的 GitHub MCP 实现：

- **@modelcontextprotocol/server-github** (官方)
- **其他社区实现**

```bash
# 安装官方 GitHub MCP 服务器（如果可用）
npm install -g @modelcontextprotocol/server-github
```

### 2. 配置 Cursor MCP Settings

在 Cursor 中配置 MCP：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your_github_personal_access_token"
      }
    }
  }
}
```

### 3. 创建 GitHub Personal Access Token

1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 勾选权限：
   - `repo` - 完整仓库访问
   - `workflow` - 触发 GitHub Actions
   - `read:org` - 读取组织信息（可选）
4. 生成并复制 token

### 4. 配置环境变量

```bash
# 方法 1: 在 ~/.zshrc 或 ~/.bashrc 中添加
export GITHUB_TOKEN="ghp_你的token"

# 方法 2: 在 Cursor MCP 配置中直接设置（如上）
```

## 使用示例

配置完成后，你可以这样与 AI 交互：

```
你：帮我查看 xmmusic 项目最近的 commits
AI：[通过 GitHub MCP 查询并显示结果]

你：帮我触发一次构建
AI：[通过 GitHub MCP 调用 Actions API 触发 workflow]

你：查看最新的构建状态
AI：[显示 GitHub Actions 运行状态]
```

## 实现 AI 触发构建的脚本

如果 GitHub MCP 支持，AI 可以执行类似这样的操作：

```javascript
// 触发 GitHub Actions workflow
async function triggerBuild(repo, workflowFile, ref = 'main') {
  const response = await github.rest.actions.createWorkflowDispatch({
    owner: 'rosesmall2010',
    repo: repo,
    workflow_id: workflowFile,
    ref: ref
  });

  return response;
}

// 使用
triggerBuild('xmmusic', 'build.yml', 'main');
```

## 当前限制

### MCP 协议限制

- 截至 2024 年，GitHub MCP 服务器可能还在早期开发阶段
- 不是所有 IDE 都完全支持 MCP
- 需要正确的权限配置

### 安全性考虑

⚠️ **重要安全提示：**

1. **Token 保护**
   - 不要在代码中硬编码 token
   - 使用环境变量
   - 定期轮换 token

2. **权限最小化**
   - 只授予必要的权限
   - 使用细粒度 token（fine-grained PAT）
   - 考虑使用 GitHub App 而不是 PAT

3. **审计日志**
   - 定期检查 token 使用情况
   - 在 GitHub 设置中查看访问日志

## 替代方案：使用 GitHub CLI + 脚本

即使不使用 MCP，你也可以创建简化的触发脚本：

### 创建快捷脚本

```bash
# scripts/trigger-build.sh
#!/bin/bash

echo "🚀 触发 GitHub Actions 构建..."

gh workflow run build.yml \
  --ref main

if [ $? -eq 0 ]; then
  echo "✅ 构建已触发！"
  echo "📊 查看进度："
  echo "   https://github.com/rosesmall2010/xmmusic/actions"

  # 自动打开浏览器
  open "https://github.com/rosesmall2010/xmmusic/actions"
else
  echo "❌ 触发失败，请检查 GitHub CLI 配置"
fi
```

```bash
# 使用
chmod +x scripts/trigger-build.sh
./scripts/trigger-build.sh
```

### 创建 npm 脚本

在 `package.json` 中添加：

```json
{
  "scripts": {
    "trigger:build": "gh workflow run build.yml",
    "trigger:watch": "gh run watch",
    "trigger:list": "gh run list --workflow=build.yml --limit=5"
  }
}
```

```bash
# 使用
npm run trigger:build
npm run trigger:watch
```

## 监控和通知

### 1. GitHub Actions 邮件通知

在 workflow 中添加：

```yaml
- name: Send notification
  if: always()
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "Build ${{ job.status }}: xmmusic"
    body: "构建完成！"
    to: your-email@example.com
```

### 2. Telegram Bot 通知

```yaml
- name: Telegram notification
  uses: appleboy/telegram-action@master
  with:
    to: ${{ secrets.TELEGRAM_TO }}
    token: ${{ secrets.TELEGRAM_TOKEN }}
    message: |
      🎉 xmmusic 构建完成！
      Status: ${{ job.status }}
```

### 3. Slack 通知

```yaml
- name: Slack notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 总结

### 当前最实用的方案

1. **本地触发** → `git push`（最简单）
2. **GitHub 网页** → 点击 "Run workflow"
3. **GitHub CLI** → `gh workflow run build.yml`（最灵活）
4. **npm 脚本** → `npm run trigger:build`（最方便）

### 未来可能

如果 GitHub MCP 成熟后，AI 将可以：
- 直接触发构建
- 监控构建进度
- 自动下载产物
- 创建 Release

但目前，使用 GitHub CLI 是最接近"AI 辅助"的方案。

## 参考资源

- [Model Context Protocol 文档](https://modelcontextprotocol.io/)
- [GitHub CLI 文档](https://cli.github.com/)
- [GitHub Actions API](https://docs.github.com/en/rest/actions)
- [GitHub Personal Access Tokens](https://github.com/settings/tokens)
