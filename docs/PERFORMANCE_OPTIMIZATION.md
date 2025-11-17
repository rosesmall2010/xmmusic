# xmmusic 性能优化方案

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 性能优化文档

---

## 📋 文档概述

本文档详细说明了 xmmusic 应用的性能优化方案，包括数据库优化、UI 优化、文件操作优化等，确保支持 10 万+ 音乐库的流畅运行。

---

## 🎯 性能目标

### 关键性能指标 (KPI)

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 扫描速度 | 10 万首 < 30 分钟 | 自动化测试 |
| 搜索响应 | < 100ms | 性能测试工具 |
| 列表滚动 | 60fps | 浏览器性能工具 |
| 内存占用 | < 200MB (10 万首) | 系统监控工具 |
| 文件监控 | 100 个变化 < 30 秒 | 自动化测试 |
| CPU 占用 | < 30% (文件监控时) | 系统监控工具 |

---

## 🗄️ 数据库性能优化

### 1. WAL 模式

**优化**: 启用 WAL (Write-Ahead Logging) 模式

**实现**:
```sql
PRAGMA journal_mode = WAL;
```

**效果**:
- ✅ 提升并发读写性能
- ✅ 减少锁竞争
- ✅ 提升写入性能

**性能提升**: 写入性能提升 2-3 倍

---

### 2. 索引优化

#### 2.1 主键索引
**优化**: 所有表使用 INTEGER PRIMARY KEY

**效果**: 自动创建索引，查询快速

#### 2.2 复合索引
**优化**: 创建复合索引

**实现**:
```sql
CREATE INDEX idx_music_artist_title ON music(artist, title);
CREATE INDEX idx_music_album_year ON music(album, year);
CREATE INDEX idx_music_genre ON music(genre);
CREATE INDEX idx_music_file_hash ON music(file_hash);
```

**效果**: 多条件查询性能提升 10-100 倍

#### 2.3 全文搜索索引 (FTS5)
**优化**: 使用 FTS5 虚拟表

**实现**:
```sql
CREATE VIRTUAL TABLE music_fts USING fts5(
  title, artist, album, genre,
  content='music',
  content_rowid='id'
);
```

**效果**: 全文搜索性能提升 100-1000 倍

---

### 3. 查询优化

#### 3.1 分页查询
**优化**: 使用 LIMIT 和 OFFSET

**实现**:
```typescript
const getMusicList = (offset: number, limit: number) => {
  return db.prepare(`
    SELECT * FROM music
    ORDER BY added_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
};
```

**效果**: 避免加载全部数据，内存占用降低

#### 3.2 批量操作
**优化**: 使用事务批量插入

**实现**:
```typescript
const insertMany = db.transaction((items: MusicItem[]) => {
  const stmt = db.prepare('INSERT INTO music (...) VALUES (...)');
  for (const item of items) {
    stmt.run(item);
  }
});
insertMany(musicList);
```

**效果**: 批量插入性能提升 10-50 倍

#### 3.3 预编译语句
**优化**: 使用预编译语句

**实现**:
```typescript
const getMusicStmt = db.prepare('SELECT * FROM music WHERE id = ?');
const music = getMusicStmt.get(id);
```

**效果**: 重复查询性能提升 2-5 倍

---

### 4. 数据库配置优化

**优化**: 调整 SQLite 配置

**实现**:
```sql
PRAGMA cache_size = -32000;  -- 32MB 缓存
PRAGMA temp_store = MEMORY;  -- 临时表使用内存
PRAGMA mmap_size = 268435456;  -- 256MB 内存映射
PRAGMA page_size = 4096;  -- 4KB 页大小
```

**效果**: 整体性能提升 20-30%

---

## 🎨 UI 性能优化

### 1. 虚拟滚动

**优化**: 使用 @tanstack/vue-virtual

**实现**:
```vue
<template>
  <RecycleScroller
    :items="musicList"
    :item-size="60"
    key-field="id"
    v-slot="{ item }"
  >
    <MusicListItem :music="item" />
  </RecycleScroller>
