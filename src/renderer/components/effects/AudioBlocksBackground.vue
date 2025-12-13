<template>
  <canvas ref="canvasRef" class="blocks-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 基础色（一般来自歌曲封面平均色），用于让方块配色随歌曲变化 */
  baseColor?: string
  /** 是否处于播放状态（暂停时降低强度） */
  active?: boolean
}>(), {
  baseColor: '#31c27c',
  active: false
})

type RGB = { r: number; g: number; b: number }
type Block = {
  x: number
  y: number
  size: number
  vx: number
  vy: number
  phase: number
  band: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const equalizer = useEqualizer()

let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let dpr = 1
let width = 0
let height = 0

let blocks: Block[] = []
let lastTs = 0
let t = 0

let spectrum: Uint8Array | null = null
let waveform: Uint8Array | null = null

let baseRgb: RGB = { r: 49, g: 194, b: 124 }
let altRgb: RGB = { r: 255, g: 255, b: 255 }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

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

const mixRgb = (a: RGB, b: RGB, k: number): RGB => {
  const t = clamp01(k)
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  }
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

const rebuildBlocks = () => {
  // 方块数量：随画面尺寸自适应（控制性能）
  const area = width * height
  const count = Math.max(140, Math.min(520, Math.floor(area / 4200)))
  blocks = Array.from({ length: count }).map(() => {
    const size = 6 + Math.random() * 16
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      size,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      phase: Math.random() * Math.PI * 2,
      band: Math.floor(Math.random() * 18) // 映射到频谱“能量桶”
    }
  })
}

const getFeatures = () => {
  // energy: 0-1（主要用于节奏强度），centroid: 0-1（“音调变化”感觉），rms: 0-1（音量）
  let energy = -1
  let centroid = 0
  let rms = 0

  if (equalizer.getFrequencyData) {
    const data = equalizer.getFrequencyData(spectrum ?? undefined)
    if (data) {
      spectrum = data
      const len = data.length
      const lowEnd = Math.max(8, Math.floor(len * 0.22))
      let lowSum = 0
      for (let i = 0; i < lowEnd; i++) lowSum += data[i]
      energy = clamp01((lowSum / lowEnd / 255) * 2.2)

      let wSum = 0
      let iwSum = 0
      for (let i = 0; i < len; i++) {
        const v = data[i] / 255
        wSum += v
        iwSum += v * i
      }
      centroid = wSum > 0 ? clamp01((iwSum / wSum) / Math.max(1, len - 1)) : 0
    }
  }

  if (equalizer.getTimeDomainData) {
    const data = equalizer.getTimeDomainData(waveform ?? undefined)
    if (data) {
      waveform = data
      let sumSq = 0
      for (let i = 0; i < data.length; i++) {
        const x = (data[i] - 128) / 128
        sumSq += x * x
      }
      rms = clamp01(Math.sqrt(sumSq / data.length) * 2.6)
      energy = energy < 0 ? rms : clamp01(energy * 0.65 + rms * 0.35)
    }
  }

  if (energy < 0) {
    // 回退：无音频数据时，给一点动态
    energy = clamp01(0.18 + 0.22 * Math.sin(t * 2.2) + 0.12 * Math.sin(t * 5.1))
    centroid = clamp01(0.5 + 0.5 * Math.sin(t * 0.7))
    rms = clamp01(0.28 + 0.22 * Math.sin(t * 2.7))
  }

  return { energy, centroid, rms }
}

const energyForBand = (band: number) => {
  if (!spectrum || spectrum.length === 0) return 0
  // 把频谱压缩到 18 桶
  const buckets = 18
  const len = spectrum.length
  const start = Math.floor((band / buckets) * len)
  const end = Math.max(start + 1, Math.floor(((band + 1) / buckets) * len))
  let sum = 0
  for (let i = start; i < end; i++) sum += spectrum[i]
  return clamp01((sum / (end - start)) / 255)
}

const draw = (ts: number) => {
  rafId = requestAnimationFrame(draw)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  t += dt

  const activeFactor = props.active ? 1 : 0.25
  const { energy, centroid, rms } = getFeatures()
  const pulse = clamp01(energy + rms * 0.35) * activeFactor

  // 轻微暗化叠影，形成拖尾（颗粒感更强）
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, width, height)

  // 颜色：随“音调”在 base/alt 之间轻微偏移
  const tint = mixRgb(baseRgb, altRgb, centroid * 0.25)

  // 画方块
  ctx.globalCompositeOperation = 'lighter'
  for (const b of blocks) {
    const bandE = energyForBand(b.band)
    const local = clamp01(bandE * 0.85 + pulse * 0.55)

    // 速度/漂移：随节奏变
    const drift = (0.25 + local) * (12 + pulse * 40)
    b.x += (b.vx + Math.sin(t * 0.8 + b.phase) * drift) * dt
    b.y += (b.vy + Math.cos(t * 0.7 + b.phase) * drift) * dt
    if (b.x < -50) b.x = width + 50
    if (b.x > width + 50) b.x = -50
    if (b.y < -50) b.y = height + 50
    if (b.y > height + 50) b.y = -50

    // 大小/透明度：随音频变化
    const s = b.size * (0.75 + local * 1.25)
    const a = (0.04 + local * 0.22) * (props.active ? 1 : 0.65)

    // 让画面更“颗粒”：随机栅格对齐一点点
    const snap = 2
    const x = Math.round(b.x / snap) * snap
    const y = Math.round(b.y / snap) * snap

    // 单色+边缘高光
    ctx.fillStyle = rgba(tint, a)
    ctx.fillRect(x, y, s, s)

    if (local > 0.35) {
      ctx.strokeStyle = rgba({ r: 255, g: 255, b: 255 }, a * 0.35)
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
    }
  }
}

const onResize = () => {
  resize()
  rebuildBlocks()
}

onMounted(() => {
  ensureAudioNodes()
  onResize()
  window.addEventListener('resize', onResize)
  rafId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  blocks = []
})

watch(() => props.baseColor, (c) => {
  const rgb = c ? parseColorToRgb(c) : null
  if (rgb) {
    baseRgb = rgb
    // 备用高光色：根据 base 色自动偏亮
    altRgb = mixRgb({ r: 255, g: 255, b: 255 }, rgb, 0.15)
  }
}, { immediate: true })

watch(() => props.active, (v) => {
  if (v) ensureAudioNodes()
})
</script>

<style scoped>
.blocks-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

