# xmmusic 前端架构文档

**文档版本**: 1.0
**创建日期**: 2024
**架构师**: Winston
**文档类型**: 前端架构文档

---

## 📋 文档概述

本文档详细描述了 xmmusic 应用的前端架构，包括组件设计、状态管理、路由、样式系统等。

---

## 🏗️ 前端架构概览

### 架构层次

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  Vue Components (UI)                    │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│         State Management Layer          │
│  Pinia Stores                           │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│         Business Logic Layer            │
│  Composables                            │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│         API Layer                       │
│  IPC Communication (electronAPI)        │
└─────────────────────────────────────────┘
```

---

## 🧩 组件架构

### 组件层次结构

```
App.vue (根组件)
├── Header.vue (头部)
│   ├── SearchInput.vue
│   ├── ThemeToggle.vue
│   └── WindowControls.vue
├── MainContainer.vue
│   ├── Sidebar.vue (侧边栏)
│   │   ├── NavItem.vue
│   │   └── PlaylistSubmenu.vue
│   └── MainContent.vue (主内容)
│       ├── MusicListView.vue
│       │   ├── MusicListItem.vue
│       │   ├── MusicListHeader.vue
│       │   └── VirtualScroller.vue
│       ├── PlaylistView.vue
│       ├── SettingsView.vue
│       └── GenreGroupView.vue
└── Footer.vue (底部)
    └── PlayerControls.vue
        ├── MusicInfo.vue
        ├── PlaybackControls.vue
        ├── ProgressBar.vue
        └── VolumeControl.vue
```

---

### 组件分类

#### 1. 布局组件 (Layout Components)
- `App.vue`: 根组件，整体布局
- `Header.vue`: 头部导航
- `Sidebar.vue`: 侧边栏
- `Footer.vue`: 底部播放控制
- `MainContainer.vue`: 主容器

#### 2. 功能组件 (Feature Components)
- `MusicListView.vue`: 音乐列表视图
- `PlaylistView.vue`: 播放列表视图
- `SettingsView.vue`: 设置视图
- `GenreGroupView.vue`: 流派分组视图

#### 3. 通用组件 (Common Components)
- `MusicListItem.vue`: 音乐列表项
- `PlaybackControls.vue`: 播放控制
- `ProgressBar.vue`: 进度条
- `SearchInput.vue`: 搜索输入框
- `VirtualScroller.vue`: 虚拟滚动容器

#### 4. 业务组件 (Business Components)
- `DuplicateFileDialog.vue`: 重复文件对话框
- `ID3FixDialog.vue`: ID3 修复对话框
- `ExportDialog.vue`: 导出对话框
- `SettingsDialog.vue`: 设置对话框

---

## 📦 状态管理架构

### Pinia Store 设计

#### 1. musicStore (音乐库状态)

**状态**:
```typescript
interface MusicState {
  musicList: MusicItem[]
  totalCount: number
  currentOffset: number
  pageSize: number
  hasMore: boolean
  loading: boolean
  searchQuery: string
  searchResults: MusicItem[]
  selectedMusic: MusicItem | null
  sortBy: SortOption
  filterBy: FilterOption
  groupBy: 'none' | 'genre'
}
```

**Actions**:
- `loadMusic(offset, limit)`: 加载音乐列表
- `searchMusic(query)`: 搜索音乐
- `sortMusic(sortBy)`: 排序音乐
- `filterMusic(filterBy)`: 筛选音乐
- `groupByGenre()`: 按流派分组
- `selectMusic(music)`: 选择音乐

---

#### 2. playerStore (播放器状态)

**状态**:
```typescript
interface PlayerState {
  currentMusic: MusicItem | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playMode: 'sequential' | 'random' | 'repeat' | 'single'
  playQueue: MusicItem[]
  playHistory: MusicItem[]
}
```

**Actions**:
- `play(music)`: 播放音乐
- `pause()`: 暂停
- `next()`: 下一首
- `previous()`: 上一首
- `seek(time)`: 跳转
- `setVolume(volume)`: 设置音量
- `toggleMute()`: 切换静音
- `setPlayMode(mode)`: 设置播放模式
- `addToQueue(music)`: 添加到队列

---

#### 3. playlistStore (播放列表状态)

**状态**:
```typescript
interface PlaylistState {
  playlists: Playlist[]
  currentPlaylist: Playlist | null
  playlistSongs: Map<number, MusicItem[]>
  loading: boolean
}
```

**Actions**:
- `loadPlaylists()`: 加载播放列表
- `createPlaylist(name, description)`: 创建播放列表
- `updatePlaylist(id, updates)`: 更新播放列表
- `deletePlaylist(id)`: 删除播放列表
- `loadPlaylistSongs(playlistId)`: 加载播放列表歌曲
- `addToPlaylist(playlistId, musicId)`: 添加到播放列表
- `removeFromPlaylist(playlistId, musicId)`: 从播放列表移除
- `reorderPlaylist(playlistId, musicIds)`: 重新排序

---

#### 4. settingsStore (设置状态)

**状态**:
```typescript
interface SettingsState {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  audio: {
    volume: number
    playMode: 'sequential' | 'random' | 'repeat' | 'single'
  }
  library: {
    autoScan: boolean
    scanOnStartup: boolean
  }
  shortcuts: Record<string, string>
}
```

**Actions**:
- `loadSettings()`: 加载设置
- `updateSettings(settings)`: 更新设置
- `resetSettings()`: 重置设置

---

## 🎣 Composables 设计

### 1. useMusicList

**功能**: 音乐列表逻辑

**实现**:
```typescript
export function useMusicList() {
  const musicStore = useMusicStore();

  const loadMore = async () => {
    if (musicStore.loading || !musicStore.hasMore) return;

    musicStore.loading = true;
    const items = await window.electronAPI.getMusicList(
      musicStore.currentOffset,
      musicStore.pageSize
    );
    musicStore.musicList.push(...items);
    musicStore.currentOffset += items.length;
    musicStore.hasMore = items.length === musicStore.pageSize;
    musicStore.loading = false;
  };

  return { loadMore };
}
```

---

### 2. usePlayer

**功能**: 播放器逻辑

**实现**:
```typescript
export function usePlayer() {
  const playerStore = usePlayerStore();
  let howl: Howl | null = null;

  const play = async (music: MusicItem) => {
    if (howl) {
      howl.unload();
    }

    howl = new Howl({
      src: [music.filePath],
      html5: true,
      volume: playerStore.volume / 100,
      onload: () => {
        playerStore.duration = howl!.duration();
      },
      onplay: () => {
        playerStore.isPlaying = true;
      },
      onpause: () => {
        playerStore.isPlaying = false;
      },
      onend: () => {
        playerStore.isPlaying = false;
        next();
      }
    });

    howl.play();
    playerStore.currentMusic = music;
    await window.electronAPI.recordPlay(music.id);
  };

  const pause = () => {
    howl?.pause();
  };

  return { play, pause };
}
```

---

### 3. useSearch

**功能**: 搜索逻辑

**实现**:
```typescript
export function useSearch() {
  const musicStore = useMusicStore();

  const debouncedSearch = debounce(async (query: string) => {
    if (!query.trim()) {
      musicStore.searchResults = [];
      return;
    }

    const results = await window.electronAPI.searchMusic(query);
    musicStore.searchResults = results;
  }, 300);

  const search = (query: string) => {
    musicStore.searchQuery = query;
    debouncedSearch(query);
  };

  return { search };
}
```

---

## 🎨 样式系统

### 1. 主题系统

**实现**: CSS 变量

**浅色主题**:
```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --accent: #ff4757;
  --border: #e0e0e0;
}
```

**深色主题**:
```css
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --accent: #ff4757;
  --border: #444444;
}
```

**切换**:
```typescript
const toggleTheme = () => {
  const theme = settingsStore.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  settingsStore.updateSettings({ theme });
};
```

---

### 2. 响应式设计

**断点**:
```css
/* 小屏幕 */
@media (max-width: 1000px) {
  .sidebar {
    display: none; /* 可折叠 */
  }
}

