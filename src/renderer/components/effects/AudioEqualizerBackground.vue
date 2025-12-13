<template>
  <canvas ref="canvasRef" class="eq-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 基础色（来自封面平均色），用于让均衡器配色随歌曲变化 */
  baseColor?: string
  /** 是否处于播放状态（暂停时降低强度） */
  active?: boolean
}>(), {
  baseColor: '#31c27c',
  active: false
})

type RGB = { r: number; g: number; b: number }

const canvasRef = ref<HTMLCanvasElement | null>(null)
const equalizer = useEqualizer()

let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let dpr = 1
let width = 0
let height = 0

// 频谱缓存
let spectrum: Uint8Array | null = null
// 柱子平滑缓存（0-1）
let smoothed: number[] = []

// 配色
let baseRgb: RGB = { r: 49, g: 194, b: 124 }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const parseColorToRgb = (color: string): RGB | null => {
  const c = color.trim()
  if (c.startsWith('rgb')) {
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (!m) return null
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }
  const h = c.replace('#', '')
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h
  if (full.length !== 6) return null
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const rgba = (c: RGB, a: number) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`

const ensureAudioNodes = () => {
  const el = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
  if (!el) return
  equalizer.initAudioContext(el)
}

const resize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  dpr = Math.max(1, window.devicePixelRatio || 1)
  width = Math.max(1, Math.floor(rect.width))
  height = Math.max(1, Math.floor(rect.height))
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx = canvas.getContext('2d', { alpha: true })
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

const getFrequency = (): Uint8Array | null => {
  if (!equalizer.getFrequencyData) return null
  const data = equalizer.getFrequencyData(spectrum ?? undefined)
  if (!data) return null
  spectrum = data
  return data
}

const roundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  c.beginPath()
  c.moveTo(x + rr, y)
  c.lineTo(x + w - rr, y)
  c.quadraticCurveTo(x + w, y, x + w, y + rr)
  c.lineTo(x + w, y + h - rr)
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  c.lineTo(x + rr, y + h)
  c.quadraticCurveTo(x, y + h, x, y + h - rr)
  c.lineTo(x, y + rr)
  c.quadraticCurveTo(x, y, x + rr, y)
  c.closePath()
}

let lastTs = 0
let time = 0
const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  // 背景拖尾（类似示例图的“光带残影”）
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)'
  ctx.fillRect(0, 0, width, height)

  const data = getFrequency()
  const activeFactor = props.active ? 1 : 0.25

  // 没有频谱数据时，回退轻微动态，避免静止
  const fallback = 0.25 + 0.2 * Math.sin(time * 2.1) + 0.12 * Math.sin(time * 5.3)

  // 柱子数量（越多越像图中那种“密集均衡器”）
  const bars = Math.max(48, Math.min(120, Math.floor(width / 12)))
  if (smoothed.length !== bars) smoothed = Array.from({ length: bars }).map(() => 0)

  // 频谱映射到 bars（偏向中低频，让变化更明显）
  const len = data?.length ?? 0
  const startBin = Math.floor(len * 0.02)
  const endBin = Math.max(startBin + 1, Math.floor(len * 0.55))

  // 布局：底部中央为主的“舞台感”
  const paddingX = Math.max(18, width * 0.08)
  const usableW = Math.max(1, width - paddingX * 2)
  const gap = 3
  const barW = Math.max(3, Math.floor((usableW - gap * (bars - 1)) / bars))
  const baselineY = height * 0.85
  const maxH = height * 0.55

  // 光色渐变（向上更亮）
  const grad = ctx.createLinearGradient(0, baselineY - maxH, 0, baselineY)
  grad.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, 0.88))
  grad.addColorStop(0.35, rgba(baseRgb, 0.72))
  grad.addColorStop(1, rgba(baseRgb, 0.22))

  // 底部柔光（像图里的光晕）
  const glow = ctx.createRadialGradient(width * 0.5, baselineY + 40, 0, width * 0.5, baselineY + 40, height * 0.55)
  glow.addColorStop(0, rgba(baseRgb, (0.16 + 0.22 * (data ? 1 : 0)) * activeFactor))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = grad

  // 透视微缩放：两侧略短（更接近示例图的“中心聚焦”）
  for (let i = 0; i < bars; i++) {
    let v01 = fallback
    if (data && len > 0) {
      const t01 = i / Math.max(1, bars - 1)
      const bin = Math.floor(startBin + (endBin - startBin) * t01)
      const v = data[Math.max(0, Math.min(len - 1, bin))] / 255
      v01 = v
    }

    // 平滑（让柱子更“音乐感”，不会抖动太碎）
    const target = clamp01(v01 * 1.35) * activeFactor
    const smooth = smoothed[i] = smoothed[i] + (target - smoothed[i]) * (0.18 + (props.active ? 0.18 : 0.06))

    const centerFocus = 1 - Math.abs(i / (bars - 1) - 0.5) * 2
    const perspective = 0.55 + centerFocus * 0.55
    const h = Math.max(2, smooth * maxH * perspective)

    const x = paddingX + i * (barW + gap)
    const y = baselineY - h

    // 轻微左右摆动（让画面更“活”但不抢内容）
    const wobble = Math.sin(time * 0.9 + i * 0.22) * (props.active ? 0.6 : 0.25)
    const xx = x + wobble

    // 发光阴影
    ctx.shadowColor = rgba(baseRgb, 0.55 * smooth)
    ctx.shadowBlur = 14 + smooth * 26

    roundRect(ctx, xx, y, barW, h, Math.min(8, barW * 0.45))
    ctx.fill()

    // 顶部高光线
    if (smooth > 0.08) {
      ctx.shadowBlur = 0
      ctx.strokeStyle = rgba({ r: 255, g: 255, b: 255 }, 0.10 + smooth * 0.22)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xx + 1, y + 1)
      ctx.lineTo(xx + barW - 1, y + 1)
      ctx.stroke()
    }
  }

  // 底部虚化遮罩（让柱子融入背景，避免硬边）
  ctx.globalCompositeOperation = 'source-over'
  const fade = ctx.createLinearGradient(0, baselineY - maxH, 0, height)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.72, 'rgba(0,0,0,0.06)')
  fade.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, width, height)
}

const onResize = () => resize()

onMounted(() => {
  ensureAudioNodes()
  resize()
  window.addEventListener('resize', onResize)
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  smoothed = []
})

watch(() => props.baseColor, (c) => {
  const rgb = c ? parseColorToRgb(c) : null
  if (rgb) baseRgb = rgb
}, { immediate: true })

watch(() => props.active, (v) => {
  if (v) ensureAudioNodes()
})
</script>

<style scoped>
.eq-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

