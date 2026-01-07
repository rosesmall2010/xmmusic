# Gitee Release 同步配置指南

**文档版本**: v1.0
**创建日期**: 2025-12-XX
**适用版本**: v1.1.1+

---

## 📋 概述

本文档说明如何配置 GitHub Actions 自动同步 Release 到 Gitee，以便中国地区用户能够通过 Gitee 下载更新。

---

## 🔧 配置步骤

### 步骤 1: 在 Gitee 创建仓库

1. 登录 [Gitee](https://gitee.com)
2. 创建新仓库 `xmmusic`（如果还没有）
3. 确保仓库是公开的（Public）

---

### 步骤 2: 生成 SSH 密钥对（用于代码同步）

#### 方法 A: 使用现有 SSH 密钥

如果你已经有 SSH 密钥：

```bash
# 查看现有 SSH 公钥
cat ~/.ssh/id_rsa.pub
```

#### 方法 B: 生成新的 SSH 密钥

```bash
# 生成 SSH 密钥对（专门用于 Gitee）
ssh-keygen -t rsa -b 4096 -C "gitee-sync@xmmusic" -f ~/.ssh/gitee_sync

# 查看公钥
cat ~/.ssh/gitee_sync.pub
```

---

### 步骤 3: 在 Gitee 添加 SSH 公钥

1. 复制步骤 2 中生成的公钥内容
2. 登录 Gitee，进入 **设置** → **SSH 公钥**
3. 点击 **添加公钥**
4. 粘贴公钥内容，标题填写 `GitHub Actions Sync`
5. 点击 **确定**

---

### 步骤 4: 获取 Gitee Personal Access Token

1. 登录 Gitee，进入 **设置** → **安全设置** → **私人令牌**
2. 点击 **生成新令牌**
3. 填写令牌描述：`GitHub Actions Release Sync`
4. 选择权限：
   - ✅ `projects` - 项目访问权限
   - ✅ `pull_requests` - Pull Request 权限
   - ✅ `releases` - Release 权限（重要）
5. 点击 **提交**，复制生成的 Token（**只显示一次，请妥善保存**）

---

### 步骤 5: 在 GitHub 配置 Secrets

1. 进入 GitHub 仓库 `zdhsoft/xmmusic`
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，添加以下两个 Secret：

#### Secret 1: `GITEE_SSH_PRIVATE_KEY`

- **Name**: `GITEE_SSH_PRIVATE_KEY`
- **Value**: 步骤 2 中生成的**私钥**内容（`~/.ssh/gitee_sync` 或 `~/.ssh/id_rsa`）

```bash
# 查看私钥内容
cat ~/.ssh/gitee_sync
# 或
cat ~/.ssh/id_rsa
```

**重要**:
- 复制**完整**的私钥内容，包括 `-----BEGIN RSA PRIVATE KEY-----` 和 `-----END RSA PRIVATE KEY-----`
- 不要泄露私钥，只在 GitHub Secrets 中使用

#### Secret 2: `GITEE_TOKEN`

- **Name**: `GITEE_TOKEN`
- **Value**: 步骤 4 中生成的 Gitee Personal Access Token

---

### 步骤 6: 验证配置

1. **创建测试 Release**：
   - 在 GitHub 进入 **Releases** → **Draft a new release**
   - 选择或创建标签（如 `v1.1.1-test`）
   - 填写 Release 标题和描述
   - **重要**: 确保 Release 不是草稿（Draft），或者先创建草稿，然后点击 **Publish release** 发布

2. **检查 GitHub Actions**：
   - 进入 **Actions** 标签页
   - 查看 `Sync Release to Gitee` 工作流是否运行
   - 检查是否有错误
   - **注意**: 只有**发布**（Publish）Release 才会触发同步，草稿（Draft）不会触发

3. **验证 Gitee Release**：
   - 登录 Gitee，进入仓库 `zdhsoft/xmmusic`
   - 查看 **Releases** 页面
   - 确认 Release 已创建，且包含所有文件

### 重要提示

**Release 发布流程**:
1. GitHub Actions 构建完成后会创建**草稿**（Draft）Release
2. 需要手动将草稿 Release **发布**（Publish）为正式 Release
3. 发布正式 Release 后，才会触发 Gitee 同步工作流

**自动化建议**（可选）:
- 可以修改 `build.yml` 中的 `draft: true` 改为 `draft: false`
- 这样构建完成后会自动发布 Release，无需手动操作
- 但建议先测试，确保构建产物正确

---

## 🔄 工作流程说明

### 完整发布流程

```
1. 推送 Tag 到 GitHub
    ↓
2. GitHub Actions 构建多平台安装包
    ↓
3. 创建 GitHub Release（草稿或正式）
    ↓
4. 如果 Release 是正式版本（非草稿）
    ↓
5. 触发 Gitee 同步工作流
    ↓
6. 同步代码到 Gitee（通过 SSH）
    ↓
7. 在 Gitee 创建 Release（通过 API）
    ↓
8. 从 GitHub Release 下载所有文件
    ↓
9. 上传文件到 Gitee Release（通过 API）
    ↓
完成 ✅
```

### 触发条件

- **自动触发**: 当在 GitHub **发布**（Publish）正式 Release 时
  - ⚠️ **注意**: 草稿（Draft）Release 不会触发同步
  - 需要将草稿 Release 发布为正式版本
- **手动触发**: 可以在 GitHub Actions 页面手动运行工作流

### 当前配置说明

根据 `build.yml` 配置，构建完成后会创建**草稿** Release：
- 需要手动进入 GitHub Releases 页面
- 找到草稿 Release，点击 **Publish release**
- 发布后才会触发 Gitee 同步

**可选优化**:
- 修改 `build.yml` 中的 `draft: true` 为 `draft: false`
- 这样构建完成后会自动发布，立即触发 Gitee 同步
- 但建议先测试，确保构建产物正确

---

## 🛠️ 故障排查

### 问题 1: SSH 密钥认证失败

**错误信息**:
```
Permission denied (publickey)
```

**解决方案**:
1. 确认 `GITEE_SSH_PRIVATE_KEY` Secret 配置正确
2. 确认 Gitee 已添加对应的 SSH 公钥
3. 测试 SSH 连接：
   ```bash
   ssh -T git@gitee.com
   ```

---

### 问题 2: Gitee API 认证失败

**错误信息**:
```
401 Unauthorized
```

**解决方案**:
1. 确认 `GITEE_TOKEN` Secret 配置正确
2. 确认 Token 有 `releases` 权限
3. 检查 Token 是否过期（重新生成）

---

### 问题 3: Release 文件上传失败

**错误信息**:
```
Failed to upload file
```

**解决方案**:
1. 确认文件大小不超过 Gitee 限制（通常 100MB）
2. 检查网络连接
3. 查看 GitHub Actions 日志获取详细错误信息

---

### 问题 4: 代码同步失败

**错误信息**:
```
Failed to sync code
```

**解决方案**:
1. 确认 Gitee 仓库已存在
2. 确认 SSH 密钥配置正确
3. 检查 Gitee 仓库权限设置

---

## 📝 注意事项

### 安全建议

1. **SSH 私钥安全**:
   - 不要将私钥提交到代码仓库
   - 只在 GitHub Secrets 中存储
   - 定期轮换密钥

2. **Token 安全**:
   - 不要将 Token 提交到代码仓库
   - Token 泄露后立即撤销并重新生成
   - 定期检查 Token 使用情况

3. **权限最小化**:
   - 只授予必要的权限
   - 定期审查 Token 权限

### 性能优化

1. **并发限制**: Gitee API 有频率限制，避免频繁调用
2. **文件大小**: 大文件上传可能需要较长时间
3. **网络稳定性**: 确保 GitHub Actions 运行环境网络稳定

---

## 🔗 相关资源

- [Gitee API 文档](https://gitee.com/api/v5/swagger)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [git-mirror-action](https://github.com/wearerequired/git-mirror-action)
- [gitee-release-action](https://github.com/yanglbme/gitee-release-action)

---

## 📝 变更记录

| 日期 | 版本 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 2025-12-XX | v1.0 | 初始版本 | - |
