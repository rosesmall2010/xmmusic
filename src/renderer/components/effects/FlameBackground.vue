<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 基础色（一般来自歌曲封面主色），用于让火焰随歌曲变化 */
  baseColor?: string
  /** 是否处于播放状态（暂停时降低特效强度） */
  active?: boolean
}>(), {
  baseColor: '#ff6a00',
  active: false
})

type RGB = { r: number; g: number; b: number }
type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  maxLife: number
  heat: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const equalizer = useEqualizer()

let rafId = 0
let ctx: CanvasRenderingContext2D | null = null
let dpr = 1
let width = 0
let height = 0

let particles: Particle[] = []
let lastTs = 0
let time = 0

// 频谱缓存（避免每帧创建新数组）
let spectrum: Uint8Array | null = null

// 调色板
let baseRgb: RGB = { r: 255, g: 106, b: 0 }
let hotRgb: RGB = { r: 255, g: 220, b: 140 }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const parseColorToRgb = (color: string): RGB | null => {
  const c = color.trim()
  // rgb()/rgba()
  if (c.startsWith('rgb')) {
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (!m) return null
    const r = Math.max(0, Math.min(255, Number(m[1])))
    const g = Math.max(0, Math.min(255, Number(m[2])))
    const b = Math.max(0, Math.min(255, Number(m[3])))
    return { r, g, b }
  }
  // hex
  const h = c.replace('#', '')
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h
  if (full.length !== 6) return null
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const mixRgb = (a: RGB, b: RGB, t: number): RGB => {
  const k = clamp01(t)
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  }
}

const rgba = (c: RGB, a: number) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`

const ensureAudioNodes = () => {
  // 优先使用原生 Audio（本项目为均衡器固定挂载到 DOM）
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

const computeEnergy = (): number => {
  // 如果频谱可用，取低频能量作为“火焰强度”
  if (equalizer.getFrequencyData) {
    spectrum = spectrum ?? new Uint8Array(256)
    const data = equalizer.getFrequencyData(spectrum)
    if (data) {
      const len = data.length
      const lowEnd = Math.max(8, Math.floor(len * 0.18))
      let sum = 0
      for (let i = 0; i < lowEnd; i++) sum += data[i]
      const avg = sum / (lowEnd * 255)
      return clamp01(avg * 1.6)
    }
  }

  // 回退：无法拿到音频频谱时，用时间做“呼吸”效果，保证随播放进度变化
  return clamp01(0.25 + 0.25 * Math.sin(time * 2.2) + 0.15 * Math.sin(time * 5.1))
}

const spawnParticle = (energy: number) => {
  // 从底部中心附近喷发
  const spread = width * (0.18 + energy * 0.25)
  const x = width * 0.5 + (Math.random() - 0.5) * spread
  const y = height + Math.random() * 10

  const speed = 80 + energy * 260
  const vx = (Math.random() - 0.5) * (40 + energy * 120)
  const vy = -(speed * (0.6 + Math.random() * 0.6))

  const r = 10 + Math.random() * (18 + energy * 22)
  const maxLife = 0.7 + Math.random() * (0.6 + energy * 0.8)

  particles.push({
    x, y, vx, vy, r,
    life: 0,
    maxLife,
    heat: clamp01(0.4 + energy * 0.8 + Math.random() * 0.3)
  })
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  // 暂停时降低强度和刷新频率（但仍保持轻微动态）
  const activeFactor = props.active ? 1 : 0.35
  const energy = computeEnergy() * activeFactor

  // 背景轻微叠影，形成“火焰拖尾”
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.fillRect(0, 0, width, height)

  // 底部柔光基底
  const base = mixRgb(baseRgb, { r: 255, g: 90, b: 0 }, 0.35)
  const glow = ctx.createRadialGradient(width * 0.5, height * 1.05, 0, width * 0.5, height * 1.05, height * 0.7)
  glow.addColorStop(0, rgba(base, 0.28 + energy * 0.25))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // 按能量决定喷发粒子数量
  const spawnCount = Math.floor(2 + energy * 10)
  for (let i = 0; i < spawnCount; i++) spawnParticle(energy)

  // 更新粒子
  const wind = Math.sin(time * 0.8) * (12 + energy * 26)
  particles = particles.filter(p => {
    p.life += dt
    if (p.life >= p.maxLife) return false
    const t = p.life / p.maxLife
    const buoyancy = (1 - t) * (40 + energy * 120)
    p.vx += (wind - p.vx) * dt * 0.6
    p.vy -= buoyancy * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    // 缩小
    p.r *= (1 - dt * (0.9 + energy * 0.6))
    return p.r > 0.8 && p.y > -height * 0.2
  })

  // 绘制粒子（加色混合）
  ctx.globalCompositeOperation = 'lighter'
  for (const p of particles) {
    const t = p.life / p.maxLife
    const a = (1 - t) * (0.22 + p.heat * 0.28)
    const c1 = mixRgb(baseRgb, { r: 255, g: 60, b: 0 }, 0.35 + p.heat * 0.5)
    const c2 = mixRgb(c1, hotRgb, clamp01(p.heat * 0.9))

    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    g.addColorStop(0, rgba(c2, a))
    g.addColorStop(0.6, rgba(c1, a * 0.7))
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
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
  particles = []
})

watch(() => props.baseColor, (c) => {
  const rgb = c ? parseColorToRgb(c) : null
  if (rgb) {
    // 让火焰“带一点封面色”，但仍保持火焰暖色系
    baseRgb = mixRgb({ r: 255, g: 90, b: 0 }, rgb, 0.35)
    hotRgb = mixRgb({ r: 255, g: 220, b: 140 }, rgb, 0.18)
  }
}, { immediate: true })

watch(() => props.active, (v) => {
  if (v) ensureAudioNodes()
})
</script>

<style scoped>
.flame-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* 轻微模糊让火焰更柔和 */
  filter: blur(0.2px);
}
</style>

