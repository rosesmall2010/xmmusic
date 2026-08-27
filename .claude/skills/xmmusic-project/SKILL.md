---
name: xmmusic-project
description: >-
  XMMusic 项目 AI 协作与开发规范：中文交流、CHANGELOG、Vue/TS 代码风格、npm run build 验证、
  播放/数据库/UI 约定。在本仓库写代码、修 bug、改文档、发版说明时必须遵循。
---

# XMMusic 项目协作规范

## 语言

- 所有交流、注释、文档、提交信息使用中文
- 代码变量名用英文，注释必须用中文

## 版本与 CHANGELOG

- 更新 `CHANGELOG.md` 时，新内容必须写在 `package.json` **当前版本号**对应章节下
- 版本号格式：`## [x.y.z] - YYYY-MM-DD`
- `package.json`、`CHANGELOG.md`、`README.md` 版本号保持一致
- **不要**修改 `package.json` 里的版本号
- 若该版本章节已存在，把新记录追加到该版本下

## Git（摘要）

详细作者与提交约束见 skill `xmmusic-git-author`。要点：

- **仅在用户明确要求提交时**再 `git add` / `git commit`
- **禁止** `git push`（除非用户明确要求）
- 提交信息用 Conventional Commits + 中文说明（`feat:` / `fix:` / `docs:` 等）
- 不改 `git config`；提交信息禁止 AI 联名（含 Cursor / Claude / cursoragent 等）

## 代码规范

### 文件与组件

- Vue：`<script setup lang="ts">`，样式用 `<style scoped>`
- 导入顺序：第三方库 → Vue 相关 → 项目内部 → 类型定义
- 组件文件名 PascalCase（如 `EditTagModal.vue`）
- 普通文件名 camelCase（如 `parseFilename.ts`）
- 常量 `UPPER_SNAKE_CASE`；变量/函数 camelCase

### TypeScript

- 优先类型推导，避免过度标注
- 接口放在 `src/shared/types/`
- 联合类型用 `type`，对象结构用 `interface`

## 功能开发流程

### 构建验证（重要）

- 代码改完后必须执行 `npm run build`（Vite 渲染进程 + tsc 主进程）
- 构建失败先修复再结束；不要只靠 `npm run dev`
- 纯 Markdown 等文档改动可不跑完整 build

### 加功能

1. 更新相关 Vue 组件与类型
2. `npm run build` 通过
3. 更新 `CHANGELOG.md`（当前版本下）
4. 必要时更新 `README.md`、`TODO.md`
5. 仅当用户要求时再提交

### 修 Bug

1. 修复 → `npm run build`
2. 在 CHANGELOG「修复」部分记录
3. 仅当用户要求时再提交

### 文档职责

- `README.md`：用户向功能说明
- `CHANGELOG.md`：版本变更
- `TODO.md`：任务清单
- 技术文档：`docs/`

## 业务注意

### 播放

- Howler.js 或原生 Audio API
- 路径用 `local-file://`
- 中文文件名避免过度编码

### 数据库

- 经 IPC 调主进程数据库方法
- 开发库 `xmmusic-dev.db`，生产库 `xmmusic.db`

### UI

- 仿 QQ 音乐风格；Lucide Icons；主题：浅色 / 深色 / 跟随系统

## 禁止

- 不要 `git push`（除非用户明确要求）
- 不要改 `.git/` 目录内容
- 不要删 `node_modules/`（除非明确要求）
