# 🎨 Lucide Icons 使用指南

本项目已集成 [Lucide Icons](https://lucide.dev/)，这是一个现代、简洁的开源图标库。

## 📦 已安装的包

```bash
lucide-vue-next
```

## 🚀 基本使用

### 1. 导入图标

```vue
<script setup lang="ts">
import { Play, Pause, Heart, Settings } from 'lucide-vue-next'
</script>
```

### 2. 在模板中使用

```vue
<template>
  <!-- 基本用法 -->
  <Play />

  <!-- 自定义大小 -->
  <Heart :size="24" />

  <!-- 自定义颜色（通过CSS） -->
  <Settings :size="20" class="text-primary" />

  <!-- 自定义描边宽度 -->
  <Pause :size="32" :stroke-width="1.5" />
</template>
```

## 🎯 常用图标映射

### 播放控制
- `Play` - 播放 ▶
- `Pause` - 暂停 ⏸
- `SkipBack` - 上一曲 ⏮
- `SkipForward` - 下一曲 ⏭
- `Repeat` - 循环 🔁
- `Repeat1` - 单曲循环 🔂
- `Shuffle` - 随机播放 🎲

### 导航与操作
- `ChevronLeft` - 后退 ←
- `ChevronRight` - 前进 →
- `Home` - 主页 🏠
- `Menu` - 菜单 ☰
- `Search` - 搜索 🔍
- `X` - 关闭 ×

### 音乐相关
- `Music` - 音乐 🎵
- `Music2` - 音符 🎶
- `Disc` - 光盘/唱片 💿
- `Mic` - 麦克风 🎤
- `Headphones` - 耳机 🎧
- `Volume2` - 音量 🔊
- `VolumeX` - 静音 🔇

### 内容分类
- `Heart` - 喜欢/收藏 ❤️
- `Clock` - 最近/历史 🕐
- `Folder` - 文件夹 📁
- `List` - 列表 📋
- `Grid` - 网格 ⊞
- `Album` - 专辑 💿

### 系统功能
- `Settings` - 设置 ⚙️
- `Sun` - 浅色模式 ☀️
- `Moon` - 深色模式 🌙
- `Minimize2` - 最小化 🖥️
- `Download` - 下载 ⬇️
- `Upload` - 上传 ⬆️

## 📝 使用示例

### 播放器按钮组
```vue
<template>
  <div class="player-controls">
    <button @click="previous">
      <SkipBack :size="24" />
    </button>
    <button @click="togglePlay">
      <Play v-if="!isPlaying" :size="32" />
      <Pause v-else :size="32" />
    </button>
    <button @click="next">
      <SkipForward :size="24" />
    </button>
  </div>
</template>
```

### 带动画的图标
```vue
<template>
  <Heart
    :size="24"
    :fill="isFavorite ? 'currentColor' : 'none'"
    :class="{ 'text-red-500': isFavorite }"
    class="transition-all"
  />
</template>
```

## 🎨 样式自定义

### 通过Props
```vue
<Play
  :size="24"           <!-- 尺寸 -->
  :stroke-width="2"    <!-- 描边宽度 -->
  :color="#667eea"     <!-- 颜色 -->
/>
```

### 通过CSS
```vue
<style scoped>
.icon-button svg {
  width: 20px;
  height: 20px;
  color: var(--text-color);
  transition: color 0.2s ease;
}

.icon-button:hover svg {
  color: var(--color-primary);
}
</style>
```

## 🔍 查找更多图标

访问 [Lucide Icons 官网](https://lucide.dev/icons/) 浏览所有可用图标。

## ✅ 已替换的页面

- ✅ `AppHeader.vue` - 导航、主题、设置图标
- ✅ `DiscoverView.vue` - 发现音乐卡片图标
- ⏳ `PlayerBar.vue` - 播放器控制图标（待完成）
- ⏳ `NowPlayingView.vue` - 播放详情图标（待完成）

## 💡 最佳实践

1. **保持一致性** - 同一类功能使用同一个图标
2. **合理尺寸** - 导航按钮18-20px，主要操作24-32px
3. **适当留白** - 图标周围保留足够的点击区域
4. **颜色语义** - 危险操作用红色，主要操作用品牌色
5. **按需导入** - 只导入实际使用的图标，减小打包体积

## 🚫 避免的做法

- ❌ 不要混用emoji和图标库图标
- ❌ 不要在同一界面使用太多不同尺寸
- ❌ 不要导入整个图标库 `import * as Icons from 'lucide-vue-next'`
