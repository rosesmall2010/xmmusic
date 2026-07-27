<template>
  <!-- 经典黑胶：密纹盘面 + 封面标签环 + 中心轴孔 + 完整金属唱臂 -->
  <div class="vinyl" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="vinyl-stage">
      <div ref="discRef" class="vinyl-disc">
        <div class="vinyl-platter" aria-hidden="true"></div>
        <div class="vinyl-grooves" aria-hidden="true"></div>
        <div class="vinyl-rim" aria-hidden="true"></div>
        <div class="vinyl-label">
          <img
            v-if="coverUrl"
            class="label-cover"
            :src="coverUrl"
            :alt="alt"
            @error="$emit('coverError')"
          />
          <div v-else class="label-fallback">
            <slot name="fallback" />
          </div>
          <span class="vinyl-spindle" aria-hidden="true">
            <span class="spindle-hole"></span>
          </span>
        </div>
        <div class="vinyl-sheen" aria-hidden="true"></div>
      </div>

      <svg class="vinyl-arm" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="86" cy="10" r="6.2" class="arm-base" />
        <circle cx="86" cy="10" r="3.4" class="arm-pivot" />
        <circle cx="86" cy="10" r="1.2" class="arm-pivot-core" />
        <path
          class="arm-rod"
          d="M 86 12
             C 86 28, 78 42, 62 52
             C 52 58, 44 62, 38 66"
          fill="none"
          stroke-linecap="round"
        />
        <rect
          class="arm-head"
          x="33.5"
          y="64"
          width="7.5"
          height="5.2"
          rx="1.1"
          transform="rotate(28 37 66.5)"
        />
        <line
          class="arm-stylus"
          x1="36.2"
          y1="69.2"
          x2="34.4"
          y2="73.6"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

const discRef = ref<HTMLElement | null>(null)

// 直写 DOM transform，避免每帧触发 Vue 响应式更新
let angle = 0
let rafId = 0
let lastTs = 0
let mounted = false

const ROTATE_SPEED = 18 // 度/秒

const applyAngle = () => {
  const el = discRef.value
  if (el) el.style.transform = `rotate(${angle}deg)`
}

const step = (ts: number) => {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  angle = (angle + ROTATE_SPEED * dt) % 360
  applyAngle()
  rafId = requestAnimationFrame(step)
}

const start = () => {
  if (!mounted || rafId) return
  lastTs = 0
  applyAngle()
  rafId = requestAnimationFrame((ts) => {
    lastTs = ts
    rafId = requestAnimationFrame(step)
  })
}

const stop = () => {
  cancelAnimationFrame(rafId)
  rafId = 0
}

watch(() => props.active, (v) => {
  if (!mounted) return
  v ? start() : stop()
})

onMounted(() => {
  mounted = true
  applyAngle()
  if (props.active) start()
})

onBeforeUnmount(() => {
  mounted = false
  stop()
})
</script>

<style scoped>
.vinyl {
  --disc: #0a0b0e;
  --disc-mid: #14161c;
  --disc-hi: #22252e;
  --groove: rgba(255, 255, 255, 0.055);
  --groove-strong: rgba(255, 255, 255, 0.12);
  --label-ring: rgba(255, 255, 255, 0.08);
  --shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  --hole: #050608;
  --arm-metal: #d7dbe3;
  --arm-metal-2: #9aa1ad;
  --arm-shadow: rgba(0, 0, 0, 0.45);

  position: relative;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}

.vinyl.is-light {
  --disc: #12141a;
  --disc-mid: #1c1f27;
  --disc-hi: #2a2e38;
  --groove: rgba(255, 255, 255, 0.07);
  --groove-strong: rgba(255, 255, 255, 0.15);
  --label-ring: rgba(255, 255, 255, 0.12);
  --shadow: 0 16px 40px rgba(20, 22, 26, 0.28);
  --hole: #0c0e13;
  --arm-metal: #aeb4bf;
  --arm-metal-2: #7a8190;
  --arm-shadow: rgba(20, 22, 26, 0.28);
}

