---
name: xmmusic-git-author
description: >-
  XMMusic Git 提交作者与信息规范：使用 rosesmall2010、Conventional Commits 中文、
  禁止 AI 联名 trailer、禁止改 git config、禁止擅自 push。在本仓库执行 git commit、
  写提交说明、处理 Co-authored-by、或用户说「提交」时必须使用。
---

# XMMusic Git 提交规范

## 何时提交

- **仅在用户明确要求提交**（如「提交」「帮我 commit」）时执行 `git add` / `git commit`
- 未要求时只改代码与文档，不要主动提交
- **默认不 push**；只有用户明确要求时才 `git push`

## 作者

- 使用本地 `git config` 中的 GitHub 用户名与邮箱（本仓库为 `rosesmall2010` / `rosesmall2010@gmail.com`）
- **禁止**修改 `git config`（含 `user.name` / `user.email`）

## 提交信息

- 正文用 Conventional Commits + **中文**说明，写清本次具体改了什么
- 常用前缀：`feat:` / `fix:` / `docs:` / `style:` / `refactor:` / `perf:` / `test:` / `chore:`
- **禁止**在 commit message 中追加以下任一内容：
  - `Co-authored-by: Cursor <cursoragent@cursor.com>`
  - 任何含 `Cursor` / `cursoragent` / `Claude` / `Anthropic` 的作者、联名、trailer 行
  - 其它 IDE / Agent 自动署名

## 环境自动插入联名行时

若 `git commit` 后仍出现 AI 联名 trailer（仅限本会话刚创建且未推送的 HEAD）：

1. 用 `git commit-tree` 按当前 tree 与父提交重建同内容提交（不含联名行）
2. 再 `git reset --soft` 指向新提交

## 其它

- 不要用 `-i` 交互式 git 命令
- 不要 `--no-verify` 跳过 hook（除非用户明确要求）
- 不要把密钥、`.env` 等提交进仓库
