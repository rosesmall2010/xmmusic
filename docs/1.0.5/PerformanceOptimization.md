# XMMusic v1.0.5 性能优化需求文档

**文档版本**: v1.0.5
**创建日期**: 2025-01-XX
**项目版本**: 1.0.5

---

## 📋 目录

1. [优化目标](#优化目标)
2. [问题分析](#问题分析)
3. [优化方案](#优化方案)
4. [实施计划](#实施计划)

---

## 🎯 优化目标

### 核心目标

本次优化的重点解决两个关键性能问题：

1. **扫描音乐时的卡顿问题** - 扫描音乐文件时界面卡住，用户体验非常差
2. **列表切换时的卡顿问题** - 切换到"我喜欢"、"我的歌单"等列表时会卡住，体验非常差

### 性能指标

- **扫描性能**: 扫描大量文件时，界面保持流畅响应，不影响用户操作
- **列表加载**: 列表切换应在 200ms 内显示首屏内容，大数据量列表支持流畅滚动
- **内存占用**: 优化内存使用，避免大数据量导致的内存问题

---

## 🔍 问题分析

### 问题 1: 扫描音乐时卡顿

#### 问题表现

- 扫描音乐文件夹时，整个界面卡住
- 用户无法进行其他操作
- 进度更新不及时或不流畅

#### 根本原因

1. **文件MD5计算阻塞**
   - `calculateMD5()` 函数同步读取整个文件计算MD5
   - 大文件（如FLAC、WAV）读取时间长，阻塞主线程
   - 虽然有并发控制（concurrency: 10），但单个文件计算时间长仍会导致阻塞

2. **元数据解析阻塞**
   - `parseMetadata()` 需要解析每个文件的元数据
   - music-metadata 库的解析是IO密集型操作
   - 每个文件都需要读取文件头信息

3. **数据库插入性能**
   - 单个文件插入，没有使用批量事务
   - 每次插入都触发数据库写操作
   - WAL模式下频繁写操作可能影响性能

4. **进度更新机制**
   - 虽然有节流（100ms），但仍可能阻塞UI线程
   - IPC通信频繁，可能导致主进程和渲染进程之间的通信瓶颈

#### 影响范围

- 文件扫描服务 (`src/main/services/fileScanner.ts`)
- 数据库插入操作 (`src/main/database/db.ts`)
- IPC通信 (`src/main/ipc/handlers.ts`)
- 前端进度显示 (`src/renderer/components/music/LocalMusicList.vue`)

---

### 问题 2: 列表切换时卡顿

#### 问题表现

- 切换到"我喜欢"列表时，界面卡住
- 切换到"我的歌单"列表时，界面卡住
- 加载大歌单（几千首歌曲）时，卡顿明显

#### 根本原因

1. **一次性加载所有数据**
   - `getFavorites()` 函数一次性查询所有收藏歌曲
   - `getPlaylistSongs()` 函数一次性查询所有歌单歌曲
   - 没有分页支持，大数据量时查询和转换都很慢

2. **数据库查询性能**
   - 虽然有LEFT JOIN优化，但大数据量时查询仍慢
   - 缺少合适的索引可能导致查询性能下降
   - 查询结果转换为响应式对象过程耗时

3. **前端响应式转换**
   - 一次性将大量数据转换为Vue响应式对象
   - 大数据数组的响应式转换非常耗时
   - 虽然使用了 `shallowRef`，但初始转换仍慢

4. **没有虚拟滚动或分页**
   - `FavoritesView.vue` 没有分页加载
   - `PlaylistDetailView.vue` 虽然有分批显示，但数据库查询仍是一次性的

#### 影响范围

- 数据库查询 (`src/main/database/db.ts`)
- 列表视图组件 (`src/renderer/views/FavoritesView.vue`, `src/renderer/views/PlaylistDetailView.vue`)
- IPC通信 (`src/main/ipc/handlers.ts`)

---

## 💡 优化方案

### 方案 1: 扫描性能优化

#### 1.1 优化MD5计算策略

**问题**: 当前使用文件内容计算MD5，大文件读取时间长

**解决方案**:

**选项A: 使用文件路径MD5（推荐）**
- 根据需求，文件路径MD5已经在扫描时计算并存储
- 文件路径MD5计算速度快（字符串MD5）
- 仅在需要去重时才计算文件内容MD5

**选项B: 异步流式计算**
- 使用流式读取，分块计算MD5
- 在空闲时间进行计算，避免阻塞
- 使用 Worker 线程进行MD5计算

**实施建议**:
- 优先实施选项A，因为符合v1.0.5需求（文件路径MD5已存储）
- 文件内容MD5仅用于去重检测，可以延迟计算或后台计算

#### 1.2 优化元数据解析

**方案**:
- 批量解析：将文件收集后，批量解析元数据
- 异步处理：使用异步队列，避免阻塞主线程
- 缓存机制：缓存已解析的元数据，避免重复解析

**实施细节**:
```typescript
// 优化前：逐个解析
for (const file of files) {
  const metadata = await parseMetadata(file)
  // ...
}

// 优化后：批量并发解析
const metadataPromises = files.map(file => parseMetadata(file))
const metadataResults = await Promise.all(metadataPromises)
```

#### 1.3 批量数据库插入

**方案**: 使用事务批量插入

```typescript
// 优化前：单个插入
for (const item of items) {
  db.insertMusic(item)
}

// 优化后：批量插入
const insertBatch = db.transaction((items: MusicItem[]) => {
  const stmt = db.prepare('INSERT INTO music (...) VALUES (...)')
  for (const item of items) {
    stmt.run(...)
  }
})
insertBatch(items)
```

**效果**: 批量插入性能提升 10-50 倍

#### 1.4 优化进度更新机制

**方案**:
- 使用 `requestIdleCallback` 或 `setTimeout` 延迟进度更新
- 减少IPC通信频率，合并多个进度更新
- 使用事件节流，避免过于频繁的进度通知

**实施细节**:
```typescript
// 优化进度更新节流
const PROGRESS_UPDATE_INTERVAL = 200 // 增加到200ms
const updateProgress = debounce((progress) => {
  if (options.onProgress) {
    requestIdleCallback(() => {
      options.onProgress(progress)
    })
  }
}, PROGRESS_UPDATE_INTERVAL)
```

#### 1.5 调整并发策略

**方案**: 根据系统性能动态调整并发数

```typescript
// 优化前：固定并发数
private concurrency: number = 10

// 优化后：动态调整
private concurrency: number = Math.min(
  20, // 最大并发数
  Math.max(5, Math.floor(cpus().length * 2)) // 基于CPU核心数
)
```

---

### 方案 2: 列表加载性能优化

#### 2.1 数据库查询分页支持

**问题**: `getFavorites()` 和 `getPlaylistSongs()` 一次性加载所有数据

**解决方案**: 添加分页查询支持

```typescript
// 新增分页查询方法
getFavorites(offset: number = 0, limit: number = 50): MusicItem[] {
  const stmt = this.db!.prepare(`
    SELECT
      m.*,
      f.added_at as favorite_added_at
    FROM favorites f
    LEFT JOIN music m ON f.file_path = m.file_path
    ORDER BY f.added_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(limit, offset) as any[]
  return rows.map(row => this.mapRowToMusicItem(row))
}

getFavoritesTotalCount(): number {
  const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM favorites')
  const row = stmt.get() as { count: number }
  return row.count
}

// 同样为 getPlaylistSongs 添加分页支持
getPlaylistSongs(playlistId: number, offset: number = 0, limit: number = 50): MusicItem[] {
  const stmt = this.db!.prepare(`
    SELECT
      m.*,
      pi.position,
      pi.added_at as playlist_added_at
    FROM playlist_item pi
    LEFT JOIN music m ON pi.file_path = m.file_path
    WHERE pi.playlist_id = ?
    ORDER BY pi.position
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(playlistId, limit, offset) as any[]
  return rows.map(row => this.mapRowToMusicItem(row))
}

getPlaylistSongsTotalCount(playlistId: number): number {
  const stmt = this.db!.prepare(
    'SELECT COUNT(*) as count FROM playlist_item WHERE playlist_id = ?'
  )
  const row = stmt.get(playlistId) as { count: number }
  return row.count
}
```

#### 2.2 前端分页加载

**问题**: 前端一次性接收所有数据

**解决方案**: 实现分页加载机制

**FavoritesView.vue 优化**:
```typescript
// 优化前：一次性加载
const loadFavorites = async () => {
  songs.value = await window.electronAPI.getFavorites()
}

// 优化后：分页加载
const songs = ref<MusicItem[]>([])
const totalCount = ref(0)
const loading = ref(false)
const currentOffset = ref(0)
const pageSize = 50

const loadFavorites = async (force: boolean = false) => {
  if (loading.value) return

  loading.value = true
  try {
    if (force || currentOffset.value === 0) {
      // 获取总数
      totalCount.value = await window.electronAPI.getFavoritesTotalCount()
      // 重置列表
      songs.value = []
      currentOffset.value = 0
    }

    // 加载当前页
    const items = await window.electronAPI.getFavorites(currentOffset.value, pageSize)
    songs.value.push(...items)
    currentOffset.value += items.length
  } finally {
    loading.value = false
  }
}

// 首屏加载
onMounted(async () => {
  await loadFavorites(true)
  // 后台预加载下一页
  startBackgroundLoading()
})

// 滚动加载更多
const loadMore = async () => {
  if (currentOffset.value < totalCount.value && !loading.value) {
    await loadFavorites()
  }
}
```

**PlaylistDetailView.vue 优化**:
- 类似地，将前端分批显示改为真正的后端分页
- 从数据库层面支持分页查询

#### 2.3 优化数据库索引

**方案**: 为列表查询添加合适的索引

```sql
-- favorites 表索引优化
CREATE INDEX IF NOT EXISTS idx_favorites_added_at_desc ON favorites(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_file_path ON favorites(file_path);

-- playlist_item 表索引优化
CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist_position ON playlist_item(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_playlist_item_file_path ON playlist_item(file_path);

-- music 表索引（已存在，确保有效）
CREATE INDEX IF NOT EXISTS idx_music_file_path ON music(file_path);
```

#### 2.4 优化响应式转换

**方案**: 使用 `shallowRef` 和分批转换

```typescript
// 优化前：一次性转换
songs.value = allSongs // 大数组的响应式转换很慢

// 优化后：分批转换
const batchSize = 100
for (let i = 0; i < allSongs.length; i += batchSize) {
  const batch = allSongs.slice(i, i + batchSize)
  songs.value.push(...batch)
  // 让出控制权
  await new Promise(resolve => setTimeout(resolve, 0))
}
```

#### 2.5 使用虚拟滚动

**方案**: 对于大列表，使用虚拟滚动组件

- 只渲染可见区域的列表项
- 支持流畅滚动，即使有成千上万条数据
- 使用 `@tanstack/vue-virtual` 或自定义虚拟滚动

---

## 📅 实施计划

### Phase 1: 扫描性能优化（优先级：高）

**目标**: 解决扫描时卡顿问题

1. ✅ 明确优化需求和问题分析
2. ⬜ 优化MD5计算策略（使用文件路径MD5，延迟文件内容MD5计算）
3. ⬜ 实现批量数据库插入（使用事务）
4. ⬜ 优化元数据解析（批量并发处理）
5. ⬜ 优化进度更新机制（减少IPC通信频率）
6. ⬜ 调整并发策略（动态并发数）
7. ⬜ 测试和验证扫描性能

**预计时间**: 2-3天

---

### Phase 2: 列表加载性能优化（优先级：高）

**目标**: 解决列表切换时卡顿问题

1. ✅ 明确优化需求和问题分析
2. ⬜ 为数据库查询添加分页支持（`getFavorites`, `getPlaylistSongs`）
3. ⬜ 优化数据库索引
4. ⬜ 更新IPC接口，支持分页参数
5. ⬜ 优化 `FavoritesView.vue`，实现分页加载
6. ⬜ 优化 `PlaylistDetailView.vue`，实现分页加载
7. ⬜ 优化响应式转换（分批处理）
8. ⬜ 测试和验证列表加载性能

**预计时间**: 2-3天

---

### Phase 3: 高级优化（优先级：中）

**目标**: 进一步优化性能体验

1. ⬜ 实现虚拟滚动（大列表场景）
2. ⬜ 实现数据缓存机制
3. ⬜ 优化封面图片加载（懒加载）
4. ⬜ 性能监控和日志

**预计时间**: 1-2天

---

## 🔧 技术细节

### 扫描优化实现要点

1. **文件路径MD5优先**
   ```typescript
   // 在扫描时，先计算文件路径MD5（快速）
   const filePathMd5 = calculateFilePathMD5(filePath)

   // 文件内容MD5延迟计算（仅用于去重）
   // 可以在后台任务中计算，或按需计算
   ```

2. **批量插入事务**
   ```typescript
   const insertBatch = db.transaction((items: MusicItem[]) => {
     const stmt = db.prepare('INSERT INTO music (...) VALUES (...)')
     for (const item of items) {
       stmt.run(...)
     }
   })

   // 累积到一定数量后批量插入（如每100条）
   if (batch.length >= 100) {
     insertBatch(batch)
     batch = []
   }
   ```

3. **进度更新优化**
   ```typescript
   // 使用防抖函数，合并多个进度更新
   const debouncedProgress = debounce((progress) => {
     if (options.onProgress) {
       requestIdleCallback(() => {
         options.onProgress(progress)
       })
     }
   }, 200)
   ```

### 列表加载优化实现要点

1. **分页查询**
   ```typescript
   // 后端：支持 offset 和 limit
   getFavorites(offset: number, limit: number): MusicItem[]

   // 前端：分批加载
   const loadPage = async (page: number) => {
     const offset = page * pageSize
     const items = await window.electronAPI.getFavorites(offset, pageSize)
     songs.value.push(...items)
   }
   ```

2. **首屏快速显示**
   ```typescript
   // 先加载第一页，立即显示
   await loadPage(0) // 50条，快速显示

   // 后台继续加载
   startBackgroundLoading() // 预加载后续页面
   ```

3. **虚拟滚动（可选）**
   ```vue
   <template>
     <VirtualList
       :items="songs"
       :item-height="60"
       v-slot="{ item }"
     >
       <SongListItem :song="item" />
     </VirtualList>
   </template>
   ```

---

## 📊 性能指标

### 扫描性能目标

- **首屏响应**: 扫描开始后，100ms内显示进度界面
- **界面流畅度**: 扫描过程中，界面保持60fps，用户可以继续操作
- **进度更新**: 进度更新频率合理（200ms一次），不影响性能
- **大文件处理**: 处理单个大文件（100MB+）时，不阻塞其他文件扫描

### 列表加载性能目标

- **首屏显示**: 列表切换后，200ms内显示首屏内容（前50条）
- **滚动流畅度**: 大列表（1000+条）滚动时保持60fps
- **内存占用**: 只加载可见区域数据，内存占用控制在合理范围
- **加载体验**: 用户感知不到分批加载的过程

---

## 🧪 测试策略

### 扫描性能测试

1. **小规模测试**（100首歌曲）
   - 验证扫描功能正常
   - 验证进度更新流畅

2. **中规模测试**（1000首歌曲）
   - 验证界面不卡顿
   - 验证内存占用合理

3. **大规模测试**（10000+首歌曲）
   - 验证长时间扫描的稳定性
   - 验证批量插入性能

### 列表加载性能测试

1. **小列表测试**（<100首）
   - 验证加载速度
   - 验证功能正常

2. **中列表测试**（100-1000首）
   - 验证分页加载
   - 验证滚动流畅度

3. **大列表测试**（1000+首）
   - 验证虚拟滚动（如实现）
   - 验证内存占用
   - 验证长时间使用的稳定性

---

## 📝 注意事项

1. **向后兼容**: 优化过程中保持向后兼容，不影响现有功能
2. **错误处理**: 优化后的代码需要完善的错误处理和回退机制
3. **用户体验**: 优化过程中，确保用户能够感知到性能提升
4. **测试覆盖**: 充分测试各种场景，确保优化后功能正常

---

## 🔗 相关文档

- [需求分析文档](./RequirementsAnalysis.md)
- [系统架构文档](./SystemArchitecture.md)
- [数据库设计文档](../DATABASE_DESIGN.md)
