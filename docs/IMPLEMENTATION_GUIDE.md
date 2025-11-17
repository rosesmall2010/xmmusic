# xmmusic 实现指南

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 实现指南

---

## 📋 文档概述

本文档提供了 xmmusic 项目的具体实现方案，包括代码示例、实现步骤、最佳实践等。

---

## 🚀 实现步骤

### Phase 1: 项目初始化

#### Step 1.1: 创建项目结构

```bash
mkdir -p src/{main,renderer,shared}/{database,services,components,stores,composables,utils,types}
mkdir -p dist/{electron,renderer}
mkdir -p docs tests
```

#### Step 1.2: 初始化 package.json

```json
{
  "name": "xmmusic",
  "version": "1.0.0",
  "main": "dist/electron/main.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "electron .",
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "pack": "electron-builder"
  },
  "dependencies": {
    "better-sqlite3": "latest",
    "vue": "3.5.24",
    "pinia": "latest",
    "howler": "latest",
    "music-metadata": "latest",
    "chokidar": "latest",
    "exceljs": "latest",
    "iconv-lite": "latest",
    "node-id3": "latest",
    "vue-i18n": "latest"
  },
  "devDependencies": {
    "electron": "39.2.1",
    "typescript": "5.9",
    "vite": "latest",
    "@vitejs/plugin-vue": "latest"
  }
}
```

---

### Phase 2: 主进程实现

#### Step 2.1: 主进程入口 (main.ts)

```typescript
// src/main/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import MusicDatabase from './database/db';
import { setupIPC } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let db: MusicDatabase;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 初始化数据库
  db = MusicDatabase.getInstance();
  db.initialize();

  // 创建窗口
  createWindow();

  // 设置 IPC
  setupIPC(db, mainWindow!);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
```

---

#### Step 2.2: Preload 脚本 (preload.ts)

```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // 文件操作
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  scanMusicFolder: (path: string) => ipcRenderer.invoke('scan-music-folder', path),

  // 数据库操作
  getMusicList: (offset: number, limit: number) =>
    ipcRenderer.invoke('get-music-list', offset, limit),
  getMusicTotalCount: () => ipcRenderer.invoke('get-music-total-count'),
  searchMusic: (query: string) => ipcRenderer.invoke('search-music', query),

  // 播放列表
  createPlaylist: (name: string, description?: string) =>
    ipcRenderer.invoke('create-playlist', name, description),
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  addToPlaylist: (playlistId: number, musicId: number) =>
    ipcRenderer.invoke('add-to-playlist', playlistId, musicId),

  // ID3 修复
  detectID3Encoding: (filePath: string) =>
    ipcRenderer.invoke('detect-id3-encoding', filePath),
  fixID3Tags: (options: FixID3Options) =>
    ipcRenderer.invoke('fix-id3-tags', options),

  // 事件监听
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    ipcRenderer.on('scan-progress', (_, progress) => callback(progress));
  },
  removeScanProgress: () => {
    ipcRenderer.removeAllListeners('scan-progress');
  }
});
```

---

#### Step 2.3: IPC 处理器 (handlers.ts)

```typescript
// src/main/ipc/handlers.ts
import { ipcMain, BrowserWindow } from 'electron';
import MusicDatabase from '../database/db';
import FileScanner from '../services/fileScanner';
import FileWatcher from '../services/fileWatcher';

export function setupIPC(db: MusicDatabase, mainWindow: BrowserWindow) {
  // 窗口控制
  ipcMain.handle('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    mainWindow.close();
  });

  // 文件操作
  ipcMain.handle('select-music-folder', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'multiSelections']
    });
    return result.filePaths;
  });

  ipcMain.handle('scan-music-folder', async (_, path: string) => {
    const scanner = new FileScanner(db);
    const result = await scanner.scanDirectory(path, {
      recursive: true,
      fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
      excludePaths: [],
      onProgress: (progress) => {
        mainWindow.webContents.send('scan-progress', progress);
      }
    });
    return result;
  });

  // 数据库操作
  ipcMain.handle('get-music-list', async (_, offset: number, limit: number) => {
    return db.getMusicList(offset, limit);
  });

  ipcMain.handle('get-music-total-count', () => {
    return db.getMusicTotalCount();
  });

  ipcMain.handle('search-music', async (_, query: string) => {
    return db.searchMusic(query);
  });

  // 播放列表
  ipcMain.handle('create-playlist', async (_, name: string, description?: string) => {
    return db.createPlaylist(name, description);
  });

  ipcMain.handle('get-playlists', () => {
    return db.getPlaylists();
  });

  ipcMain.handle('add-to-playlist', async (_, playlistId: number, musicId: number) => {
    db.addToPlaylist(playlistId, musicId);
  });

  // ID3 修复
  ipcMain.handle('detect-id3-encoding', async (_, filePath: string) => {
    const fixer = new ID3EncodingFixer();
    return await fixer.detectEncoding(filePath);
  });

  ipcMain.handle('fix-id3-tags', async (_, options: FixID3Options) => {
    const fixer = new ID3EncodingFixer();
    await fixer.fixID3Tags(
      options.filePath,
      options.encoding,
      options.fields,
      options.backup
    );
  });
}
```

