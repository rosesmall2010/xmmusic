<template>
  <!-- CD：封面铺满整盘，canvas 只叠外圈同心纹与外缘高光；旋转时转整盘位图容器 -->
  <div class="cd-disc" :class="{ 'is-light': light }">
    <div class="cd-stage">
      <div ref="discRef" class="cd-body">
        <div class="cd-label">
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
        </div>
        <canvas ref="canvasRef" class="cd-canvas" aria-hidden="true"></canvas>
        <span class="cd-hub" aria-hidden="true"></span>
      </div>
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
}>(), {
  coverUrl: null,
  active: false,
  light: false,
  alt: ''
})

defineEmits<{ (e: 'coverError'): void }>()

const discRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 直写 DOM transform，避免每帧触发 Vue 响应式更新（与 VinylRecord 一致）
let angle = 0
let rafId = 0
let lastTs = 0
let mounted = false

const ROTATE_SPEED = 24 // 度/秒，比黑胶略快

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

/** 把 CD 外圈纹路与外缘高光画到 canvas（透明底），不盖住封面对比度 */
const drawDisc = () => {
  const canvas = canvasRef.value
  const el = discRef.value
  if (!canvas || !el) return
  const size = el.clientWidth
  if (!size) return

  // 封顶 1.5，避免高缩放下 canvas 像素暴涨（与其它特效组件一致）
  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 1.5)
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()

  // 仅外圈数据区细纹（中心留给封面），source-over 低透明，不用 soft-light 以免发灰
  const grooveColor = props.light ? 'rgba(80,88,100,0.18)' : 'rgba(255,255,255,0.12)'
  for (let rr = r * 0.42; rr < r * 0.995; rr += size * 0.006) {
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.lineWidth = Math.max(1, size * 0.0012)
    ctx.strokeStyle = grooveColor
    ctx.stroke()
  }

  // 外缘高光描边
  ctx.beginPath()
  ctx.arc(cx, cy, r - size * 0.004, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1, size * 0.006)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.stroke()

  ctx.restore()
}

watch(() => props.active, (v) => {
  if (!mounted) return
  v ? start() : stop()
})

const { width: discWidth } = useElementSize(discRef)

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

// CSS 尺寸不变但 DPR 变了（拖到不同 DPI 屏）时用 matchMedia 主动感知（与 VinylRecord 一致）
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
.cd-disc {
  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
  height: auto;
  margin: 0 auto;
}

.cd-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}

.cd-body {
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  will-change: transform;
}

.cd-canvas {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 2;
  pointer-events: none;
}

/* 封面铺满整盘，canvas 纹路叠在其上，中心留孔给 cd-hub */
.cd-label {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  z-index: 1;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35),
    inset 0 0 12px rgba(0, 0, 0, 0.35);
}

.label-cover,
.label-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* 中心孔透明，尺寸与 cd-hub 对齐 */
  -webkit-mask-image: radial-gradient(circle, transparent 7%, #000 8%);
  mask-image: radial-gradient(circle, transparent 7%, #000 8%);
}

.label-cover {
  object-fit: cover;
}

.label-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.label-fallback :deep(*) {
  width: 100%;
  height: 100%;
}

/* 中心夹持环高光 */
.cd-hub {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 15%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  z-index: 3;
  background:
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0.55) 0%,
      rgba(210, 216, 226, 0.5) 30%,
      rgba(150, 156, 168, 0.35) 55%,
      rgba(120, 126, 138, 0.25) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.4),
    inset 0 1px 2px rgba(255, 255, 255, 0.5);
}
</style>
