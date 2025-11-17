# xmmusic API 接口设计文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: API 接口设计文档

---

## 📋 文档概述

本文档定义了 xmmusic 应用的 IPC (Inter-Process Communication) API 接口，用于主进程和渲染进程之间的通信。

---

## 🔌 IPC 通信架构

### 通信模式

**请求-响应模式** (Request-Response)
- 渲染进程发起请求
- 主进程处理并返回结果
- 使用 `ipcMain.handle()` 和 `ipcRenderer.invoke()`

**事件推送模式** (Event Push)
- 主进程主动推送事件
- 渲染进程监听事件
- 使用 `webContents.send()` 和 `ipcRenderer.on()`

---

## 📡 API 接口分类

### 1. 窗口控制 API

#### 1.1 minimizeWindow
**描述**: 最小化窗口

**请求**:
```typescript
await window.electronAPI.minimizeWindow()
```

**响应**: `Promise<void>`

**实现**:
```typescript
ipcMain.handle('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})
```

---

#### 1.2 maximizeWindow
**描述**: 最大化/还原窗口

**请求**:
```typescript
await window.electronAPI.maximizeWindow()
```

**响应**: `Promise<void>`

**实现**:
```typescript
ipcMain.handle('window-maximize', () => {
  const window = BrowserWindow.getFocusedWindow()
  if (window?.isMaximized()) {
    window.unmaximize()
  } else {
    window?.maximize()
  }
})
```

---

#### 1.3 closeWindow
**描述**: 关闭窗口

**请求**:
```typescript
await window.electronAPI.closeWindow()
```

**响应**: `Promise<void>`

---

### 2. 文件操作 API

#### 2.1 selectMusicFolder
**描述**: 选择音乐文件夹

**请求**:
```typescript
const folders = await window.electronAPI.selectMusicFolder()
```

**响应**: `Promise<string[]>`

**返回**: 选中的文件夹路径数组

---

#### 2.2 scanMusicFolder
**描述**: 扫描音乐文件夹

**请求**:
```typescript
const result = await window.electronAPI.scanMusicFolder(folderPath)
```

**参数**:
- `folderPath: string` - 文件夹路径

**响应**: `Promise<ScanResult>`

**返回类型**:
```typescript
interface ScanResult {
  success: boolean
  count: number
  errors: string[]
  duration: number // 毫秒
}
```

**事件推送**:
- `scan-progress`: 扫描进度
  ```typescript
  {
    current: number
    total: number
    currentFile: string
    speed: number // 文件/秒
  }
  ```

---

#### 2.3 exportMusicFiles
**描述**: 导出音乐文件到指定目录

**请求**:
```typescript
const result = await window.electronAPI.exportMusicFiles(musicList, options)
```

**参数**:
- `musicList: MusicItem[]` - 要导出的音乐列表
- `options: ExportOptions` - 导出选项

**选项类型**:
```typescript
interface ExportOptions {
  targetPath: string
  organization: 'flat' | 'by-artist' | 'by-album' | 'original'
  conflictResolution: 'skip' | 'overwrite' | 'rename'
}
```

**响应**: `Promise<ExportResult>`

**返回类型**:
```typescript
interface ExportResult {
  success: number
  failed: number
  skipped: number
  errors: string[]
}
```

**事件推送**:
- `export-progress`: 导出进度

---

### 3. 数据库操作 API

#### 3.1 getMusicList
**描述**: 获取音乐列表（分页）

**请求**:
```typescript
const musicList = await window.electronAPI.getMusicList(offset, limit)
```

**参数**:
- `offset: number` - 偏移量
- `limit: number` - 每页数量

**响应**: `Promise<MusicItem[]>`

**返回类型**:
```typescript
interface MusicItem {
  id: number
  title: string
  artist: string
  album: string
  year: number
  genre: string
  filePath: string
  fileName: string
  fileSize: number
  fileHash: string
  duration: number
  bitrate: number
  sampleRate: number
  channels: number
  coverPath: string | null
  playCount: number
  lastPlayedAt: string | null
  favorite: boolean
  addedAt: string
  isCorrupted: boolean
  isDuplicate: boolean
  duplicateCount?: number
}
```

---

#### 3.2 getMusicTotalCount
**描述**: 获取音乐总数

**请求**:
```typescript
const count = await window.electronAPI.getMusicTotalCount()
```

**响应**: `Promise<number>`

---

#### 3.3 searchMusic
**描述**: 搜索音乐