.vinyl-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: visible;
}

.vinyl-disc {
  position: absolute;
  inset: 6% 8% 8% 8%;
  border-radius: 50%;
  will-change: transform;
}

.vinyl-platter {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%,
      var(--disc-mid) 0%,
      var(--disc) 48%,
      #07080b 78%,
      var(--disc-hi) 92%,
      #0c0d11 100%);
  box-shadow:
    var(--shadow),
    inset 0 0 0 1px rgba(255, 255, 255, 0.1),
    inset 0 0 36px rgba(0, 0, 0, 0.65),
    0 0 0 1px rgba(0, 0, 0, 0.35);
}

.vinyl-grooves {
  position: absolute;
  inset: 1.8%;
  border-radius: 50%;
  background:
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 1px,
      var(--groove) 1px,
      var(--groove) 1.8px
    ),
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      transparent 14px,
      var(--groove-strong) 14px,
      var(--groove-strong) 15.2px
    );
  -webkit-mask-image: radial-gradient(circle, transparent 28%, #000 29.2%);
  mask-image: radial-gradient(circle, transparent 28%, #000 29.2%);
  opacity: 0.95;
}

.vinyl-rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1.5px rgba(255, 255, 255, 0.12),
    inset 0 0 0 4px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.vinyl-label {
  position: absolute;
  inset: 28%;
  border-radius: 50%;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%,
      #1a1c22 0%,
      #12141a 70%,
      #0c0d11 100%);
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.7),
    0 0 0 3px var(--label-ring),
    inset 0 0 18px rgba(0, 0, 0, 0.55);
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
  -webkit-mask-image: radial-gradient(circle, transparent 12%, #000 13.2%);
  mask-image: radial-gradient(circle, transparent 12%, #000 13.2%);
}

.label-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-mask-image: radial-gradient(circle, transparent 12%, #000 13.2%);
  mask-image: radial-gradient(circle, transparent 12%, #000 13.2%);
}

.label-fallback :deep(*) {
  width: 100%;
  height: 100%;
}

.vinyl-spindle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 50%,
      rgba(255, 255, 255, 0.16) 0%,
      rgba(180, 185, 195, 0.35) 28%,
      rgba(40, 42, 48, 0.9) 52%,
      #090a0d 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.25),
    0 0 0 2.5px rgba(0, 0, 0, 0.75),
    inset 0 1px 2px rgba(255, 255, 255, 0.25);
  z-index: 3;
}

.spindle-hole {
  width: 46%;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 40% 35%,
      rgba(255, 255, 255, 0.08) 0%,
      var(--hole) 48%,
      #000 100%);
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.95),
    inset 0 -1px 1px rgba(255, 255, 255, 0.12);
}

.vinyl-sheen {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    128deg,
    rgba(255, 255, 255, 0.2) 0%,
    rgba(255, 255, 255, 0) 28%,
    rgba(255, 255, 255, 0) 68%,
    rgba(255, 255, 255, 0.08) 100%
  );
  pointer-events: none;
  mix-blend-mode: soft-light;
}

.vinyl-arm {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 5;
  transform-origin: 86% 10%;
  transform: rotate(-38deg);
  transition: transform 0.75s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 3px 6px var(--arm-shadow));
}

.vinyl.is-playing .vinyl-arm {
  transform: rotate(0deg);
}

.arm-base {
  fill: #8b919c;
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 0.4;
}

.arm-pivot {
  fill: var(--arm-metal);
}

.arm-pivot-core {
  fill: #5c6370;
}

.arm-rod {
  stroke: var(--arm-metal);
  stroke-width: 2.4;
}

.arm-head {
  fill: var(--arm-metal-2);
  stroke: var(--arm-metal);
  stroke-width: 0.5;
}

.arm-stylus {
  stroke: #c9ced6;
  stroke-width: 0.9;
}
</style>
