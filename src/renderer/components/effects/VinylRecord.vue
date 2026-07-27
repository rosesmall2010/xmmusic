<template>
  <!-- 经典唱片：唱臂在上方，播放时压到盘面并带动唱片旋转（参考网易云音乐） -->
  <div class="vinyl" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="vinyl-disc-wrap">
      <div class="vinyl-disc" :style="discStyle">
        <!-- 盘面纹路由 CSS 重复渐变生成，避免额外图片资源 -->
        <div class="vinyl-grooves" aria-hidden="true"></div>
        <div class="vinyl-label">
          <img v-if="coverUrl" :src="coverUrl" :alt="alt" @error="$emit('coverError')" />
          <slot v-else name="fallback" />
          <span class="vinyl-spindle" aria-hidden="true"></span>
        </div>
        <div class="vinyl-sheen" aria-hidden="true"></div>
      </div>
    </div>

    <div class="vinyl-arm" aria-hidden="true">
      <span class="arm-pivot"></span>
      <span class="arm-rod"></span>
      <span class="arm-head"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  coverUrl?: string | null
  active?: boolean
  light?: boolean
  alt?: string
}>(), {
  coverUrl: null,
  active: false,
  light: false,
  alt: ''
})

defineEmits<{ (e: 'coverError'): void }>()

// 用 JS 累加角度而不是 CSS animation：暂停时要停在当前角度，
// 恢复播放要从原角度继续，CSS animation-play-state 在多次切歌后容易错位
const angle = ref(0)
let rafId = 0
let lastTs = 0

const ROTATE_SPEED = 18 // 度/秒，约 3 转/分钟的观感，慢速更接近黑胶

const step = (ts: number) => {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  angle.value = (angle.value + ROTATE_SPEED * dt) % 360
  rafId = requestAnimationFrame(step)
}

const start = () => {
  if (rafId) return
  lastTs = 0
  rafId = requestAnimationFrame((ts) => {
    lastTs = ts
    rafId = requestAnimationFrame(step)
  })
}

const stop = () => {
  cancelAnimationFrame(rafId)
  rafId = 0
}

watch(() => props.active, (v) => (v ? start() : stop()), { immediate: true })

onBeforeUnmount(stop)

const discStyle = computed(() => ({ transform: `rotate(${angle.value}deg)` }))
</script>

<style scoped>
.vinyl {
  --disc: #14151a;
  --disc-2: #24262e;
  --groove: rgba(255, 255, 255, 0.055);
  --groove-strong: rgba(255, 255, 255, 0.12);
  --arm: #c9ccd4;
  --arm-2: #9aa0ab;
  --shadow: 0 20px 60px rgba(0, 0, 0, 0.45);

  position: relative;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  /* 给唱臂留出右上角空间，避免被父级裁掉 */
  padding-top: 18px;
  padding-right: 18px;
}

.vinyl.is-light {
  --disc: #2b2d34;
  --disc-2: #3d4049;
  --groove: rgba(255, 255, 255, 0.075);
  --groove-strong: rgba(255, 255, 255, 0.16);
  --arm: #8d939e;
  --arm-2: #6b7280;
  --shadow: 0 18px 44px rgba(20, 22, 26, 0.28);
}

.vinyl-disc-wrap {
  width: 100%;
  aspect-ratio: 1;
}

.vinyl-disc {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, var(--disc-2) 0%, var(--disc) 58%, #08090c 92%, #1b1d24 100%);
  box-shadow: var(--shadow), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  /* 旋转角度由 JS 每帧写入，这里不加 transition 以免抖动 */
  will-change: transform;
}

.vinyl-grooves {
  position: absolute;
  inset: 3%;
  border-radius: 50%;
  /* 密纹沟槽 + 几道分轨宽环，转起来才有黑胶质感 */
  background:
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 2px,
      var(--groove) 2px,
      var(--groove) 3px
    ),
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 26px,
      var(--groove-strong) 26px,
      var(--groove-strong) 28px
    );
}

.vinyl-label {
  position: absolute;
  inset: 31%;
  border-radius: 50%;
  overflow: hidden;
  background: var(--disc-2);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 18px rgba(0, 0, 0, 0.45);
}

.vinyl-label img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 中心轴孔 */
.vinyl-spindle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #0a0b0e;
  box-shadow: inset 0 0 4px rgba(255, 255, 255, 0.25);
}

/* 斜向高光：让盘面有反光而不是死黑 */
.vinyl-sheen {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0) 32%,
    rgba(255, 255, 255, 0) 68%,
    rgba(255, 255, 255, 0.08) 100%
  );
  pointer-events: none;
}

/* 唱臂：三个部件都以右上角的转轴 (90%, 6%) 为基准，整体绕转轴抬起/落下 */
.vinyl-arm {
  position: absolute;
  inset: 0;
  transform-origin: 90% 6%;
  transform: rotate(-45deg);
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 播放时唱针落到盘面靠外圈的位置 */
.vinyl.is-playing .vinyl-arm {
  transform: rotate(0deg);
}

.arm-pivot {
  position: absolute;
  left: 90%;
  top: 6%;
  width: 10%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, var(--arm), var(--arm-2));
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
}

.arm-rod {
  position: absolute;
  left: 90%;
  top: 6%;
  width: 5px;
  height: 34%;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--arm), var(--arm-2));
  transform-origin: top center;
  transform: translateX(-50%) rotate(42deg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* 唱头：沿唱臂方向推到杆的末端 */
.arm-head {
  position: absolute;
  left: 90%;
  top: 6%;
  width: 6.5%;
  height: 8%;
  border-radius: 2px;
  background: linear-gradient(160deg, var(--arm), var(--arm-2));
  transform-origin: top center;
  transform: translateX(-50%) rotate(42deg) translateY(365%);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
}
</style>
