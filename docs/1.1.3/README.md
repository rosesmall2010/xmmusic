# xmmusic v1.1.3 功能与变更说明

**版本**: 1.1.3  
**日期**: 2026-07-21 ~ 2026-07-22  
**类型**: 功能增强 + 稳定性修复 + 依赖升级延续

本文档汇总 v1.1.3 面向用户与开发者的功能说明，详细变更条目见根目录 [CHANGELOG.md](../../CHANGELOG.md)。

---

## 1. 面向用户的功能说明

### 1.1 同步到数据库（新增）

**解决的问题**：部分歌曲在本地列表里标题/歌手显示乱码，但文件名和 MP3 内的 ID3 标签本身是正确的。

**怎么用**：

| 入口 | 操作 | 行为 |
|------|------|------|
| 单曲 | 右键 →「编辑标签」→「同步到数据库」 | 把当前表单中的歌手/标题/专辑写入数据库，**不修改文件 ID3** |
| 批量 | 右键 →「批量操作」→ 勾选 →「同步到数据库」 | 自动从 **ID3（优先）+ 文件名** 解析后批量写库 |

**同步后会更新哪些界面**：本地音乐、歌单、收藏、最近播放、发现页、播放队列。它们都通过 `music_id` 关联同一条 `all_music` 记录，写库后界面会立即刷新。

**与「保存」的区别**：

- **保存**：写文件 ID3 + 写数据库（会改动音频文件）
- **同步到数据库**：只写数据库（适合「文件已经正确、只是库里乱码」）

### 1.2 桌面歌词（全面修复）

开发模式与生产模式均可正常使用。

| 能力 | 说明 |
|------|------|
| 状态同步 | 主窗口通过 IPC 实时推送当前歌曲与进度；歌词窗口独立，不共用 Pinia |
| 毛玻璃背景 | macOS：`vibrancy: 'hud'`；Windows 11：`acrylic` |
| 锁定模式 | 锁定后去掉毛玻璃，变为纯透明悬浮文字（鼠标穿透） |
| 文字描边 | 白色歌词 + 黑色描边，任意桌面背景可读 |
| 性能 | 仅在歌词窗口打开时推送状态，关闭后停止 100ms 轮询 |

### 1.3 播放与进度条

- 拖动进度条后，声音、全屏歌词、桌面歌词都会继续跟随（此前会挂死）
- 修复「进度在走但完全没声音」：均衡器跨域静音问题

### 1.4 最近播放与侧边栏

- 同一首歌在最近播放中只保留一条，再次播放会置顶
- 收藏数、最近播放数会随操作实时更新
- 设置页清空播放历史后，列表与侧边栏数量同步刷新

### 1.5 界面细节

- 全屏播放页控制按钮悬停不再放大，避免抖动与裁切
- 顶部栏深色/浅色主题切换恢复正常

### 1.6 平台与环境（延续自 1.1.2）

- macOS **仅支持 Apple Silicon（arm64）**，不再提供 Intel 包
- 开发环境最低 **Node.js 24**

---

## 2. 技术说明（给开发者）

### 2.1 `local-file` 自定义协议

为支持媒体 seek 与 Web Audio，协议改为：

1. `protocol.registerSchemesAsPrivileged`：`standard` + `secure` + `supportFetchAPI` + `corsEnabled`（**不要**加 `stream: true`，Electron 37+ 会破坏拖动）
2. `protocol.handle`：手动处理 HTTP Range（206 / Content-Range / Accept-Ranges）
3. 统一 URL：`local-file://media/<绝对路径>`（`toLocalFileUrl`）
4. 响应带 `Content-Type`、`Access-Control-Allow-Origin: *`
5. 音频元素 `crossOrigin = 'anonymous'`，否则 `createMediaElementSource` 会输出静音

相关文件：

- `src/main/main.ts` — 协议注册与 Range 处理
- `src/renderer/utils/media.ts` — `toLocalFileUrl` / `getCoverUrl`
- `src/renderer/composables/usePlayer.ts` — 播放与 `crossOrigin`

### 2.2 桌面歌词架构

```
主窗口 (App.vue)
  └─ 仅在桌面歌词打开时 watch 播放状态
  └─ sendDesktopLyricsState → IPC
主进程 (handlers.ts)
  └─ 转发 desktop-lyrics-state
  └─ visibility 开/关回调
歌词窗口 (DesktopLyricsWindow.vue)
  └─ 不跑主窗口初始化
  └─ onDesktopLyricsState 更新歌词行
  └─ loadLyrics 使用 LyricsData.lines（不做二次 parseLrc）
```

相关文件：

- `src/main/windows/desktopLyrics.ts`
- `src/renderer/views/DesktopLyricsWindow.vue`
- `src/renderer/App.vue`（`isDesktopLyricsWindow` / `desktopLyricsOpen`）

### 2.3 同步元数据到数据库

| API | 行为 |
|-----|------|
| `syncMusicMetadataToDb(id, updates)` | 仅 `updateAllMusic`，不写文件 |
| `batchSyncMusicMetadataToDb(ids)` | 自动 `resolveMetadataForSync`（ID3 + 文件名）后批量写库 |

相关文件：

- `src/main/services/metadataSync.ts`
- `src/shared/utils/parseFilename.ts`
- `src/renderer/components/music/EditTagModal.vue`
- `src/renderer/components/music/SongList.vue`

写库后派发 `music-metadata-updated`，各列表就地 patch。

### 2.4 依赖版本（当前）

| 包 | 版本 |
|----|------|
| Electron | ^42.7.0 |
| Vue | ^3.5.40 |
| better-sqlite3 | ^12.11.1 |
| Node.js（引擎要求） | >= 24.0.0 |

---

## 3. 验证建议

1. **同步到数据库**：找一首列表乱码、文件名正常的歌 → 编辑标签 → 同步到数据库 → 确认列表与歌单显示正确。
2. **批量同步**：本地列表批量勾选数首 → 同步到数据库 → 检查成功提示与列表刷新。
3. **桌面歌词**：开发模式打开桌面歌词 → 确认毛玻璃、描边、锁定后透明、随播放换行。
4. **进度条**：全屏播放拖动进度 → 确认有声音，歌词与桌面歌词继续跟随。
5. **无声音回归**：播放任意曲目 → 确认频谱/音量正常（尤其开启均衡器时）。

---

## 4. 相关文档

- [CHANGELOG.md](../../CHANGELOG.md) — 完整变更列表
- [README.md](../../README.md) — 产品特性与安装说明
- [CROSS_PLATFORM_BUILD.md](../CROSS_PLATFORM_BUILD.md) — 跨平台打包（macOS 仅 arm64）
- [DEVELOPMENT.md](../DEVELOPMENT.md) — 开发入门