**请求**:
```typescript
const results = await window.electronAPI.searchMusic(query)
```

**参数**:
- `query: string` - 搜索关键词

**响应**: `Promise<MusicItem[]>`

**性能要求**: < 100ms

---

#### 3.4 getMusicByGenre
**描述**: 按流派获取音乐

**请求**:
```typescript
const musicByGenre = await window.electronAPI.getMusicByGenre()
```

**响应**: `Promise<GenreGroup[]>`

**返回类型**:
```typescript
interface GenreGroup {
  genre: string
  count: number
  totalDuration: number
  songs: MusicItem[]
}
```

---

#### 3.5 findSimilarSongs
**描述**: 查找相似歌曲

**请求**:
```typescript
const similarSongs = await window.electronAPI.findSimilarSongs(musicId)
```

**参数**:
- `musicId: number` - 音乐 ID

**响应**: `Promise<SimilarSong[]>`

**返回类型**:
```typescript
interface SimilarSong {
  music: MusicItem
  similarity: number // 0-1
}
```

---

#### 3.6 getDuplicateFiles
**描述**: 获取重复文件列表

**请求**:
```typescript
const duplicates = await window.electronAPI.getDuplicateFiles(fileHash)
```

**参数**:
- `fileHash: string` - 文件 MD5 哈希值

**响应**: `Promise<MusicItem[]>`

---

#### 3.7 deleteMusicFile
**描述**: 删除音乐文件

**请求**:
```typescript
await window.electronAPI.deleteMusicFile(id)
```

**参数**:
- `id: number` - 音乐 ID

**响应**: `Promise<void>`

**注意**: 会同时删除文件系统和数据库中的记录

---

### 4. 播放列表 API

#### 4.1 createPlaylist
**描述**: 创建播放列表

**请求**:
```typescript
const playlistId = await window.electronAPI.createPlaylist(name, description?)
```

**参数**:
- `name: string` - 播放列表名称
- `description?: string` - 描述（可选）

**响应**: `Promise<number>` - 播放列表 ID

---

#### 4.2 getPlaylists
**描述**: 获取所有播放列表

**请求**:
```typescript
const playlists = await window.electronAPI.getPlaylists()
```

**响应**: `Promise<Playlist[]>`

**返回类型**:
```typescript
interface Playlist {
  id: number
  name: string
  description: string | null
  coverPath: string | null
  songCount: number
  totalDuration: number
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
}
```

---

#### 4.3 getPlaylistSongs
**描述**: 获取播放列表中的歌曲

**请求**:
```typescript
const songs = await window.electronAPI.getPlaylistSongs(playlistId)
```

**参数**:
- `playlistId: number` - 播放列表 ID

**响应**: `Promise<MusicItem[]>`

---

#### 4.4 addToPlaylist
**描述**: 添加歌曲到播放列表

**请求**:
```typescript
await window.electronAPI.addToPlaylist(playlistId, musicId)
```

**参数**:
- `playlistId: number` - 播放列表 ID
- `musicId: number` - 音乐 ID

**响应**: `Promise<void>`

---

#### 4.5 removeFromPlaylist
**描述**: 从播放列表移除歌曲

**请求**:
```typescript
await window.electronAPI.removeFromPlaylist(playlistId, musicId)
```

**参数**:
- `playlistId: number` - 播放列表 ID
- `musicId: number` - 音乐 ID

**响应**: `Promise<void>`

---

#### 4.6 updatePlaylistOrder
**描述**: 更新播放列表顺序

**请求**:
```typescript
await window.electronAPI.updatePlaylistOrder(playlistId, musicIds)
```

**参数**:
- `playlistId: number` - 播放列表 ID
- `musicIds: number[]` - 音乐 ID 数组（新顺序）

**响应**: `Promise<void>`

---

#### 4.7 deletePlaylist
**描述**: 删除播放列表

**请求**:
```typescript
await window.electronAPI.deletePlaylist(playlistId)
```

**参数**:
- `playlistId: number` - 播放列表 ID

**响应**: `Promise<void>`

---

#### 4.8 exportPlaylist
**描述**: 导出播放列表

**请求**:
```typescript
const filePath = await window.electronAPI.exportPlaylist(playlistId, format)
```

**参数**:
- `playlistId: number` - 播放列表 ID
- `format: 'm3u' | 'json'` - 导出格式

**响应**: `Promise<string>` - 导出文件路径

---