</template>
```

**效果**:
- ✅ 仅渲染可见项
- ✅ 支持 10 万+ 数据流畅滚动
- ✅ 内存占用降低 90%+

**性能提升**: 列表滚动从卡顿到 60fps

---

### 2. 懒加载

**优化**: 分页加载数据

**实现**:
```typescript
const loadMore = async () => {
  if (loading.value || hasMore.value === false) return;

  loading.value = true;
  const newItems = await getMusicList(offset.value, pageSize);
  musicList.value.push(...newItems);
  offset.value += pageSize;
  loading.value = false;
};
```

**效果**:
- ✅ 初始加载快速
- ✅ 内存占用可控
- ✅ 用户体验流畅

---

### 3. 防抖和节流

#### 3.1 搜索防抖
**优化**: 搜索输入防抖 300ms

**实现**:
```typescript
const debouncedSearch = debounce(async (query: string) => {
  const results = await searchMusic(query);
  searchResults.value = results;
}, 300);
```

**效果**: 减少不必要的搜索请求，性能提升

#### 3.2 滚动节流
**优化**: 滚动事件节流

**实现**:
```typescript
const throttledScroll = throttle((event: Event) => {
  // 处理滚动
}, 16); // 60fps
```

**效果**: 减少事件处理，性能提升

---

### 4. 组件优化

#### 4.1 组件懒加载
**优化**: 路由懒加载

**实现**:
```typescript
const SettingsView = () => import('@/components/Settings/SettingsView.vue');
```

**效果**: 减少初始加载时间

#### 4.2 计算属性缓存
**优化**: 使用 computed 缓存计算结果

**实现**:
```typescript
const filteredMusic = computed(() => {
  return musicList.value.filter(music => {
    // 过滤逻辑
  });
});
```

**效果**: 避免重复计算，性能提升

#### 4.3 v-show vs v-if
**优化**: 频繁切换使用 v-show

**实现**:
```vue
<div v-show="isVisible">内容</div> <!-- 频繁切换 -->
<div v-if="isLoaded">内容</div> <!-- 一次性 -->
```

**效果**: 减少 DOM 操作，性能提升

---

### 5. 内存优化

#### 5.1 对象池
**优化**: 复用对象，减少 GC

**实现**:
```typescript
class ObjectPool<T> {
  private pool: T[] = [];

  acquire(): T {
    return this.pool.pop() || this.create();
  }

  release(obj: T): void {
    this.pool.push(obj);
  }
}
```

**效果**: 减少内存分配，GC 压力降低

#### 5.2 图片懒加载
**优化**: 封面图片懒加载

**实现**:
```vue
<img v-lazy="music.coverPath" />
```

**效果**: 减少初始内存占用

---

## 📁 文件操作性能优化

### 1. 并发控制

**优化**: 限制并发文件操作数

**实现**:
```typescript
class FileScanner {
  private concurrency = 10;
  private queue: Task[] = [];

  async processFile(filePath: string) {
    if (this.activeCount >= this.concurrency) {
      await this.waitForSlot();
    }
    // 处理文件
  }
}
```

**效果**:
- ✅ 避免系统资源耗尽
- ✅ CPU 占用可控
- ✅ 性能稳定

---

### 2. Worker 线程

**优化**: 使用 Worker 线程处理重任务

**实现**:
```typescript
// main.ts
const worker = new Worker('./fileScanner.worker.js');

worker.postMessage({ type: 'scan', path: folderPath });
worker.onmessage = (event) => {
  // 处理结果
};
```

**效果**:
- ✅ 不阻塞主线程
- ✅ UI 保持响应
- ✅ 充分利用多核 CPU

---

### 3. 增量扫描

**优化**: 仅扫描新增/修改文件

**实现**:
```typescript
const incrementalScan = async (path: string, lastScanTime: Date) => {
  const files = await getFilesSince(path, lastScanTime);
  // 仅处理新文件
};
```

**效果**: 扫描时间从 30 分钟降低到几秒（增量）

---

### 4. MD5 计算优化

**优化**: 流式计算 MD5

**实现**:
```typescript
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

