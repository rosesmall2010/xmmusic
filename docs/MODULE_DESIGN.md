# xmmusic 模块设计文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 模块设计文档

---

## 📋 文档概述

本文档详细描述了 xmmusic 应用的各个模块设计，包括接口定义、实现细节、依赖关系等。

---

## 🗄️ 数据库模块

### 模块概述

**模块名称**: MusicDatabase
**位置**: `src/main/database/db.ts`
**职责**: 数据库连接、操作封装、查询优化

---

### 类设计

```typescript
import Database from 'better-sqlite3';

class MusicDatabase {
  private db: Database.Database;
  private static instance: MusicDatabase;

  // 单例模式
  static getInstance(): MusicDatabase;

  // 初始化
  initialize(dbPath?: string): void;
  close(): void;

  // 迁移
  migrate(): void;

  // 音乐操作
  insertMusic(music: MusicItem): number;
  updateMusic(id: number, updates: Partial<MusicItem>): void;
  deleteMusic(id: number): void;
  getMusicById(id: number): MusicItem | null;
  getMusicList(offset: number, limit: number): MusicItem[];
  getMusicTotalCount(): number;
  searchMusic(query: string, limit?: number): MusicItem[];
  getMusicByHash(hash: string): MusicItem[];
  getMusicByGenre(genre: string): MusicItem[];

  // 播放列表操作
  createPlaylist(name: string, description?: string): number;
  updatePlaylist(id: number, updates: Partial<Playlist>): void;
  deletePlaylist(id: number): void;
  getPlaylistById(id: number): Playlist | null;
  getPlaylists(): Playlist[];
  addToPlaylist(playlistId: number, musicId: number, position?: number): void;
  removeFromPlaylist(playlistId: number, musicId: number): void;
  getPlaylistSongs(playlistId: number): MusicItem[];
  updatePlaylistOrder(playlistId: number, musicIds: number[]): void;

  // 去重操作
  getDuplicateGroups(): DuplicateGroup[];
  getFilesByHash(hash: string): MusicItem[];
  markAsDuplicate(musicId: number, isDuplicate: boolean): void;

  // 目录操作
  addMusicDirectory(directory: MusicDirectoryInput): string;
  updateMusicDirectory(id: string, updates: Partial<MusicDirectoryInput>): void;
  deleteMusicDirectory(id: string): void;
  getMusicDirectories(): MusicDirectory[];
  getMusicDirectoryById(id: string): MusicDirectory | null;

  // 收藏和历史
  toggleFavorite(musicId: number): void;
  getFavorites(): MusicItem[];
  recordPlay(musicId: number): void;
  getPlayHistory(limit?: number): MusicItem[];

  // 损坏文件
  addCorruptedFile(file: CorruptedFileInput): number;
  getCorruptedFiles(): CorruptedFile[];
  resolveCorruptedFile(id: number): void;
  deleteCorruptedFile(id: number): void;

  // 备份
  addID3Backup(backup: ID3BackupInput): number;
  getID3Backups(filePath: string): ID3Backup[];
  deleteID3Backup(id: number): void;

  // 数据库备份
  backupDatabase(targetPath: string): Promise<void>;
  restoreDatabase(backupPath: string): Promise<void>;

  // 设置
  getSetting(key: string): any;
  setSetting(key: string, value: any): void;
  getAllSettings(): Record<string, any>;
}
```

---

### 关键方法实现

#### 初始化
```typescript
initialize(dbPath?: string): void {
  const path = dbPath || join(app.getPath('userData'), 'xmmusic.db');
  this.db = new Database(path);

  // 配置优化
  this.db.pragma('journal_mode = WAL');
  this.db.pragma('synchronous = NORMAL');
  this.db.pragma('cache_size = -32000');
  this.db.pragma('foreign_keys = ON');

  // 执行迁移
  this.migrate();

  // 创建索引
  this.createIndexes();
}
```

