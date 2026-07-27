<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时火焰压低） */
  active?: boolean
  /** 浅色主题：改用正常混合 + 更深暖色，避免加法混合把画面洗白 */
  light?: boolean
}>(), {
  active: false,
  light: false
})

/** 大火舌粒子 */
type Flame = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
}

/** 上浮火星（参考图里火墙上方的细小火花） */
type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const equalizer = useEqualizer()

let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let dpr = 1
let width = 0
let height = 0

let spectrum: Uint8Array | null = null
let flames: Flame[] = []
let sparks: Spark[] = []
// 火焰能量（0-1）：由低频驱动
let energy = 0
let time = 0
let lastTs = 0

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`

const ensureAudioNodes = () => {
  if (!equalizer.enabled.value) return
  const el = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
  if (!el) return
  equalizer.initAudioContext(el)
}

const getFrequency = (): Uint8Array | null => {
  if (!equalizer.getFrequencyData) return null
  const data = equalizer.getFrequencyData(spectrum ?? undefined)
  if (!data) return null
  spectrum = data
  return data
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

/**
 * 特效垂直范围与霓虹频谱一致：火墙落在画面中下部，
 * 控制区叠在更上层，火苗不往顶部歌词区冲得太高
 */
const fireTopY = () => height * 0.42
const fireBaseY = () => height * 0.92

const spawnFlame = (): Flame => {
  const centered = (Math.random() + Math.random()) / 2
  const x = centered * width
  const centerFocus = 1 - Math.abs(centered - 0.5) * 2
  const power = 0.4 + energy * 0.7
  const maxLife = (0.55 + Math.random() * 0.7) * (0.7 + power * 0.5)
  return {
    x,
    y: fireBaseY() + Math.random() * height * 0.04,
    vx: (Math.random() - 0.5) * 40,
    vy: -(90 + Math.random() * 160) * (0.55 + power) * (0.55 + centerFocus * 0.5),
    life: 0,
    maxLife,
    size: (22 + Math.random() * 48) * (0.55 + power * 0.8),
    hue: 8 + Math.random() * 26
  }
}

const spawnSpark = (): Spark => {
  const x = Math.random() * width
  const power = 0.4 + energy * 0.7
  return {
    x,
    y: fireBaseY() - Math.random() * height * 0.18,
    vx: (Math.random() - 0.5) * 28,
    vy: -(40 + Math.random() * 90) * power,
    life: 0,
    maxLife: 0.8 + Math.random() * 1.4,
    size: 1.2 + Math.random() * 2.8
  }
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  const isLight = props.light

  // 拖尾擦除：保留一点残影，火舌才连成带
  ctx.globalCompositeOperation = 'destination-out'
  const trailAlpha = Math.min(0.55, 1 - Math.exp(-dt / 0.055)).toFixed(3)
  ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`
  ctx.fillRect(0, 0, width, height)

  const data = getFrequency()
  let target: number
  if (data && data.length > 0) {
    const bins = Math.max(1, Math.floor(data.length * 0.18))
    let sum = 0
    for (let i = 0; i < bins; i++) sum += data[i]
    target = clamp01(sum / bins / 255 * 1.55)
  } else {
    target = 0.42 + 0.22 * Math.sin(time * 2.2) + 0.12 * Math.sin(time * 5.1)
  }
  if (!props.active) target *= 0.3
  energy += (clamp01(target) - energy) * (1 - Math.exp(-dt / 0.08))

  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 底部白热炉心（参考图底部近白的一段）
  const baseH = height * 0.28
  const base = ctx.createLinearGradient(0, height - baseH, 0, height)
  if (isLight) {
    base.addColorStop(0, hsla(28, 95, 55, 0))
    base.addColorStop(0.55, hsla(32, 100, 58, 0.12 + energy * 0.14))
    base.addColorStop(1, hsla(40, 100, 62, 0.22 + energy * 0.2))
  } else {
    base.addColorStop(0, hsla(20, 100, 50, 0))
    base.addColorStop(0.45, hsla(28, 100, 55, 0.1 + energy * 0.14))
    base.addColorStop(1, hsla(42, 100, 72, 0.22 + energy * 0.28))
  }
  ctx.fillStyle = base
  ctx.fillRect(0, height - baseH, width, baseH)

  // 生成火舌
  const flameSpawn = Math.round((4 + energy * 14) * (props.active ? 1 : 0.35))
  for (let i = 0; i < flameSpawn && flames.length < 320; i++) flames.push(spawnFlame())

  // 生成上浮火星
  const sparkSpawn = Math.round((1 + energy * 6) * (props.active ? 1 : 0.25))
  for (let i = 0; i < sparkSpawn && sparks.length < 160; i++) sparks.push(spawnSpark())

  const nextFlames: Flame[] = []
  for (const e of flames) {
    e.life += dt
    if (e.life >= e.maxLife) continue

    const p = e.life / e.maxLife
    e.vx += Math.sin(time * 3.2 + e.y * 0.025) * 48 * dt
    e.vy -= 55 * dt
    e.x += e.vx * dt
    e.y += e.vy * dt

    // 限制火舌别冲进顶部歌词区
    if (e.y < fireTopY()) continue

    const grow = Math.sin(Math.min(1, p * 1.2) * Math.PI)
    const r = Math.max(2, e.size * (0.4 + grow * 0.7))
    const fade = (1 - p) ** 1.35
    const hue = e.hue - p * 10

    ctx.save()
    ctx.translate(e.x, e.y)
    // 竖向拉长成火舌
    ctx.scale(0.72, 1.55)
    const grad = ctx.createRadialGradient(0, r * 0.15, 0, 0, 0, r)
    if (isLight) {
      const a = fade * (0.28 + energy * 0.28)
      // 浅底：芯偏亮黄、外焰偏深橙红，保证对比
      grad.addColorStop(0, hsla(hue + 28, 100, 62, a))
      grad.addColorStop(0.35, hsla(hue + 10, 98, 50, a * 0.85))
      grad.addColorStop(0.7, hsla(hue, 95, 42, a * 0.45))
      grad.addColorStop(1, hsla(hue - 4, 90, 38, 0))
    } else {
      const a = fade * (0.18 + energy * 0.32)
      // 深底：芯近白黄，外焰橙红（贴近参考图）
      grad.addColorStop(0, hsla(hue + 36, 100, 88, a))
      grad.addColorStop(0.28, hsla(hue + 18, 100, 62, a * 0.9))
      grad.addColorStop(0.62, hsla(hue, 100, 48, a * 0.55))
      grad.addColorStop(1, hsla(hue - 6, 100, 36, 0))
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    nextFlames.push(e)
  }
  flames = nextFlames

  // 火星：小而亮，往上漂
  const nextSparks: Spark[] = []
  for (const s of sparks) {
    s.life += dt
    if (s.life >= s.maxLife) continue
    s.vx += Math.sin(time * 4 + s.x * 0.01) * 18 * dt
    s.vy -= 20 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (s.y < fireTopY() * 0.85) continue

    const p = s.life / s.maxLife
    const a = (1 - p) * (isLight ? 0.55 : 0.75) * (0.4 + energy * 0.6)
    ctx.fillStyle = isLight
      ? hsla(28, 95, 45, a)
      : hsla(32, 100, 62, a)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size * (1 - p * 0.4), 0, Math.PI * 2)
    ctx.fill()
    nextSparks.push(s)
  }
  sparks = nextSparks

  // 顶部收口：擦淡上方，保证歌词区干净；底部控制区由 UI 层盖住
  ctx.globalCompositeOperation = 'destination-out'
  const fade = ctx.createLinearGradient(0, 0, 0, height * 0.55)
  fade.addColorStop(0, 'rgba(0,0,0,0.62)')
  fade.addColorStop(0.55, 'rgba(0,0,0,0.18)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, width, height * 0.55)
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
  flames = []
  sparks = []
})

watch(() => props.light, () => {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
})

watch(() => props.active, (v) => {
  if (v && equalizer.enabled.value) ensureAudioNodes()
})

watch(() => equalizer.enabled.value, (on) => {
  if (on) ensureAudioNodes()
})
</script>

<style scoped>
.flame-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