/* 大屏幕 */
@media (min-width: 1600px) {
  .main-content {
    max-width: 1400px;
    margin: 0 auto;
  }
}
```

---

### 3. 动画系统

**过渡动画**:
```css
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

**使用**:
```vue
<transition name="fade">
  <component :is="currentView" />
</transition>
```

---

## 🔄 路由系统

### 路由设计（基于组件切换）

**实现**: 组件切换，非传统路由

**路由映射**:
```typescript
const routes = {
  'local': MusicListView,
  'recent': MusicListView, // 最近播放
  'playlist': PlaylistView,
  'favorites': MusicListView, // 收藏
  'settings': SettingsView
};
```

**切换**:
```typescript
const currentView = computed(() => {
  return routes[activeMenu.value] || MusicListView;
});
```

---

## 📱 响应式设计

### 布局适配

**小窗口 (< 1000px)**:
- Sidebar 可折叠
- 列表列数减少
- Footer 按钮简化

**大窗口 (> 1600px)**:
- 内容区域最大宽度限制
- 居中显示

---

## 🎯 性能优化

### 1. 虚拟滚动

**实现**: @tanstack/vue-virtual

**使用**:
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

---

### 2. 懒加载

**实现**: 分页加载

**使用**:
```typescript
const loadMore = async () => {
  if (loading.value || !hasMore.value) return;
  // 加载更多
};
```

---

### 3. 组件懒加载

**实现**: 动态导入

**使用**:
```typescript
const SettingsView = () => import('@/components/Settings/SettingsView.vue');
```

---

## 🌐 国际化

### 1. 多语言支持

**实现**: vue-i18n

**配置**:
```typescript
import { createI18n } from 'vue-i18n';
import zh from './locales/zh.json';
import en from './locales/en.json';

const i18n = createI18n({
  locale: 'zh',
  messages: { zh, en }
});
```

---

### 2. 语言文件

**结构**:
```json
{
  "header": {
    "searchPlaceholder": "搜索音乐...",
    "theme": "主题",
    "language": "语言"
  },
  "sidebar": {
    "local": "本地音乐",
    "recent": "最近播放",
    "playlist": "我的歌单",
    "favorites": "我的收藏",
    "settings": "设置"
  }
}
```

---

## 📚 相关文档

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - 系统架构文档
- [UI_DESIGN.md](./UI_DESIGN.md) - UI 设计文档

---

**文档状态**: ✅ 已完成
**前端架构**: 完整设计
**下一步**: 项目文档化