#### 批量插入
```typescript
insertMusicBatch(musicList: MusicItem[]): void {
  const insert = this.db.prepare(`
    INSERT INTO music (
      title, artist, album, year, genre,
      file_path, file_name, file_size, file_hash, file_extension,
      duration, bitrate, sample_rate, channels,
      cover_path, play_count, favorite, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = this.db.transaction((items: MusicItem[]) => {
    for (const item of items) {
      insert.run(
        item.title, item.artist, item.album, item.year, item.genre,
        item.filePath, item.fileName, item.fileSize, item.fileHash, item.fileExtension,
        item.duration, item.bitrate, item.sampleRate, item.channels,
        item.coverPath, item.playCount || 0, item.favorite ? 1 : 0, new Date().toISOString()
      );
    }
  });

  insertMany(musicList);
}
```

#### 全文搜索
```typescript
searchMusic(query: string, limit: number = 50): MusicItem[] {
  const stmt = this.db.prepare(`
    SELECT m.*, rank
    FROM music_fts fts
    JOIN music m ON m.id = fts.rowid
    WHERE music_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  return stmt.all(query, limit).map(row => this.mapRowToMusicItem(row));
}
```

---

## 📁 文件扫描模块

### 模块概述

**模块名称**: FileScanner
**位置**: `src/main/services/fileScanner.ts`
**职责**: 扫描音乐文件、计算 MD5、检测损坏文件

---

### 类设计

```typescript
import { readdir, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { parseFile } from 'music-metadata';

interface ScanOptions {
  recursive: boolean;
  fileTypes: string[];
  excludePaths: string[];
  onProgress?: (progress: ScanProgress) => void;
}

interface ScanProgress {
  current: number;
  total: number;
  currentFile: string;
  speed: number; // 文件/秒
  percentage: number;
}

interface ScanResult {
  success: number;
  failed: number;
  corrupted: number;
  skipped: number;
  duration: number; // 毫秒
  errors: Array<{ file: string; error: string }>;
}

class FileScanner {
  private db: MusicDatabase;
  private concurrency: number = 10;
  private activeTasks: number = 0;
  private taskQueue: Array<() => Promise<void>> = [];

  constructor(db: MusicDatabase) {
    this.db = db;
  }

  // 扫描目录
  async scanDirectory(
    path: string,
    options: ScanOptions
  ): Promise<ScanResult>;

  // 增量扫描
  async incrementalScan(
    path: string,
    lastScanTime: Date,
    options: ScanOptions
  ): Promise<ScanResult>;

  // 计算 MD5
  async calculateMD5(filePath: string): Promise<string>;

  // 检测损坏文件
  async detectCorruptedFile(filePath: string): Promise<boolean>;

  // 解析元数据
  private async parseMetadata(filePath: string): Promise<MusicMetadata>;

  // 处理单个文件
  private async processFile(
    filePath: string,
    options: ScanOptions
  ): Promise<void>;

  // 并发控制
  private async executeWithConcurrency<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]>;
}
```

---

### 关键方法实现

#### 扫描目录
```typescript
async scanDirectory(
  path: string,
  options: ScanOptions
): Promise<ScanResult> {
  const startTime = Date.now();
  const result: ScanResult = {
    success: 0,
    failed: 0,
    corrupted: 0,
    skipped: 0,
    duration: 0,
    errors: []
  };

  // 收集所有文件
  const files = await this.collectFiles(path, options);
  const total = files.length;
  let current = 0;

  // 处理文件
  const tasks = files.map(file => async () => {
    try {
      await this.processFile(file, options);
      result.success++;
    } catch (error) {
      result.failed++;
      result.errors.push({ file, error: error.message });
    } finally {
      current++;
      if (options.onProgress) {
        options.onProgress({
          current,
          total,
          currentFile: file,
          speed: current / ((Date.now() - startTime) / 1000),
          percentage: (current / total) * 100
        });
      }
    }
  });

  // 并发执行
  await this.executeWithConcurrency(tasks);

  result.duration = Date.now() - startTime;
  return result;
}
```

#### 计算 MD5
```typescript
async calculateMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

#### 检测损坏文件
```typescript
async detectCorruptedFile(filePath: string): Promise<boolean> {
  try {
    const metadata = await parseFile(filePath);
    // 检查基本属性
    if (!metadata.format.duration || metadata.format.duration <= 0) {
      return true;
    }
    return false;
  } catch (error) {
    return true; // 解析失败视为损坏
  }
}
```

---

## 👁️ 文件监控模块

### 模块概述

**模块名称**: FileWatcher
**位置**: `src/main/services/fileWatcher.ts`
**职责**: 监控文件系统变化、实时同步

---

### 类设计

```typescript
import chokidar from 'chokidar';

interface FileInfo {
  path: string;
  size: number;
  mtime: Date;
  hash?: string;
}

class FileWatcher {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private fileList: Map<string, FileInfo> = new Map();
  private changeQueue: Array<FileChange> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private db: MusicDatabase;
  private scanner: FileScanner;

  constructor(db: MusicDatabase, scanner: FileScanner) {
    this.db = db;
    this.scanner = scanner;
  }

  // 监控目录
  watchDirectory(directory: MusicDirectory): void;

  // 停止监控
  stopWatching(dirId: string): void;

  // 停止所有监控
  stopAll(): void;

  // 实时同步文件列表
  async syncFileList(dir: string): Promise<void>;

  // 处理文件变化
  private handleFileChange(
    type: 'add' | 'delete' | 'modify',
    path: string,
    dirId: string
  ): void;

  // 批量处理变化
  private processBatch(): Promise<void>;

  // 防抖处理
  private debounceProcess(): void;
}
```

---

### 关键方法实现

#### 监控目录
```typescript
watchDirectory(directory: MusicDirectory): void {
  if (!directory.enabled || !directory.autoScan) {
    return;
  }

  const watcher = chokidar.watch(directory.path, {
    ignored: directory.excludePaths,
    persistent: true,
    ignoreInitial: false,
    followSymlinks: false,
    depth: directory.scanDepth === 'recursive' ? undefined : 0
  });

  watcher
    .on('add', (path) => this.handleFileChange('add', path, directory.id))
    .on('change', (path) => this.handleFileChange('modify', path, directory.id))
    .on('unlink', (path) => this.handleFileChange('delete', path, directory.id));

  this.watchers.set(directory.id, watcher);

  // 初始同步
  this.syncFileList(directory.path);
}
```

#### 批量处理
```typescript
private async processBatch(): Promise<void> {
  if (this.changeQueue.length === 0) return;

  const changes = [...this.changeQueue];
  this.changeQueue = [];

  // 分组处理
  const adds = changes.filter(c => c.type === 'add');
  const deletes = changes.filter(c => c.type === 'delete');
  const modifies = changes.filter(c => c.type === 'modify');

  // 处理删除
  for (const change of deletes) {
    await this.db.deleteMusicByPath(change.path);
  }

  // 处理新增和修改
  const toScan = [...adds, ...modifies].map(c => c.path);
  if (toScan.length > 0) {
    await this.scanner.incrementalScan(toScan);
  }
}
```

---

## 🎵 元数据解析模块

### 模块概述

**模块名称**: MetadataParser
**位置**: `src/main/services/metadataParser.ts`
**职责**: 解析音频文件元数据

---

### 类设计

```typescript
import { parseFile, IAudioMetadata } from 'music-metadata';
import { extractCover } from 'music-metadata/lib/id3v2/ID3v2Parser';

interface ParsedMetadata {
  // 基本信息
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string | null;

  // 音频技术信息
  duration: number; // 秒
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: number;

  // 元数据
  coverPath: string | null;
  lyrics: string | null;
}

class MetadataParser {
  // 解析文件
  async parseFile(filePath: string): Promise<ParsedMetadata>;

  // 提取封面
  private async extractCover(
    metadata: IAudioMetadata,
    filePath: string
  ): Promise<string | null>;

  // 保存封面
  private async saveCover(
    coverData: Buffer,
    filePath: string
  ): Promise<string>;

  // 从文件名推断
  private inferFromFileName(filePath: string): Partial<ParsedMetadata>;
}
```

---

### 关键方法实现

#### 解析文件
```typescript
async parseFile(filePath: string): Promise<ParsedMetadata> {
  try {
    const metadata = await parseFile(filePath);

    const result: ParsedMetadata = {
      title: metadata.common.title || this.inferTitle(filePath),
      artist: metadata.common.artist || this.inferArtist(filePath),
      album: metadata.common.album || null,
      year: metadata.common.year || null,
      genre: metadata.common.genre?.[0] || null,
      duration: metadata.format.duration || 0,
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : 0,
      sampleRate: metadata.format.sampleRate || 0,
      channels: metadata.format.numberOfChannels || 0,
      coverPath: null,
      lyrics: null
    };

    // 提取封面
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      result.coverPath = await this.extractCover(metadata, filePath);
    }

    return result;
  } catch (error) {
    // 如果解析失败，从文件名推断
    return {
      ...this.inferFromFileName(filePath),
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      coverPath: null,
      lyrics: null
    };
  }
}
```

---

## 🔧 ID3 修复模块

### 模块概述

**模块名称**: ID3EncodingFixer
**位置**: `src/main/services/encodingFixer.ts`
**职责**: 检测和修复 ID3 标签乱码

---

### 类设计

```typescript
import iconv from 'iconv-lite';
import { readTags, updateTags } from 'node-id3';
import { copyFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface EncodingResult {
  encoding: string;
  confidence: number; // 0-1
  preview: {
    title: string;
    artist: string;
    album: string;
  };
}

interface ID3Fields {
  title?: string;
  artist?: string;
  album?: string;
}

class ID3EncodingFixer {
  private backupDir: string;

  constructor(backupDir: string) {
    this.backupDir = backupDir;
  }

  // 检测编码
  async detectEncoding(filePath: string): Promise<EncodingResult[]>;

  // 预览修复
  async previewFix(
    filePath: string,
    encoding: string
  ): Promise<{ original: ID3Fields; fixed: ID3Fields }>;

  // 修复 ID3 标签
  async fixID3Tags(
    filePath: string,
    encoding: string,
    fields: ('title' | 'artist' | 'album' | 'all')[],
    backup: boolean = true
  ): Promise<void>;

  // 批量修复
  async batchFixID3Tags(
    files: Array<{ path: string; encoding: string; fields: string[] }>,
    backup: boolean = true
  ): Promise<BatchFixResult>;

  // 备份文件
  async backupFile(filePath: string): Promise<string>;

  // 恢复文件
  async restoreFile(backupPath: string, targetPath: string): Promise<void>;

  // 检测乱码
  private isGarbled(text: string): boolean;

  // 尝试编码转换
  private tryEncoding(text: string, encoding: string): string | null;
}
```

---

### 关键方法实现

#### 检测编码
```typescript
async detectEncoding(filePath: string): Promise<EncodingResult[]> {
  const tags = readTags(filePath);
  if (!tags) return [];

  const results: EncodingResult[] = [];
  const encodings = ['GBK', 'GB2312', 'Big5', 'UTF-8', 'ISO-8859-1'];

  for (const encoding of encodings) {
    try {
      const title = this.tryEncoding(tags.title || '', encoding);
      const artist = this.tryEncoding(tags.artist || '', encoding);
      const album = this.tryEncoding(tags.album || '', encoding);

      if (title && artist && album) {
        // 计算置信度（基于是否包含常见中文字符）
        const confidence = this.calculateConfidence(title + artist + album);

        results.push({
          encoding,
          confidence,
          preview: { title, artist, album }
        });
      }
    } catch (error) {
      // 忽略错误
    }
  }

  // 按置信度排序
  return results.sort((a, b) => b.confidence - a.confidence);
}
```

#### 修复 ID3 标签
```typescript
async fixID3Tags(
  filePath: string,
  encoding: string,
  fields: ('title' | 'artist' | 'album' | 'all')[],
  backup: boolean = true
): Promise<void> {
  // 备份
  if (backup) {
    await this.backupFile(filePath);
  }

  // 读取原始标签
  const tags = readTags(filePath);
  if (!tags) return;

  // 转换编码
  const fixedTags: ID3Fields = {};

  if (fields.includes('all') || fields.includes('title')) {
    fixedTags.title = this.tryEncoding(tags.title || '', encoding) || tags.title;
  }

  if (fields.includes('all') || fields.includes('artist')) {
    fixedTags.artist = this.tryEncoding(tags.artist || '', encoding) || tags.artist;
  }

  if (fields.includes('all') || fields.includes('album')) {
    fixedTags.album = this.tryEncoding(tags.album || '', encoding) || tags.album;
  }

  // 写入标签
  updateTags(fixedTags, filePath);

  // 更新数据库
  // ...
}
```

---

## 📤 音乐导出模块

### 模块概述

**模块名称**: MusicExporter
**位置**: `src/main/services/musicExporter.ts`
**职责**: 导出音乐文件和播放列表

---

### 类设计

```typescript
import { copyFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import ExcelJS from 'exceljs';

interface ExportOptions {
  targetPath: string;
  organization: 'flat' | 'by-artist' | 'by-album' | 'original';
  conflictResolution: 'skip' | 'overwrite' | 'rename';
  onProgress?: (progress: ExportProgress) => void;
}

class MusicExporter {
  // 导出音乐文件
  async exportMusicFiles(
    musicList: MusicItem[],
    options: ExportOptions
  ): Promise<ExportResult>;

  // 导出到 Excel
  async exportToExcel(
    musicList: MusicItem[],
    columns: string[],
    filePath: string
  ): Promise<string>;

  // 导出播放列表 (M3U)
  async exportPlaylist(
    playlist: Playlist,
    format: 'm3u' | 'json',
    filePath: string
  ): Promise<string>;

  // 组织文件路径
  private organizePath(
    music: MusicItem,
    organization: ExportOptions['organization']
  ): string;

  // 处理文件冲突
  private async resolveConflict(
    targetPath: string,
    resolution: ExportOptions['conflictResolution']
  ): Promise<string>;
}
```

---

### 关键方法实现

#### 导出音乐文件
```typescript
async exportMusicFiles(
  musicList: MusicItem[],
  options: ExportOptions
): Promise<ExportResult> {
  const result: ExportResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (let i = 0; i < musicList.length; i++) {
    const music = musicList[i];

    try {
      // 组织目标路径
      const targetPath = this.organizePath(music, options.organization);
      const targetDir = dirname(targetPath);

      // 创建目录
      await mkdir(targetDir, { recursive: true });

      // 处理冲突
      const finalPath = await this.resolveConflict(
        targetPath,
        options.conflictResolution
      );

      if (finalPath) {
        // 复制文件
        await copyFile(music.filePath, finalPath);
        result.success++;
      } else {
        result.skipped++;
      }

      // 进度回调
      if (options.onProgress) {
        options.onProgress({
          current: i + 1,
          total: musicList.length,
          currentFile: music.fileName,
          percentage: ((i + 1) / musicList.length) * 100
        });
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        file: music.filePath,
        error: error.message
      });
    }
  }

  return result;
}
```

---

## 🎯 相似度计算模块

### 模块概述

**模块名称**: SimilarityCalculator
**位置**: `src/main/services/similarity.ts`
**职责**: 计算音乐相似度、生成推荐

---

### 类设计

```typescript
interface SimilarityWeights {
  artist: number; // 0.4
  genre: number; // 0.3
  album: number; // 0.1
  year: number; // 0.1
  duration: number; // 0.1
}

class SimilarityCalculator {
  private weights: SimilarityWeights = {
    artist: 0.4,
    genre: 0.3,
    album: 0.1,
    year: 0.1,
    duration: 0.1
  };

  private cache: Map<string, SimilarSong[]> = new Map();

  // 计算相似度
  calculateSimilarity(
    music1: MusicItem,
    music2: MusicItem
  ): number;

  // 查找相似歌曲
  async findSimilarSongs(
    musicId: number,
    limit: number = 10
  ): Promise<SimilarSong[]>;

  // 计算艺术家相似度
  private artistSimilarity(artist1: string, artist2: string): number;

  // 计算流派相似度
  private genreSimilarity(genre1: string, genre2: string): number;

  // 计算年份相似度
  private yearSimilarity(year1: number, year2: number): number;

  // 计算时长相似度
  private durationSimilarity(duration1: number, duration2: number): number;
}
```

---

### 关键方法实现

#### 计算相似度
```typescript
calculateSimilarity(
  music1: MusicItem,
  music2: MusicItem
): number {
  let similarity = 0;

  // 艺术家相似度
  similarity += this.weights.artist * this.artistSimilarity(
    music1.artist,
    music2.artist
  );

  // 流派相似度
  similarity += this.weights.genre * this.genreSimilarity(
    music1.genre || '',
    music2.genre || ''
  );

  // 专辑相似度
  if (music1.album === music2.album) {
    similarity += this.weights.album;
  }

  // 年份相似度
  if (music1.year && music2.year) {
    similarity += this.weights.year * this.yearSimilarity(
      music1.year,
      music2.year
    );
  }

  // 时长相似度
  if (music1.duration && music2.duration) {
    similarity += this.weights.duration * this.durationSimilarity(
      music1.duration,
      music2.duration
    );
  }

  return Math.min(similarity, 1.0);
}
```

---

## 🎨 前端模块设计

### 组件模块

#### MusicList 组件模块

**组件**: `MusicListView.vue`

**子组件**:
- `MusicListHeader.vue`: 列表头部（排序、筛选）
- `MusicListItem.vue`: 列表项
- `VirtualScroller.vue`: 虚拟滚动容器
- `MusicListToolbar.vue`: 工具栏

**Composables**:
- `useMusicList.ts`: 列表逻辑
- `useSort.ts`: 排序逻辑
- `useFilter.ts`: 筛选逻辑

---

#### Player 组件模块

**组件**: `PlayerControls.vue`

**子组件**:
- `MusicInfo.vue`: 音乐信息
- `PlaybackControls.vue`: 播放控制按钮
- `ProgressBar.vue`: 进度条
- `VolumeControl.vue`: 音量控制

**Composables**:
- `usePlayer.ts`: 播放器逻辑
- `useProgress.ts`: 进度控制逻辑

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [API_DESIGN.md](./API_DESIGN.md) - API 接口设计
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - 实现指南

---

**文档状态**: ✅ 已完成
**模块总数**: 10+ 个核心模块
**下一步**: 具体实现方案
