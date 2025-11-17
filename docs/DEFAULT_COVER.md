# 默认封面功能说明

## 概述

为所有没有专辑封面的音乐和播放列表提供统一的默认封面图片，提升视觉体验。

## 功能特性

### 1. DefaultCover 组件

创建了一个独立的 Vue 组件 `DefaultCover.vue`，使用 SVG 绘制精美的默认封面。

**设计特点：**
- 🎨 红色渐变背景（#ff6b6b → #ff4757）
- 🎵 音符图标（白色，透明度 0.9）
- 📐 响应式设计，支持多种尺寸

**支持的尺寸：**
- `small`: 40x40px - 用于小型图标
- `medium`: 50x50px（默认）- 用于播放器
- `large`: 150x150px - 用于播放列表卡片

### 2. 应用场景

#### 播放器底部（Footer.vue）
- 显示当前播放音乐的封面
- 如果音乐有 `coverPath`，显示真实封面
- 没有封面时，显示默认 SVG 封面
- 图片加载失败时自动隐藏，显示默认封面

```vue
<div class="music-cover">
  <img
    v-if="currentMusic?.coverPath"
    :src="currentMusic.coverPath"
    alt="封面"
    @error="handleImageError"
  />
  <DefaultCover v-else />
</div>
```

#### 播放列表（PlaylistManager.vue）
- 显示每个播放列表的封面
- 支持大尺寸封面展示
- 悬停时显示播放按钮

```vue
<div class="playlist-cover">
  <img
    v-if="playlist.coverPath"
    :src="playlist.coverPath"
    alt="封面"
    @error="(e: any) => e.target.style.display = 'none'"
  />
  <DefaultCover v-else size="large" />
</div>
```

### 3. 错误处理

**图片加载失败处理：**
- 监听 `@error` 事件
- 自动隐藏失败的 `<img>` 标签
- DefaultCover 组件自动显示

**优雅降级：**
```
1. 尝试加载真实封面
   ↓
2. 加载失败？隐藏 img 标签
   ↓
3. 显示 DefaultCover 组件
```

### 4. 样式设计

**DefaultCover 组件样式：**
- `border-radius: 4px/8px` - 圆角设计
- `overflow: hidden` - 裁剪超出部分
- `flex-shrink: 0` - 防止被压缩

**SVG 设计：**
- 线性渐变背景
- 手绘风格音符
- 支持主题色适配

## 使用方法

### 在组件中引入

```typescript
import DefaultCover from './DefaultCover.vue'
```

### 基本使用

```vue
<!-- 默认中等尺寸 -->
<DefaultCover />

<!-- 小尺寸 -->
<DefaultCover size="small" />

<!-- 大尺寸 -->
<DefaultCover size="large" />
```

### 与真实封面结合使用

```vue
<div class="cover-container">
  <img v-if="coverPath" :src="coverPath" @error="handleError" />
  <DefaultCover v-else :size="size" />
</div>
```

## 技术实现

### SVG 渐变

```xml
<linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
  <stop offset="100%" style="stop-color:#ff4757;stop-opacity:1" />
</linearGradient>
```

### 音符绘制

使用 SVG 的 `<circle>` 和 `<path>` 元素绘制音符：
- 两个音符符头（圆形）
- 音符符干（矩形）
- 音符连线（路径）

### Props 定义

```typescript
interface Props {
  size?: 'small' | 'medium' | 'large'
}

withDefaults(defineProps<Props>(), {
  size: 'medium'
})
```

## 未来优化

### 可能的改进方向

1. **多种风格**
   - 添加更多默认封面风格
   - 根据音乐类型显示不同封面

2. **动画效果**
   - 添加音符跳动动画
   - 渐变色循环变化

3. **自定义配置**
   - 允许用户自定义默认封面
   - 支持颜色主题切换

4. **封面生成**
   - 基于音乐信息自动生成独特封面
   - 使用 Canvas 绘制动态封面

## 注意事项

1. **图片路径**
   - 确保图片路径正确
   - 使用相对路径或绝对路径

2. **性能考虑**
   - SVG 轻量级，性能友好
   - 避免在大列表中频繁重绘

3. **样式继承**
   - DefaultCover 默认不继承父元素样式
   - 需要设置容器样式来控制布局

4. **主题适配**
   - 当前使用固定颜色
   - 如需主题适配，可以使用 CSS 变量

## 示例效果

```
┌─────────────────┐
│                 │
│   🎵  红茶馆    │  ← 有封面：显示真实封面
│      陈慧娴     │
│                 │
└─────────────────┘

┌─────────────────┐
│   ╔═══╗        │
│   ║🎵 ║        │  ← 无封面：显示默认 SVG
│   ╚═══╝        │
│                 │
└─────────────────┘
```

## 相关文件

- `src/renderer/components/DefaultCover.vue` - 默认封面组件
- `src/renderer/components/Footer.vue` - 播放器底部（使用默认封面）
- `src/renderer/components/PlaylistManager.vue` - 播放列表（使用默认封面）

## 更新日志

- **2024-01-XX**: 初始版本
  - 创建 DefaultCover 组件
  - 集成到播放器和播放列表
  - 添加错误处理机制
