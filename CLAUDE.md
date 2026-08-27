# XMMusic — Claude Code 项目说明

本仓库使用 Claude Code 时**始终**遵守下列约定。详细条文在 skills 中，开发与提交时主动加载对应 skill。

## 必遵 skills

| Skill | 路径 | 何时用 |
|-------|------|--------|
| `xmmusic-project` | `.claude/skills/xmmusic-project/SKILL.md` | 写代码、修 bug、改文档、改 CHANGELOG |
| `xmmusic-git-author` | `.claude/skills/xmmusic-git-author/SKILL.md` | 任何 git commit / 写提交说明 |

可手动调用：`/xmmusic-project`、`/xmmusic-git-author`。

## 硬性摘要（始终生效）

1. **中文**：交流、注释、文档、提交信息用中文；标识符用英文。
2. **构建**：改代码后跑 `npm run build`；失败先修。纯文档可跳过。
3. **CHANGELOG**：写在 `package.json` 当前版本章节下；**不要**改 `package.json` 版本号。
4. **Git**：仅用户明确要求时才 commit；默认不 push；作者用本地 config（`rosesmall2010`）；禁止 AI 联名 trailer；不改 `git config`。
5. **栈约定**：Vue `<script setup lang="ts">` + scoped 样式；类型放 `src/shared/types/`；音乐路径 `local-file://`；DB 经 IPC。

## 不在此启用

- 不依赖 BMAD 工作流；日常开发只跟本文件与上述两个 skill。

## 来源

规则由原 `.cursorrules` 与 `.cursor/rules/git-author.mdc` 迁出，并调整为：提交需用户明确授权（不再自动 commit）。
