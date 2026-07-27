<template>
  <!-- 经典唱片：大黑胶 + 中心镂空轴孔 + 弯唱臂（参考网易云） -->
  <div class="vinyl" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="vinyl-disc-wrap">
      <div class="vinyl-disc" :style="discStyle">
        <div class="vinyl-grooves" aria-hidden="true"></div>
        <!-- 标签环：封面贴在环上，正中镂空露出轴孔 -->
        <div class="vinyl-label">
          <img v-if="coverUrl" class="label-cover" :src="coverUrl" :alt="alt" @error="$emit('coverError')" />
          <div v-else class="label-fallback">
            <slot name="fallback" />
          </div>
          <!-- 中心镂空：真唱片轴孔，穿透标签看到「空洞」 -->
          <span class="vinyl-hole" aria-hidden="true"></span>
        </div>
        <div class="vinyl-sheen" aria-hidden="true"></div>
        <div class="vinyl-rim" aria-hidden="true"></div>
      </div>
    </div>

    <!-- 弯唱臂：枢轴 → 弯杆 → 唱头 -->
    <div class="vinyl-arm" aria-hidden="true">
      <span class="arm-pivot"></span>
      <span class="arm-curve"></span>
      <span class="arm-head"></span>
      <span class="arm-stylus"></span>
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

// 用 JS 累加角度：暂停停在当前角，续播从原角继续
const angle = ref(0)
let rafId = 0
let lastTs = 0

const ROTATE_SPEED = 18 // 度/秒，约黑胶观感

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
  --disc: #0e0f12;
  --disc-mid: #1a1c22;
  --disc-rim: #2a2d36;
  --groove: rgba(255, 255, 255, 0.045);
  --groove-strong: rgba(255, 255, 255, 0.11);
  --arm: #e8eaef;
  --arm-2: #b4b8c2;
  --shadow: 0 22px 56px rgba(0, 0, 0, 0.5);
  /* 中心镂空：用接近页面底色的深色模拟「打穿」，边缘高光勾出孔沿 */
  --hole: #06070a;
  --hole-ring: rgba(255, 255, 255, 0.28);

  position: relative;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  /* 给唱臂留右上角空间 */
  padding-top: 22px;
  padding-right: 28px;
}

.vinyl.is-light {
  --disc: #1c1e24;
  --disc-mid: #2c2f38;
  --disc-rim: #3e424c;
  --groove: rgba(255, 255, 255, 0.06);
  --groove-strong: rgba(255, 255, 255, 0.14);
  --arm: #9aa0ab;
  --arm-2: #6f7582;
  --shadow: 0 18px 44px rgba(20, 22, 26, 0.3);
  --hole: #101218;
  --hole-ring: rgba(255, 255, 255, 0.35);
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
  background:
    radial-gradient(circle at 50% 50%,
      var(--disc-mid) 0%,
      var(--disc) 52%,
      #08090c 88%,
      var(--disc-rim) 96%,
      #12141a 100%);
  box-shadow:
    var(--shadow),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    inset 0 0 40px rgba(0, 0, 0, 0.55);
  will-change: transform;
}

/* 密纹沟槽 + 分轨宽环 */
.vinyl-grooves {
  position: absolute;
  inset: 2.5%;
  border-radius: 50%;
  background:
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 1.5px,
      var(--groove) 1.5px,
      var(--groove) 2.5px
    ),
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 22px,
      var(--groove-strong) 22px,
      var(--groove-strong) 24px
    );
  /* 标签区不画纹，避免盖住封面 */
  -webkit-mask-image: radial-gradient(circle, transparent 31%, #000 32%);
  mask-image: radial-gradient(circle, transparent 31%, #000 32%);
}

/* 标签环：封面圆形贴在上面，正中留出镂空孔 */
.vinyl-label {
  position: absolute;
  inset: 30%;
  border-radius: 50%;
  overflow: hidden;
  background: var(--disc-mid);
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.55),
    0 0 0 3px rgba(255, 255, 255, 0.06),
    inset 0 0 22px rgba(0, 0, 0, 0.5);
}

.label-cover,
.label-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.label-cover {
  object-fit: cover;
  /* 中心挖空：封面圆环，露出底下轴孔 */
  -webkit-mask-image: radial-gradient(circle, transparent 14%, #000 15%);
  mask-image: radial-gradient(circle, transparent 14%, #000 15%);
}

.label-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-mask-image: radial-gradient(circle, transparent 14%, #000 15%);
  mask-image: radial-gradient(circle, transparent 14%, #000 15%);
}

.label-fallback :deep(*) {
  width: 100%;
  height: 100%;
}

/* 真正的中心镂空：比封面挖空略小一点的实体孔，带金属孔沿 */
.vinyl-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 13%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background:
    radial-gradient(circle at 40% 35%,
      rgba(255, 255, 255, 0.12) 0%,
      var(--hole) 45%,
      #000 100%);
  box-shadow:
    0 0 0 1.5px var(--hole-ring),
    0 0 0 3px rgba(0, 0, 0, 0.75),
    inset 0 2px 6px rgba(0, 0, 0, 0.9),
    inset 0 -1px 2px rgba(255, 255, 255, 0.15);
  z-index: 2;
}

/* 斜向高光 */
.vinyl-sheen {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.18) 0%,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0) 70%,
    rgba(255, 255, 255, 0.07) 100%
  );
  pointer-events: none;
}

/* 外圈亮边 */
.vinyl-rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

/* 唱臂整体绕右上枢轴旋转：暂停抬起、播放落下 */
.vinyl-arm {
  position: absolute;
  inset: 0;
  transform-origin: 88% 8%;
  transform: rotate(-42deg);
  transition: transform 0.75s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.vinyl.is-playing .vinyl-arm {
  transform: rotate(2deg);
}

.arm-pivot {
  position: absolute;
  left: 88%;
  top: 8%;
  width: 11%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 28%, #fff, var(--arm) 42%, var(--arm-2));
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

/* 弯杆：用粗边框画一段弧，比直线更像网易云唱臂 */
.arm-curve {
  position: absolute;
  left: 88%;
  top: 8%;
  width: 42%;
  height: 42%;
  transform: translate(-6%, -4%) rotate(8deg);
  border-radius: 50%;
  border: 5px solid transparent;
  border-right-color: var(--arm);
  border-bottom-color: var(--arm-2);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.12);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

.arm-head {
  position: absolute;
  left: 88%;
  top: 8%;
  width: 7%;
  height: 9%;
  border-radius: 2px 3px 3px 2px;
  background: linear-gradient(160deg, var(--arm), var(--arm-2));
  transform-origin: top center;
  /* 落到盘面靠外圈 */
  transform: translate(-50%, 0) rotate(48deg) translateY(455%);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
}

.arm-stylus {
  position: absolute;
  left: 88%;
  top: 8%;
  width: 2px;
  height: 3.5%;
  border-radius: 1px;
  background: #cfd2d8;
  transform-origin: top center;
  transform: translate(-50%, 0) rotate(48deg) translateY(620%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
</style>
