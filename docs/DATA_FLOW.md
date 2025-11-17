# xmmusic 数据流设计文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 数据流设计文档

---

## 📋 文档概述

本文档详细描述了 xmmusic 应用中的数据流，包括用户操作流程、文件扫描流程、播放流程等。

---

## 🔄 核心数据流

### 1. 用户操作数据流

```
用户点击播放
    ↓
Vue 组件 (MusicListItem.vue)
    ↓
触发事件 @click="handlePlay(music)"
    ↓
usePlayer Composable
    ↓
playerStore.play(music)
    ↓
IPC 调用 window.electronAPI.recordPlay(music.id)
    ↓
Preload Script (contextBridge)
    ↓
Main Process IPC Handler
    ↓
Database Service
    ↓
SQLite Database (更新播放历史)
    ↓
响应返回
    ↓
UI 更新 (播放状态)
```

---

### 2. 文件扫描数据流

```
用户触发扫描
    ↓
SettingsView.vue → 点击"扫描"
    ↓
IPC: scan-music-folder
    ↓
Main Process: FileScanner Service
    ↓
┌─────────────────────────────────┐
│  1. 收集文件列表                 │
│  2. 并发处理 (10 个并发)        │
│     - 计算 MD5                  │
│     - 解析元数据                │
│     - 检测损坏                  │
│  3. 批量插入数据库               │
│  4. 进度回调 (IPC 事件)          │
└─────────────────────────────────┘
    ↓
IPC 事件: scan-progress
    ↓
Renderer Process: 监听事件
    ↓
UI 更新: 显示扫描进度
    ↓
扫描完成: 显示结果统计
```

---

### 3. 搜索数据流

```
用户输入搜索关键词
    ↓
SearchInput.vue
    ↓
防抖处理 (300ms)
    ↓
useSearch Composable
    ↓
musicStore.searchMusic(query)
    ↓
IPC: search-music
    ↓
Main Process: Database Service
    ↓
FTS5 全文搜索
    ↓
返回搜索结果
    ↓
musicStore.searchResults 更新
    ↓
UI 更新: 显示搜索结果
```

---

### 4. 音乐列表加载数据流

```
组件挂载 (MusicListView.vue)
    ↓
useMusicList Composable
    ↓
musicStore.loadMusic(0, 50)
    ↓
IPC: get-music-list(0, 50)
    ↓
Main Process: Database Service
    ↓
SQL 查询: SELECT * FROM music LIMIT 50 OFFSET 0
    ↓
返回音乐列表
    ↓
musicStore.musicList 更新
    ↓
VirtualScroller 渲染
    ↓
用户滚动到底部
    ↓
触发 loadMore()
    ↓
加载下一页 (50, 50)
    ↓
追加到列表
```

---

### 5. ID3 修复数据流

```
用户选择文件 → 右键 → 修复 ID3
    ↓
ID3FixDialog.vue 打开
    ↓
IPC: detect-id3-encoding(filePath)
    ↓
Main Process: ID3EncodingFixer Service
    ↓
读取 ID3 标签
    ↓
尝试多种编码 (GBK, GB2312, Big5, UTF-8)
    ↓
返回编码结果列表
    ↓
UI 显示: 编码选择 + 预览
    ↓
用户选择编码 → 点击"修复"
    ↓
IPC: fix-id3-tags(options)
    ↓
Main Process: ID3EncodingFixer Service
    ↓
┌─────────────────────────────────┐
│  1. 备份原始文件 (如需要)       │
│  2. 读取原始标签                 │
│  3. 编码转换                     │
│  4. 写入新标签                   │
│  5. 更新数据库元数据             │
└─────────────────────────────────┘
    ↓
响应返回: 修复成功
    ↓
UI 更新: 显示修复后的标签
```

---

### 6. 文件监控数据流

```
应用启动
    ↓
Main Process: FileWatcher Service
    ↓
读取已配置的目录列表
    ↓
为每个启用的目录创建 watcher
    ↓
chokidar 监控文件变化
    ↓
文件变化事件 (add/change/unlink)
    ↓
防抖处理 (500ms)
    ↓
累积变化到队列
    ↓
批量处理
    ↓
┌─────────────────────────────────┐
│  删除: 从数据库删除记录         │
│  新增/修改: 触发增量扫描         │
└─────────────────────────────────┘
    ↓
IPC 事件: file-watcher-change
    ↓
Renderer Process: 监听事件
    ↓
UI 更新: 显示文件变化通知
```

---

### 7. 播放列表管理数据流

```
用户创建播放列表
    ↓
PlaylistView.vue → 点击"新建"
    ↓
输入名称和描述
    ↓
IPC: create-playlist(name, description)
    ↓
Main Process: Database Service
    ↓
INSERT INTO playlist ...
    ↓
返回播放列表 ID
    ↓
playlistStore.playlists 更新
    ↓
UI 更新: 显示新播放列表
    ↓
用户添加歌曲
    ↓
拖拽或右键 → 添加到播放列表
    ↓
IPC: add-to-playlist(playlistId, musicId)
    ↓
Main Process: Database Service
    ↓
INSERT INTO playlist_item ...
    ↓
响应返回
    ↓
UI 更新: 播放列表显示新歌曲
```

---

### 8. 去重显示数据流

```
音乐列表加载
    ↓
Database Query: SELECT * FROM music
    ↓
查询重复文件组
    ↓
SELECT file_hash, COUNT(*) as count
FROM music
GROUP BY file_hash
HAVING COUNT(*) > 1
    ↓
标记代表文件 (每个组第一个)
    ↓
标记其他为重复 (is_duplicate = 1)
    ↓
返回列表 (仅显示代表文件)
    ↓
UI 显示: 显示重复数量徽章
    ↓
用户点击重复数量
    ↓
IPC: get-duplicate-files(fileHash)
    ↓
Main Process: Database Service
    ↓
SELECT * FROM music WHERE file_hash = ?
    ↓
返回重复文件列表
    ↓
DuplicateFileDialog.vue 显示
    ↓
用户选择删除
    ↓
IPC: delete-music-file(id)
    ↓
删除文件 + 数据库记录
```

---

## 📊 数据流图

### 整体数据流

```
┌─────────────┐
│  用户操作   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Vue Components │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Pinia Stores   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  IPC (electronAPI)│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Main Process   │
│  - Services      │
│  - Database     │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  SQLite / FS    │
└─────────────────┘
```

---

## 🔄 状态同步流程

### 播放状态同步

```
Howler.js 播放事件
    ↓
usePlayer Composable
    ↓
playerStore.isPlaying = true
    ↓
所有使用 playerStore 的组件自动更新
    ↓
Footer.vue: 播放按钮状态更新
    ↓
MusicListItem.vue: 当前播放高亮
```

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [MODULE_DESIGN.md](./MODULE_DESIGN.md) - 模块设计文档

---

**文档状态**: ✅ 已完成