#### 4.9 importPlaylist
**描述**: 导入播放列表

**请求**:
```typescript
const playlistId = await window.electronAPI.importPlaylist(filePath)
```

**参数**:
- `filePath: string` - 播放列表文件路径

**响应**: `Promise<number>` - 新创建的播放列表 ID

---

### 5. ID3 修复 API

#### 5.1 detectID3Encoding
**描述**: 检测 ID3 标签编码

**请求**:
```typescript
const encodings = await window.electronAPI.detectID3Encoding(filePath)
```

**参数**:
- `filePath: string` - 文件路径

**响应**: `Promise<EncodingResult[]>`

**返回类型**:
```typescript
interface EncodingResult {
  encoding: string // 'GBK', 'GB2312', 'Big5', 'UTF-8', etc.
  confidence: number // 0-1
  preview: {
    title: string
    artist: string
    album: string
  }
}
```

---

#### 5.2 previewID3Fix
**描述**: 预览 ID3 修复结果

**请求**:
```typescript
const preview = await window.electronAPI.previewID3Fix(filePath, encoding)
```

**参数**:
- `filePath: string` - 文件路径
- `encoding: string` - 源编码

**响应**: `Promise<ID3Preview>`

**返回类型**:
```typescript
interface ID3Preview {
  original: {
    title: string
    artist: string
    album: string
  }
  fixed: {
    title: string
    artist: string
    album: string
  }
}
```

---

#### 5.3 fixID3Tags
**描述**: 修复 ID3 标签

**请求**:
```typescript
await window.electronAPI.fixID3Tags(options)
```

**参数**:
```typescript
interface FixID3Options {
  filePath: string
  encoding: string
  fields: ('title' | 'artist' | 'album' | 'all')[]
  backup: boolean
}
```

**响应**: `Promise<void>`

**注意**: 如果 `backup: true`，会先备份原始文件

---

#### 5.4 batchFixID3Tags
**描述**: 批量修复 ID3 标签

**请求**:
```typescript
const result = await window.electronAPI.batchFixID3Tags(options)
```

**参数**:
```typescript
interface BatchFixID3Options {
  filePaths: string[]
  encoding: string
  fields: ('title' | 'artist' | 'album' | 'all')[]
  backup: boolean
}
```

**响应**: `Promise<BatchFixResult>`

**返回类型**:
```typescript
interface BatchFixResult {
  success: number
  failed: number
  errors: Array<{ filePath: string; error: string }>
}
```

**事件推送**:
- `batch-fix-progress`: 批量修复进度

---

### 6. 设置 API

#### 6.1 getSettings
**描述**: 获取应用设置

**请求**:
```typescript
const settings = await window.electronAPI.getSettings()
```

**响应**: `Promise<Settings>`

**返回类型**:
```typescript
interface Settings {
  ui: {
    theme: 'light' | 'dark' | 'system'
    language: 'zh' | 'en'
  }
  audio: {
    volume: number // 0-100
    playMode: 'sequential' | 'random' | 'repeat' | 'single'
  }
  library: {
    autoScan: boolean
    scanOnStartup: boolean
  }
  shortcuts: {
    [key: string]: string
  }
  backup: {
    id3BackupPath: string
    databaseBackupPath: string
  }
}
```

---

#### 6.2 saveSettings
**描述**: 保存应用设置

**请求**:
```typescript
await window.electronAPI.saveSettings(settings)
```

**参数**:
- `settings: Partial<Settings>` - 设置对象（部分更新）

**响应**: `Promise<void>`

---

### 7. 数据库备份 API

#### 7.1 backupDatabase
**描述**: 备份数据库

**请求**:
```typescript
const backupPath = await window.electronAPI.backupDatabase(targetPath?)
```

**参数**:
- `targetPath?: string` - 备份目标路径（可选，默认用户选择）

**响应**: `Promise<string>` - 备份文件路径

---

#### 7.2 restoreDatabase
**描述**: 恢复数据库

**请求**:
```typescript
await window.electronAPI.restoreDatabase(backupPath)
```

**参数**:
- `backupPath: string` - 备份文件路径

**响应**: `Promise<void>`

**警告**: 会覆盖当前数据库

---

### 8. Excel 导出 API

#### 8.1 exportToExcel
**描述**: 导出音乐列表到 Excel

**请求**:
```typescript
const filePath = await window.electronAPI.exportToExcel(options)
```

