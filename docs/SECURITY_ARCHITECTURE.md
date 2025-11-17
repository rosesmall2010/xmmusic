# xmmusic 安全架构设计

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 安全架构文档

---

## 📋 文档概述

本文档描述了 xmmusic 应用的安全架构设计，包括进程隔离、数据安全、代码安全等方面。

---

## 🔒 安全设计原则

### 1. 最小权限原则
- 仅请求必要的系统权限
- 仅访问用户指定的目录
- 最小化文件系统访问范围

### 2. 深度防御
- 多层安全防护
- 进程隔离
- 输入验证
- 错误处理

### 3. 数据保护
- 本地数据加密（如需要）
- 备份文件验证
- 敏感数据保护

---

## 🏗️ 安全架构

### 进程隔离架构

```
┌─────────────────────────────────────────┐
│         Renderer Process                │
│  (Sandboxed, No Node.js Access)         │
│  - Vue UI                                │
│  - User Interactions                     │
│  - IPC Communication Only                │
└─────────────────────────────────────────┘
              ↕ IPC (Context Bridge)
┌─────────────────────────────────────────┐
│         Preload Script                   │
│  (Context Bridge)                        │
│  - Expose Safe API                       │
│  - Input Validation                      │
└─────────────────────────────────────────┘
              ↕ IPC
┌─────────────────────────────────────────┐
│         Main Process                     │
│  (Full Node.js Access)                   │
│  - File System Operations                │
│  - Database Operations                   │
│  - System Integration                    │
└─────────────────────────────────────────┘
```

---

## 🔐 进程安全

### 1. Context Isolation

**配置**: 启用上下文隔离

**实现**:
```typescript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,  // 启用上下文隔离
    nodeIntegration: false,  // 禁用 Node.js 集成
    sandbox: true            // 启用沙盒模式
  }
});
```

**安全效果**:
- ✅ 渲染进程无法直接访问 Node.js
- ✅ 防止 XSS 攻击执行系统命令
- ✅ 隔离渲染进程和主进程

---

### 2. Sandbox 模式

**配置**: 启用沙盒模式（Electron 39+）

**实现**:
```typescript
webPreferences: {
  sandbox: true  // 启用沙盒模式
}
```

**安全效果**:
- ✅ 渲染进程运行在沙盒中
- ✅ 限制系统资源访问
- ✅ 防止恶意代码执行

---

### 3. Node Integration 禁用

**配置**: 禁用 Node.js 集成

**实现**:
```typescript
webPreferences: {
  nodeIntegration: false  // 禁用 Node.js 集成
}
```

**安全效果**:
- ✅ 渲染进程无法直接使用 Node.js API
- ✅ 必须通过 IPC 访问系统功能
- ✅ 减少攻击面

---

## 🛡️ IPC 安全

### 1. Context Bridge

**实现**: 使用 contextBridge 暴露安全 API

**实现**:
```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 仅暴露必要的 API
  getMusicList: (offset: number, limit: number) => {
    // 参数验证
    if (typeof offset !== 'number' || typeof limit !== 'number') {
      throw new Error('Invalid parameters');
    }
    if (offset < 0 || limit < 1 || limit > 1000) {
      throw new Error('Invalid range');
    }
    return ipcRenderer.invoke('get-music-list', offset, limit);
  }
});
```

**安全效果**:
- ✅ 仅暴露必要的 API
- ✅ 参数验证
- ✅ 类型检查

---

### 2. IPC 输入验证

**实现**: 主进程验证所有输入

**实现**:
```typescript
ipcMain.handle('get-music-list', (_, offset: number, limit: number) => {
  // 输入验证
  if (typeof offset !== 'number' || typeof limit !== 'number') {
    throw new Error('Invalid parameters');
  }
  if (offset < 0 || limit < 1 || limit > 1000) {
    throw new Error('Invalid range');
  }

  // 执行操作
  return db.getMusicList(offset, limit);
});
```

**安全效果**:
- ✅ 防止注入攻击
- ✅ 防止越界访问
- ✅ 防止类型错误

---

### 3. IPC 输出验证

**实现**: 验证和清理输出数据

**实现**:
```typescript
const sanitizeMusicItem = (item: any): MusicItem => {
  return {
    id: Number(item.id),
    title: String(item.title || '').slice(0, 200),
    artist: String(item.artist || '').slice(0, 200),
    // ... 其他字段验证
  };
};
```

**安全效果**:
- ✅ 防止数据泄露
- ✅ 防止 XSS 攻击
- ✅ 数据格式统一

---

## 📁 文件系统安全

### 1. 路径验证

**实现**: 验证所有文件路径

**实现**:
```typescript
import path from 'path';

const validatePath = (filePath: string, allowedDirs: string[]): boolean => {
  const normalized = path.normalize(filePath);

  // 检查路径遍历攻击
  if (normalized.includes('..')) {
    return false;
  }

  // 检查是否在允许的目录内
  return allowedDirs.some(dir => {
    const relative = path.relative(dir, normalized);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
};
```

**安全效果**:
- ✅ 防止路径遍历攻击
- ✅ 限制文件访问范围
- ✅ 防止访问系统文件

---

### 2. 文件权限检查

**实现**: 检查文件读写权限

**实现**:
```typescript
import fs from 'fs/promises';

const checkFilePermission = async (filePath: string, mode: 'read' | 'write'): Promise<boolean> => {
  try {
    if (mode === 'read') {
      await fs.access(filePath, fs.constants.R_OK);
    } else {
      await fs.access(filePath, fs.constants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
};
```

