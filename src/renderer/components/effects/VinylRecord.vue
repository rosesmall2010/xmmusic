<template>
  <!-- 经典黑胶：盘面纹理烧到 canvas 位图上只画一次，旋转时只转这一张位图，
       避免 repeating-radial-gradient 唱纹 mask + mix-blend-mode 光泽在旋转的每一帧都被重新合成/重绘 -->
  <div class="vinyl" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="vinyl-stage">
      <div ref="discRef" class="vinyl-disc">
        <canvas ref="canvasRef" class="vinyl-disc-canvas" aria-hidden="true"></canvas>
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
      </div>

      <svg v-if="showArm" class="vinyl-arm" viewBox="0 0 100 100" aria-hidden="true">
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
import { useElementSize } from '@vueuse/core'

const props = withDefaults(defineProps<{
  coverUrl?: string | null
  active?: boolean
  light?: boolean
  alt?: string
  showArm?: boolean
}>(), {
  coverUrl: null,
  active: false,
  light: false,
  alt: '',
  showArm: true
})

defineEmits<{ (e: 'coverError'): void }>()

const discRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

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

// 盘面配色：对应原来 .vinyl / .vinyl.is-light 的 CSS 变量取值
const DARK_COLORS = {
  discMid: '#14161c',
  disc: '#0a0b0e',
  discHi: '#22252e',
  groove: 'rgba(255, 255, 255, 0.055)',
  grooveStrong: 'rgba(255, 255, 255, 0.12)'
}
const LIGHT_COLORS = {
  discMid: '#1c1f27',
  disc: '#12141a',
  discHi: '#2a2e38',
  groove: 'rgba(255, 255, 255, 0.07)',
  grooveStrong: 'rgba(255, 255, 255, 0.15)'
}

/** 把盘面纹理（底色渐变+唱纹+边缘高光+光泽扫光）一次性画到 canvas 上，旋转时只转这张位图 */
const drawDisc = () => {
  const canvas = canvasRef.value
  const el = discRef.value
  if (!canvas || !el) return
  const size = el.clientWidth
  if (!size) return

  // 封顶到 1.5，避免 Windows 高缩放下 canvas 栅格化像素暴涨（与同目录其它特效组件一致）
  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 1.5)
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const colors = props.light ? LIGHT_COLORS : DARK_COLORS
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()

  // 唱片底色
  const platter = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  platter.addColorStop(0, colors.discMid)
  platter.addColorStop(0.48, colors.disc)
  platter.addColorStop(0.78, '#07080b')
  platter.addColorStop(0.92, colors.discHi)
  platter.addColorStop(1, '#0c0d11')
  ctx.fillStyle = platter
  ctx.fillRect(0, 0, size, size)

  // 边缘暗角：对应旧版 platter 的 inset 36px 内阴影
  const vignette = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r)
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, size, size)

  // 唱纹：中心标签区之外的同心细纹，密纹 + 每隔几圈一条稍粗的纹
  for (let rr = r * 0.3; rr < r * 0.995; rr += size * 0.009) {
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.lineWidth = Math.max(1, size * 0.0016)
    ctx.strokeStyle = colors.groove
    ctx.stroke()
  }
  for (let rr = r * 0.3; rr < r * 0.995; rr += size * 0.07) {
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.lineWidth = Math.max(1, size * 0.003)
    ctx.strokeStyle = colors.grooveStrong
    ctx.stroke()
  }

  // 边缘高光/暗角
  ctx.beginPath()
  ctx.arc(cx, cy, r - size * 0.004, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1, size * 0.006)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r - size * 0.01, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1, size * 0.012)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.stroke()

  // 光泽扫光：用 soft-light 合成烧一次到位图里，不再是每帧重算的 mix-blend-mode 图层
  ctx.globalCompositeOperation = 'soft-light'
  const angleRad = (128 * Math.PI) / 180
  // CSS linear-gradient(angle) 的方向向量是 (sin, -cos)，不是 (cos, sin)
  const sheen = ctx.createLinearGradient(0, 0, size * Math.sin(angleRad), -size * Math.cos(angleRad))
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.2)')
  sheen.addColorStop(0.28, 'rgba(255, 255, 255, 0)')
  sheen.addColorStop(0.68, 'rgba(255, 255, 255, 0)')
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0.08)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, size, size)

  ctx.restore()
}

watch(() => props.active, (v) => {
  if (!mounted) return
  v ? start() : stop()
})

const { width: discWidth } = useElementSize(discRef)

// 拖拽缩放窗口时 discWidth 每帧都会变化，合并到下一帧只画一次，避免连续触发整套绘制
let drawScheduled = false
const scheduleDraw = () => {
  if (drawScheduled) return
  drawScheduled = true
  requestAnimationFrame(() => {
    drawScheduled = false
    drawDisc()
  })
}

watch([discWidth, () => props.light], scheduleDraw)

// CSS 尺寸不变但 devicePixelRatio 变了（比如把窗口拖到不同 DPI 的显示器）时，
// resize/ResizeObserver 都不会触发，用 matchMedia 的 resolution 查询主动感知
let dprQuery: MediaQueryList | null = null
const onDprChange = () => {
  scheduleDraw()
  watchDpr()
}
const watchDpr = () => {
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprQuery.addEventListener('change', onDprChange, { once: true })
}

onMounted(() => {
  mounted = true
  drawDisc()
  applyAngle()
  if (props.active) start()
  watchDpr()
})

onBeforeUnmount(() => {
  mounted = false
  stop()
  dprQuery?.removeEventListener('change', onDprChange)
  dprQuery = null
})
</script>

<style scoped>
.vinyl {
  --shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  --label-ring: rgba(255, 255, 255, 0.08);
  --hole: #050608;
  --arm-metal: #d7dbe3;
  --arm-metal-2: #9aa1ad;
  --arm-shadow: rgba(0, 0, 0, 0.45);

  position: relative;
  /* 默认撑满父级；NowPlaying 容器 query 会覆盖为 min(100%, 100cqh) */
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
  height: auto;
  margin: 0 auto;
}

.vinyl.is-light {
  --shadow: 0 8px 18px rgba(20, 22, 26, 0.18);
  --label-ring: rgba(255, 255, 255, 0.12);
  --hole: #0c0e13;
  --arm-metal: #aeb4bf;
  --arm-metal-2: #7a8190;
  --arm-shadow: rgba(20, 22, 26, 0.2);
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

.vinyl-disc-canvas {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: var(--shadow);
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