---

### Phase 3: 数据库实现

#### Step 3.1: 数据库类实现

```typescript
// src/main/database/db.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { readFileSync } from 'fs';

class MusicDatabase {
  private static instance: MusicDatabase;
  private db: Database.Database | null = null;

  static getInstance(): MusicDatabase {
    if (!MusicDatabase.instance) {
      MusicDatabase.instance = new MusicDatabase();
    }
    return MusicDatabase.instance;
  }

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

  private migrate(): void {
    // 读取 SQL 迁移文件
    const sql = readFileSync(join(__dirname, 'migrations', '001_initial.sql'), 'utf8');
    this.db!.exec(sql);
  }

  private createIndexes(): void {
    // 创建索引
    this.db!.exec(`
      CREATE INDEX IF NOT EXISTS idx_music_file_hash ON music(file_hash);
      CREATE INDEX IF NOT EXISTS idx_music_artist_title ON music(artist, title);
      CREATE INDEX IF NOT EXISTS idx_music_genre ON music(genre);
    `);
  }

  getMusicList(offset: number, limit: number): MusicItem[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM music
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset).map(this.mapRowToMusicItem);
  }

  // ... 其他方法
}
```

---

### Phase 4: 渲染进程实现

#### Step 4.1: Vue 应用入口 (main.ts)

```typescript
// src/renderer/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import zh from './locales/zh.json';
import en from './locales/en.json';

const app = createApp(App);

// Pinia
const pinia = createPinia();
app.use(pinia);

// i18n
const i18n = createI18n({
  locale: 'zh',
  messages: { zh, en }
});
app.use(i18n);

app.mount('#app');
```

---

#### Step 4.2: Pinia Store 实现

```typescript
// src/renderer/stores/music.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useMusicStore = defineStore('music', () => {
  // State
  const musicList = ref<MusicItem[]>([]);
  const totalCount = ref(0);
  const currentOffset = ref(0);
  const pageSize = ref(50);
  const loading = ref(false);
  const searchQuery = ref('');
  const searchResults = ref<MusicItem[]>([]);

  // Getters
  const hasMore = computed(() => {
    return currentOffset.value < totalCount.value;
  });

  // Actions
  async function loadMusic(offset: number = 0, limit: number = pageSize.value) {
    loading.value = true;
    try {
      const items = await window.electronAPI.getMusicList(offset, limit);
      if (offset === 0) {
        musicList.value = items;
      } else {
        musicList.value.push(...items);
      }
      currentOffset.value = offset + items.length;
      totalCount.value = await window.electronAPI.getMusicTotalCount();
    } finally {
      loading.value = false;
    }
  }

  async function searchMusic(query: string) {
    searchQuery.value = query;
    if (!query.trim()) {
      searchResults.value = [];
      return;
    }
    searchResults.value = await window.electronAPI.searchMusic(query);
  }

  return {
    musicList,
    totalCount,
    loading,
    searchQuery,
    searchResults,
    hasMore,
    loadMusic,
    searchMusic
  };
});
```

---

#### Step 4.3: Composables 实现