**安全效果**:
- ✅ 防止权限错误
- ✅ 优雅处理权限问题
- ✅ 用户友好的错误提示

---

### 3. 文件类型验证

**实现**: 验证文件类型和扩展名

**实现**:
```typescript
const ALLOWED_EXTENSIONS = ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'];

const validateAudioFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
};
```

**安全效果**:
- ✅ 防止执行恶意文件
- ✅ 限制文件类型
- ✅ 防止文件类型混淆

---

## 🗄️ 数据库安全

### 1. SQL 注入防护

**实现**: 使用参数化查询

**实现**:
```typescript
// ❌ 不安全
const query = `SELECT * FROM music WHERE title = '${title}'`;

// ✅ 安全
const stmt = db.prepare('SELECT * FROM music WHERE title = ?');
const result = stmt.get(title);
```

**安全效果**:
- ✅ 防止 SQL 注入攻击
- ✅ 参数自动转义
- ✅ 类型安全

---

### 2. 数据库文件保护

**实现**: 保护数据库文件

**实现**:
```typescript
// 数据库文件权限
const dbPath = path.join(app.getPath('userData'), 'xmmusic.db');

// 设置文件权限（仅当前用户可读写）
if (process.platform !== 'win32') {
  fs.chmodSync(dbPath, 0o600);
}
```

**安全效果**:
- ✅ 防止未授权访问
- ✅ 保护用户数据
- ✅ 符合隐私要求

---

### 3. 数据库备份验证

**实现**: 验证备份文件完整性

**实现**:
```typescript
const verifyBackup = async (backupPath: string): Promise<boolean> => {
  try {
    const db = new Database(backupPath);
    db.prepare('SELECT COUNT(*) FROM music').get();
    db.close();
    return true;
  } catch {
    return false;
  }
};
```

**安全效果**:
- ✅ 防止损坏的备份
- ✅ 确保数据完整性
- ✅ 恢复前验证

---

## 🔐 数据安全

### 1. 敏感数据保护

**实现**: 不存储敏感信息

**原则**:
- ❌ 不存储用户密码
- ❌ 不存储 API 密钥
- ❌ 不存储个人信息（除非用户明确同意）

**安全效果**:
- ✅ 减少数据泄露风险
- ✅ 符合隐私要求
- ✅ 降低安全责任

---

### 2. 数据加密（如需要）

**实现**: 使用加密存储敏感配置

**实现**:
```typescript
import crypto from 'crypto';

const encrypt = (text: string, key: string): string => {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (encrypted: string, key: string): string => {
  const decipher = crypto.createDecipher('aes-256-cbc', key);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
```

**使用场景**: 存储敏感配置（如 API 密钥，如果需要）

---

### 3. 数据备份安全

**实现**: 备份文件验证和加密

**实现**:
```typescript
const createSecureBackup = async (backupPath: string) => {
  // 创建备份
  await backupDatabase(backupPath);

  // 计算校验和
  const checksum = await calculateChecksum(backupPath);

  // 保存校验和
  await saveChecksum(backupPath + '.checksum', checksum);
};
```

**安全效果**:
- ✅ 备份文件完整性验证
- ✅ 防止备份文件损坏
- ✅ 恢复时验证

---

## 🛡️ 代码安全

### 1. 依赖安全

**实现**: 定期检查依赖漏洞

**工具**:
- `npm audit`: 检查依赖漏洞
- `snyk`: 安全扫描
- `dependabot`: 自动更新依赖

**流程**:
1. 开发时使用 `npm audit`
2. CI/CD 中集成安全检查
3. 定期更新依赖

---

### 2. 代码审查

**实现**: 所有代码必须经过审查

**流程**:
1. Pull Request 必须经过审查
2. 安全相关代码重点审查
3. 使用自动化工具检查

---

### 3. 类型安全

**实现**: TypeScript 严格模式

**配置**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**安全效果**:
- ✅ 编译时类型检查
- ✅ 减少运行时错误
- ✅ 提高代码质量

---

## 🚨 错误处理安全

### 1. 错误信息处理

**实现**: 不泄露敏感信息

**实现**:
```typescript
// ❌ 不安全
catch (error) {
  console.error('Database error:', error.message);
  throw new Error(`Database error: ${error.message}`);
}

// ✅ 安全
catch (error) {
  console.error('Database error:', error); // 仅开发环境
  throw new Error('Database operation failed'); // 用户友好消息
}
```

**安全效果**:
- ✅ 不泄露系统信息
- ✅ 不泄露文件路径
- ✅ 用户友好的错误提示

---

### 2. 异常捕获

**实现**: 全局异常处理

**实现**:
```typescript
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // 记录错误日志
  logError(error);
  // 优雅退出或恢复
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
  logError(reason);
});
```

**安全效果**:
- ✅ 防止应用崩溃
- ✅ 错误日志记录
- ✅ 优雅的错误处理

---

## 🔍 安全审计

### 1. 安全检查清单

**开发阶段**:
- [ ] Context Isolation 启用
- [ ] Sandbox 模式启用
- [ ] Node Integration 禁用
- [ ] IPC 输入验证
- [ ] 文件路径验证
- [ ] SQL 注入防护
- [ ] 错误处理安全

**发布前**:
- [ ] 依赖漏洞检查
- [ ] 代码安全审查
- [ ] 渗透测试（如需要）
- [ ] 安全文档更新

---

### 2. 安全测试

**测试内容**:
- IPC 注入测试
- 路径遍历测试
- SQL 注入测试
- XSS 测试
- 权限测试

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) - 技术设计文档

---

**文档状态**: ✅ 已完成
**安全级别**: 企业级
**下一步**: 基础设施规划