**参数**:
```typescript
interface ExcelExportOptions {
  musicList: MusicItem[] | 'all' | 'current'
  columns: string[] // 要导出的列
  columnOrder: string[] // 列顺序
  format: 'xlsx' | 'csv'
  filePath?: string // 保存路径（可选）
}
```

**响应**: `Promise<string>` - 导出文件路径

---

### 9. 目录管理 API

#### 9.1 getMusicDirectories
**描述**: 获取音乐目录列表

**请求**:
```typescript
const directories = await window.electronAPI.getMusicDirectories()
```

**响应**: `Promise<MusicDirectory[]>`

**返回类型**:
```typescript
interface MusicDirectory {
  id: string
  path: string
  name: string
  enabled: boolean
  autoScan: boolean
  scanDepth: 'current' | 'recursive'
  fileTypes: string[]
  excludePaths: string[]
  priority: number
  songCount: number
  lastScannedAt: string | null
  createdAt: string
}
```

---

#### 9.2 addMusicDirectory
**描述**: 添加音乐目录

**请求**:
```typescript
const directoryId = await window.electronAPI.addMusicDirectory(directory)
```

**参数**:
```typescript
interface MusicDirectoryInput {
  path: string
  name?: string
  enabled?: boolean
  autoScan?: boolean
  scanDepth?: 'current' | 'recursive'
  fileTypes?: string[]
  excludePaths?: string[]
  priority?: number
}
```

**响应**: `Promise<string>` - 目录 ID

---

#### 9.3 updateMusicDirectory
**描述**: 更新音乐目录

**请求**:
```typescript
await window.electronAPI.updateMusicDirectory(id, updates)
```

**参数**:
- `id: string` - 目录 ID
- `updates: Partial<MusicDirectoryInput>` - 更新内容

**响应**: `Promise<void>`

---

#### 9.4 deleteMusicDirectory
**描述**: 删除音乐目录

**请求**:
```typescript
await window.electronAPI.deleteMusicDirectory(id)
```

**参数**:
- `id: string` - 目录 ID

**响应**: `Promise<void>`

---

### 10. 收藏和历史 API

#### 10.1 toggleFavorite
**描述**: 切换收藏状态

**请求**:
```typescript
await window.electronAPI.toggleFavorite(musicId)
```

**参数**:
- `musicId: number` - 音乐 ID

**响应**: `Promise<void>`

---

#### 10.2 getFavorites
**描述**: 获取收藏列表

**请求**:
```typescript
const favorites = await window.electronAPI.getFavorites()
```

**响应**: `Promise<MusicItem[]>`

---

#### 10.3 getPlayHistory
**描述**: 获取播放历史

**请求**:
```typescript
const history = await window.electronAPI.getPlayHistory(limit?)
```

**参数**:
- `limit?: number` - 返回数量（默认 50）

**响应**: `Promise<MusicItem[]>`

---

#### 10.4 recordPlay
**描述**: 记录播放

**请求**:
```typescript
await window.electronAPI.recordPlay(musicId)
```

**参数**:
- `musicId: number` - 音乐 ID

**响应**: `Promise<void>`

**注意**: 自动调用，无需手动调用

---

## 📡 事件推送 API

### 事件列表

#### scan-progress
**描述**: 扫描进度事件

**数据**:
```typescript
{
  current: number
  total: number
  currentFile: string
  speed: number
  percentage: number
}
```

---

#### export-progress
**描述**: 导出进度事件

**数据**:
```typescript
{
  current: number
  total: number
  currentFile: string
  percentage: number
}
```

---

#### batch-fix-progress
**描述**: 批量修复进度事件

**数据**:
```typescript
{
  current: number
  total: number
  currentFile: string
  percentage: number
}
```

---

#### file-watcher-change
**描述**: 文件监控变化事件

**数据**:
```typescript
{
  type: 'add' | 'delete' | 'modify'
  path: string
  directoryId: string
}
```

---

## 🔒 错误处理

### 错误类型

```typescript
interface APIError {
  code: string
  message: string
  details?: any
}
```

### 错误代码

- `FILE_NOT_FOUND`: 文件不存在
- `PERMISSION_DENIED`: 权限不足
- `DATABASE_ERROR`: 数据库错误
- `INVALID_INPUT`: 输入无效
- `OPERATION_FAILED`: 操作失败

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) - 技术设计文档

---

**文档状态**: ✅ 已完成
**API 总数**: 50+ 个接口
**下一步**: 技术选型建议
