<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时火焰压低） */
  active?: boolean
  /** 浅色主题：正常混合 + 更深钴蓝勾边，保证浅底对比；深浅均用蓝色火焰 */
  light?: boolean
}>(), {
  active: false,
  light: false
})

/** 火舌：白芯 → 电光青 → 钴蓝外焰 */
type Flame = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  /** 色相偏移：偏青或偏靛 */
  hueBias: number
  /** 0=主体火舌，1=细尖卷须 */
  kind: 0 | 1
}

/** 火星：蓝白细点上浮 */
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
let energy = 0
let time = 0
let lastTs = 0

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`

/**
 * 与柱状频谱同一舞台：底边停在进度条上沿（不含控制栏）
 */
const stage = () => {
  const paddingX = Math.max(18, width * 0.08)
  const baselineY = height * 0.85
  const maxH = height * 0.62
  return {
    paddingX,
    usableW: Math.max(1, width - paddingX * 2),
    baselineY,
    maxH,
    topY: baselineY - maxH
  }
}

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

const spawnFlame = (kind: 0 | 1 = 0): Flame => {
  const { paddingX, usableW, baselineY } = stage()
  // 中心略密，形成参考图里「火墙」感
  const centered = (Math.random() + Math.random() + Math.random()) / 3
  const x = paddingX + centered * usableW
  const centerFocus = 1 - Math.abs(centered - 0.5) * 2
  const power = 0.45 + energy * 0.75
  const isWisp = kind === 1
  const maxLife = (isWisp ? 0.35 : 0.5) + Math.random() * (isWisp ? 0.45 : 0.7)
  const sizeBase = isWisp
    ? 6 + Math.random() * 14
    : 14 + Math.random() * 32
  return {
    x,
    y: baselineY - Math.random() * height * 0.01,
    vx: (Math.random() - 0.5) * (isWisp ? 55 : 28),
    vy: -(70 + Math.random() * (isWisp ? 180 : 140)) * (0.55 + power) * (0.5 + centerFocus * 0.55),
    life: 0,
    maxLife: maxLife * (0.75 + power * 0.45),
    size: sizeBase * (0.55 + power * 0.7),
    // 190~220：青蓝 ↔ 电光蓝；卷须略偏靛
    hueBias: isWisp ? (210 + Math.random() * 25) : (190 + Math.random() * 28),
    kind
  }
}

const spawnSpark = (): Spark => {
  const { paddingX, usableW, baselineY } = stage()
  const power = 0.4 + energy * 0.7
  return {
    x: paddingX + Math.random() * usableW,
    y: baselineY - Math.random() * height * 0.22,
    vx: (Math.random() - 0.5) * 36,
    vy: -(50 + Math.random() * 110) * power,
    life: 0,
    maxLife: 0.7 + Math.random() * 1.5,
    size: 1.4 + Math.random() * 3.2
  }
}

const drawBlueTongue = (
  c: CanvasRenderingContext2D,
  e: Flame,
  fade: number,
  isLight: boolean
) => {
  const grow = Math.sin(Math.min(1, (e.life / e.maxLife) * 1.25) * Math.PI)
  // 火舌竖向拉得很长，尖端更像参考图的卷须
  const stretchY = e.kind === 1 ? 2.6 : 2.15
  const stretchX = e.kind === 1 ? 0.38 : 0.48
  const r = Math.max(2, e.size * (0.28 + grow * 0.72))
  const hue = e.hueBias + (e.life / e.maxLife) * 18

  c.save()
  c.translate(e.x, e.y)
  c.scale(stretchX, stretchY)

  // 外晕（钴蓝）→ 中层电光蓝 → 白青芯
  const grad = c.createRadialGradient(0, r * 0.08, 0, 0, 0, r)
  if (isLight) {
    // 浅底：外圈更深，芯更亮，保证对比
    const a = fade * (0.7 + energy * 0.3)
    grad.addColorStop(0, hsla(hue + 30, 60, 96, a))
    grad.addColorStop(0.12, hsla(hue + 18, 100, 78, a * 0.95))
    grad.addColorStop(0.35, hsla(hue + 5, 100, 58, a * 0.88))
    grad.addColorStop(0.62, hsla(hue - 8, 98, 42, a * 0.55))
    grad.addColorStop(0.85, hsla(hue - 22, 95, 30, a * 0.22))
    grad.addColorStop(1, hsla(hue - 30, 90, 24, 0))
  } else {
    // 深底 + lighter：白芯爆亮，外焰钴蓝晕开（贴近参考）
    const a = fade * (0.32 + energy * 0.48)
    grad.addColorStop(0, hsla(hue + 35, 40, 98, a))
    grad.addColorStop(0.1, hsla(hue + 22, 100, 82, a * 0.95))
    grad.addColorStop(0.32, hsla(hue + 8, 100, 62, a * 0.85))
    grad.addColorStop(0.58, hsla(hue - 5, 100, 48, a * 0.5))
    grad.addColorStop(0.82, hsla(hue - 18, 100, 36, a * 0.2))
    grad.addColorStop(1, hsla(hue - 28, 100, 28, 0))
  }
  c.fillStyle = grad
  c.beginPath()
  c.arc(0, 0, r, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  const isLight = props.light
  const { paddingX, usableW, baselineY, maxH, topY } = stage()

  // 拖尾：保留一点残影，火舌才像流体连成墙
  ctx.globalCompositeOperation = 'destination-out'
  const tauTrail = isLight ? 0.065 : 0.05
  const trailCap = isLight ? 0.4 : 0.5
  const trailAlpha = Math.min(trailCap, 1 - Math.exp(-dt / tauTrail)).toFixed(3)
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

  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingX, topY, usableW, maxH)
  ctx.clip()

  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 不要任何背景晕层，只要火舌与火星
  // 主体火舌 + 细尖卷须
  const bodySpawn = Math.round((5 + energy * 16) * (props.active ? 1 : 0.35))
  const wispSpawn = Math.round((3 + energy * 10) * (props.active ? 1 : 0.3))
  const maxFlames = 420
  for (let i = 0; i < bodySpawn && flames.length < maxFlames; i++) flames.push(spawnFlame(0))
  for (let i = 0; i < wispSpawn && flames.length < maxFlames; i++) flames.push(spawnFlame(1))

  const sparkSpawn = Math.round((2 + energy * 8) * (props.active ? 1 : 0.25))
  for (let i = 0; i < sparkSpawn && sparks.length < 220; i++) sparks.push(spawnSpark())

  const nextFlames: Flame[] = []
  for (const e of flames) {
    e.life += dt
    if (e.life >= e.maxLife) continue

    const p = e.life / e.maxLife
    // 湍流：左右卷曲，形成参考图里扭动的火舌
    e.vx += Math.sin(time * 4.2 + e.y * 0.03 + e.x * 0.01) * (e.kind === 1 ? 75 : 42) * dt
    e.vy -= (e.kind === 1 ? 70 : 48) * dt
    e.x += e.vx * dt
    e.y += e.vy * dt

    if (e.y < topY || e.y > baselineY) continue
    if (e.x < paddingX || e.x > paddingX + usableW) continue

    const fade = (1 - p) ** (e.kind === 1 ? 1.4 : 1.7)
    drawBlueTongue(ctx, e, fade, isLight)
    nextFlames.push(e)
  }
  flames = nextFlames

  // 火星
  const nextSparks: Spark[] = []
  for (const s of sparks) {
    s.life += dt
    if (s.life >= s.maxLife) continue
    s.vx += Math.sin(time * 5 + s.x * 0.012) * 22 * dt
    s.vy -= 24 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (s.y < topY || s.y > baselineY) continue
    if (s.x < paddingX || s.x > paddingX + usableW) continue

    const p = s.life / s.maxLife
    const a = (1 - p) * (isLight ? 0.9 : 0.85) * (0.5 + energy * 0.5)
    // 纯蓝白火星，不要任何暖色
    ctx.fillStyle = isLight
      ? hsla(205, 100, 52, a)
      : hsla(200, 100, 78, a)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size * (1 - p * 0.35), 0, Math.PI * 2)
    ctx.fill()
    nextSparks.push(s)
  }
  sparks = nextSparks

  // 顶部收口：火舌尖自然淡出
  ctx.globalCompositeOperation = 'destination-out'
  const topFade = ctx.createLinearGradient(0, topY, 0, topY + maxH * 0.2)
  topFade.addColorStop(0, isLight ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.55)')
  topFade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topFade
  ctx.fillRect(paddingX, topY, usableW, maxH * 0.2)

  // 底部轻微收口，贴近进度条
  const bottomFade = ctx.createLinearGradient(0, baselineY - maxH * 0.08, 0, baselineY)
  bottomFade.addColorStop(0, 'rgba(0,0,0,0)')
  bottomFade.addColorStop(1, isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.12)')
  ctx.fillStyle = bottomFade
  ctx.fillRect(paddingX, baselineY - maxH * 0.08, usableW, maxH * 0.08)

  ctx.restore()

  // 硬擦除舞台外（尤其控制栏）
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(0, 0, width, topY)
  ctx.fillRect(0, baselineY, width, height - baselineY)
  ctx.fillRect(0, topY, paddingX, maxH)
  ctx.fillRect(paddingX + usableW, topY, paddingX + 2, maxH)
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
  flames = []
  sparks = []
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