```typescript
// src/renderer/composables/usePlayer.ts
import { ref } from 'vue';
import { Howl } from 'howler';
import { usePlayerStore } from '@/stores/player';

export function usePlayer() {
  const playerStore = usePlayerStore();
  let howl: Howl | null = null;

  const play = async (music: MusicItem) => {
    // 停止当前播放
    if (howl) {
      howl.unload();
    }

    // 创建新的 Howl 实例
    howl = new Howl({
      src: [music.filePath],
      html5: true,
      volume: playerStore.volume / 100,
      onload: () => {
        playerStore.duration = howl!.duration();
      },
      onplay: () => {
        playerStore.isPlaying = true;
        startProgressUpdate();
      },
      onpause: () => {
        playerStore.isPlaying = false;
        stopProgressUpdate();
      },
      onend: () => {
        playerStore.isPlaying = false;
        stopProgressUpdate();
        next();
      }
    });

    howl.play();
    playerStore.currentMusic = music;

    // 记录播放
    await window.electronAPI.recordPlay(music.id);
  };

  const pause = () => {
    howl?.pause();
  };

  const resume = () => {
    howl?.play();
  };

  const seek = (time: number) => {
    if (howl) {
      howl.seek(time);
      playerStore.currentTime = time;
    }
  };

  const setVolume = (volume: number) => {
    if (howl) {
      howl.volume(volume / 100);
      playerStore.volume = volume;
    }
  };

  let progressTimer: NodeJS.Timeout | null = null;

  const startProgressUpdate = () => {
    progressTimer = setInterval(() => {
      if (howl && howl.playing()) {
        playerStore.currentTime = howl.seek() as number;
      }
    }, 100);
  };

  const stopProgressUpdate = () => {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  };

  return {
    play,
    pause,
    resume,
    seek,
    setVolume
  };
}
```

---

## 🎯 实现最佳实践

### 1. 错误处理

```typescript
// 统一错误处理
class ErrorHandler {
  static handle(error: Error, context: string) {
    console.error(`[${context}]`, error);

    // 记录错误日志
    this.logError(error, context);

    // 用户提示
    this.showUserError(error);
  }

  private static logError(error: Error, context: string) {
    // 写入日志文件
  }

  private static showUserError(error: Error) {
    // 显示用户友好的错误提示
  }
}
```

---

### 2. 类型定义

```typescript
// src/shared/types/music.ts
export interface MusicItem {
  id: number;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string | null;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  fileExtension: string;
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  coverPath: string | null;
  playCount: number;
  lastPlayedAt: string | null;
  favorite: boolean;
  addedAt: string;
  isCorrupted: boolean;
  isDuplicate: boolean;
  duplicateCount?: number;
}
```

---

### 3. 配置管理

```typescript
// src/main/config.ts
import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

class ConfigManager {
  private configPath: string;
  private config: Record<string, any> = {};

  constructor() {
    this.configPath = join(app.getPath('userData'), 'config.json');
    this.load();
  }

  load(): void {
    if (existsSync(this.configPath)) {
      this.config = JSON.parse(readFileSync(this.configPath, 'utf8'));
    }
  }

  save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  get<T>(key: string, defaultValue?: T): T {
    return this.config[key] ?? defaultValue;
  }

  set(key: string, value: any): void {
    this.config[key] = value;
    this.save();
  }
}

export const config = new ConfigManager();
```

---

## 📝 代码规范

### 1. 命名规范

- **类**: PascalCase (`MusicDatabase`)
- **函数/方法**: camelCase (`getMusicList`)
- **常量**: UPPER_SNAKE_CASE (`MAX_DIRECTORIES`)
- **文件**: kebab-case (`music-list.vue`)

### 2. 注释规范

```typescript
/**
 * 获取音乐列表
 * @param offset - 偏移量
 * @param limit - 每页数量
 * @returns 音乐列表
 */
function getMusicList(offset: number, limit: number): MusicItem[] {
  // 实现
}
```

---

## 🧪 测试策略

### 1. 单元测试

```typescript
// tests/database.test.ts
import { describe, it, expect } from 'vitest';
import MusicDatabase from '../src/main/database/db';

describe('MusicDatabase', () => {
  it('should insert music', () => {
    const db = MusicDatabase.getInstance();
    const id = db.insertMusic({
      title: 'Test Song',
      artist: 'Test Artist',
      // ...
    });
    expect(id).toBeGreaterThan(0);
  });
});
```

---

## 📚 相关文档

- [MODULE_DESIGN.md](./MODULE_DESIGN.md) - 模块设计文档
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [API_DESIGN.md](./API_DESIGN.md) - API 接口设计

---

**文档状态**: ✅ 已完成
**实现指南**: 完整覆盖
**下一步**: 其他架构任务
