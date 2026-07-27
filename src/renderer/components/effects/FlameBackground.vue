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
 * 火焰范围控制在播放控制区上方：
 * - 顶部仍压在歌词区下沿，避免侵入正文
 * - 底部抬到控制区上沿附近（音量/按钮行上方）
 */
const fireTopY = () => height * 0.23
const fireBaseY = () => height * 0.78

const spawnFlame = (): Flame => {
  const centered = (Math.random() + Math.random()) / 2
  const x = centered * width
  const centerFocus = 1 - Math.abs(centered - 0.5) * 2
  const power = 0.4 + energy * 0.7
  const maxLife = (0.4 + Math.random() * 0.55) * (0.7 + power * 0.5)
  return {
    x,
    y: fireBaseY() + Math.random() * height * 0.01,
    vx: (Math.random() - 0.5) * 32,
    vy: -(80 + Math.random() * 130) * (0.55 + power) * (0.55 + centerFocus * 0.5),
    life: 0,
    maxLife,
    // 粒子适中：太大糊成一片，太小碎；交叠形成火舌
    size: (12 + Math.random() * 26) * (0.6 + power * 0.65),
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

  // 拖尾擦除：擦得快一点让每帧火舌轮廓更锐利（太慢就糊成一团光晕）
  ctx.globalCompositeOperation = 'destination-out'
  const trailAlpha = Math.min(0.65, 1 - Math.exp(-dt / 0.04)).toFixed(3)
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

  // 底部白热炉心：与 fireBaseY 齐平
  const bY = fireBaseY()
  const baseH = height * 0.2
  const base = ctx.createLinearGradient(0, bY - baseH, 0, bY + height * 0.02)
  if (isLight) {
    base.addColorStop(0, hsla(28, 95, 55, 0))
    base.addColorStop(0.5, hsla(32, 100, 58, 0.14 + energy * 0.16))
    base.addColorStop(1, hsla(40, 100, 62, 0.25 + energy * 0.22))
  } else {
    base.addColorStop(0, hsla(20, 100, 50, 0))
    base.addColorStop(0.4, hsla(28, 100, 58, 0.12 + energy * 0.16))
    base.addColorStop(1, hsla(42, 100, 76, 0.25 + energy * 0.32))
  }
  ctx.fillStyle = base
  ctx.fillRect(0, bY - baseH, width, baseH + height * 0.02)

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

    const grow = Math.sin(Math.min(1, p * 1.35) * Math.PI)
    const r = Math.max(2, e.size * (0.35 + grow * 0.55))
    const fade = (1 - p) ** 1.8
    const hue = e.hue - p * 10

    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.scale(0.68, 1.5)
    // 内径 > 0 让渐变更紧凑（有实心的亮核，而不是中心也是渐变起点）
    const grad = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r)
    if (isLight) {
      const a = fade * (0.4 + energy * 0.35)
      grad.addColorStop(0, hsla(hue + 28, 100, 65, a))
      grad.addColorStop(0.3, hsla(hue + 12, 100, 52, a * 0.88))
      grad.addColorStop(0.65, hsla(hue, 98, 42, a * 0.42))
      grad.addColorStop(1, hsla(hue - 4, 92, 36, 0))
    } else {
      const a = fade * (0.28 + energy * 0.42)
      grad.addColorStop(0, hsla(hue + 36, 100, 90, a))
      grad.addColorStop(0.22, hsla(hue + 20, 100, 65, a * 0.92))
      grad.addColorStop(0.55, hsla(hue, 100, 48, a * 0.5))
      grad.addColorStop(1, hsla(hue - 6, 100, 34, 0))
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

  // 顶部收口：擦淡上方，保证歌词区干净
  ctx.globalCompositeOperation = 'destination-out'
  const topClipY = fireTopY()
  const fade = ctx.createLinearGradient(0, 0, 0, topClipY + height * 0.12)
  fade.addColorStop(0, 'rgba(0,0,0,0.75)')
  fade.addColorStop(0.6, 'rgba(0,0,0,0.25)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, width, topClipY + height * 0.12)

  // 底部裁切：硬性限制火焰不进入播放控制区
  const bottomCutY = fireBaseY() + height * 0.03
  const bottomCut = ctx.createLinearGradient(0, bottomCutY - height * 0.04, 0, height)
  bottomCut.addColorStop(0, 'rgba(0,0,0,0)')
  bottomCut.addColorStop(0.35, 'rgba(0,0,0,0.55)')
  bottomCut.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = bottomCut
  ctx.fillRect(0, bottomCutY - height * 0.04, width, height - (bottomCutY - height * 0.04))
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
