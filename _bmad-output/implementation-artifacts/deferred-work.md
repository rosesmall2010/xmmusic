# Deferred Work

## Deferred from: code review (2026-07-22)

- **local-file 后缀 Range（`bytes=-N`）与非法 Range**：当前 seek 主路径使用 `bytes=N-`，已可用；完整 RFC 7233 与空文件 `size===0` 的 416 边界留待后续补测试与实现。
- **批量同步主进程串行阻塞**：大批量选中时可能卡顿；需分批/进度/可取消，属性能增强而非本次功能正确性阻塞。
- **UNC 网络盘路径**：`local-file://media` 对 `\\server\share` 还原可能错误；常见音乐库多为本地盘，暂缓。
- **批量同步「无实质变化仍计 success」**：需对比更新前后字段并引入 skipped；属体验优化。
- **批量同步主进程无并发锁**：UI 已有 `batchSyncing`，极端竞态概率低。
- **开发模式桌面歌词 did-fail-load 无重试**：有意简化为打日志；可按需恢复有限次重试。
- **编辑标签表单用歌手名预填专辑**：`EditTagModal.loadMusicData` 既有行为，非本次引入；与批量写库侧「专辑勿用歌手兜底」分开处理。