const calculateMD5 = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};
```

**效果**: 内存占用降低，大文件处理更快

---

### 5. 批量处理

**优化**: 累积变化后批量处理

**实现**:
```typescript
class FileWatcher {
  private changes: FileChange[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  private handleChange(change: FileChange) {
    this.changes.push(change);

    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => {
      this.processBatch(this.changes);
      this.changes = [];
    }, 500);
  }
}
```

**效果**: 减少数据库操作，性能提升

---

## 🔍 搜索性能优化

### 1. 全文搜索 (FTS5)

**优化**: 使用 FTS5 虚拟表

**实现**:
```sql
-- 搜索
SELECT m.*, rank
FROM music_fts fts
JOIN music m ON m.id = fts.rowid
WHERE music_fts MATCH ?
ORDER BY rank
LIMIT 50;
```

**效果**: 搜索性能从秒级降低到毫秒级

---

### 2. 搜索缓存

**优化**: 缓存搜索结果

**实现**:
```typescript
const searchCache = new Map<string, MusicItem[]>();

const searchMusic = async (query: string) => {
  if (searchCache.has(query)) {
    return searchCache.get(query)!;
  }

  const results = await db.searchMusic(query);
  searchCache.set(query, results);
  return results;
};
```

**效果**: 重复搜索瞬间返回

---

### 3. 搜索索引优化

**优化**: 仅索引必要字段

**实现**:
```sql
CREATE VIRTUAL TABLE music_fts USING fts5(
  title, artist, album, genre  -- 仅索引这些字段
);
```

**效果**: 索引体积减小，搜索更快

---

## 🎵 音频播放性能优化

### 1. 预加载

**优化**: 预加载下一首歌曲

**实现**:
```typescript
const preloadNext = () => {
  const nextMusic = getNextMusic();
  if (nextMusic) {
    const sound = new Howl({ src: nextMusic.filePath });
    sound.load(); // 预加载
  }
};
```

**效果**: 切换歌曲更流畅

---

### 2. 音频缓存

**优化**: 缓存最近播放的音频

**实现**:
```typescript
const audioCache = new Map<string, Howl>();

const getAudio = (filePath: string) => {
  if (audioCache.has(filePath)) {
    return audioCache.get(filePath)!;
  }

  const sound = new Howl({ src: filePath });
  audioCache.set(filePath, sound);
  return sound;
};
```

**效果**: 重复播放更快

---

## 📊 性能监控

### 1. 性能指标收集

**实现**:
```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  record(metric: string, value: number) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }

  getAverage(metric: string): number {
    const values = this.metrics.get(metric) || [];
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
```

---

### 2. 性能分析工具

**工具**:
- **Chrome DevTools**: 性能分析
- **Electron DevTools**: 主进程性能
- **自定义监控**: 关键指标监控

---

## 🎯 性能优化检查清单

### 数据库优化
- [ ] WAL 模式启用
- [ ] 索引创建完整
- [ ] FTS5 全文搜索配置
- [ ] 查询优化（分页、批量）
- [ ] 数据库配置优化

### UI 优化
- [ ] 虚拟滚动实现
- [ ] 懒加载实现
- [ ] 防抖/节流应用
- [ ] 组件优化（懒加载、缓存）
- [ ] 内存优化（对象池、图片懒加载）

### 文件操作优化
- [ ] 并发控制实现
- [ ] Worker 线程使用
- [ ] 增量扫描实现
- [ ] MD5 流式计算
- [ ] 批量处理实现

### 搜索优化
- [ ] FTS5 全文搜索
- [ ] 搜索缓存
- [ ] 索引优化

### 音频播放优化
- [ ] 预加载实现
- [ ] 音频缓存

---

## 📈 性能测试

### 测试场景

1. **10 万首歌曲扫描**
   - 目标: < 30 分钟
   - 测试: 自动化测试

2. **搜索性能**
   - 目标: < 100ms
   - 测试: 性能测试工具

3. **列表滚动**
   - 目标: 60fps
   - 测试: 浏览器性能工具

4. **内存占用**
   - 目标: < 200MB
   - 测试: 系统监控工具

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) - 技术设计文档

---

**文档状态**: ✅ 已完成
**优化策略**: 全面覆盖
**下一步**: 安全架构设计
