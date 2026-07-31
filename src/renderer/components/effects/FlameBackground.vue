<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'
import { getNowPlayingStage, type NowPlayingStage } from '@/utils/nowPlayingStage'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时火焰压低） */
  active?: boolean
  /** 浅色主题：正常混合 + 更深钴蓝勾边；深浅均用蓝色火焰 */
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
  hueBias: number
  /** 0=主体火舌，1=细尖卷须 */
  kind: 0 | 1
  /** 出生时的局部频谱强度，影响寿命内高度 */
  power: number
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
/** 各频带平滑能量（0-1），左右对应频谱低频→中高频 */
let bandEnergy: number[] = []
let flames: Flame[] = []
let sparks: Spark[] = []
let energy = 0
let time = 0
let lastTs = 0

/** 粒子上限：兼顾观感与帧率 */
const MAX_FLAMES = 200
const MAX_SPARKS = 100

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`

const ensureAudioNodes = () => {
  // 无论 EQ 开关是否打开，可视化都主动接入真实频谱（接受一次接管后音频永久走 Web Audio 图的风险，
  // 详见 useEqualizer.ts 里 initAudioContext/routeAudioGraph 的说明）
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
  // 模糊的发光/渐变图形，超采样倍数再高也看不出差别；封顶避免 Windows 高缩放下 canvas 栅格化像素暴涨
  dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 1.5)
  width = Math.max(1, Math.floor(rect.width))
  height = Math.max(1, Math.floor(rect.height))
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx = canvas.getContext('2d', { alpha: true })
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** 更新分频带能量；映射范围与霓虹频谱一致，上升快、回落慢 */
const updateBands = (dt: number) => {
  const bands = Math.max(24, Math.min(48, Math.floor(width / 28)))
  if (bandEnergy.length !== bands) bandEnergy = Array.from({ length: bands }, () => 0)

  const data = getFrequency()
  const activeFactor = props.active ? 1 : 0.3
  const len = data?.length ?? 0
  const startBin = Math.floor(len * 0.02)
  const endBin = Math.max(startBin + 1, Math.floor(len * 0.55))

  let sum = 0
  for (let i = 0; i < bands; i++) {
    let v01: number
    if (data && len > 0) {
      const t01 = i / Math.max(1, bands - 1)
      const bin = Math.floor(startBin + (endBin - startBin) * t01)
      v01 = data[Math.max(0, Math.min(len - 1, bin))] / 255
    } else {
      // 无真实频谱：多频段假数据，与霓虹频谱一样加中心聚焦
      const t01 = i / Math.max(1, bands - 1)
      const wave =
        0.32 +
        0.28 * Math.sin(time * 2.4 + t01 * 6.2) +
        0.18 * Math.sin(time * 5.1 + t01 * 11) +
        0.12 * Math.sin(time * 8.7 + i * 0.4)
      const centerBoost = 1 - Math.abs(t01 - 0.5) * 0.7
      v01 = clamp01(wave * centerBoost)
    }

    const target = clamp01(v01 * 1.4) * activeFactor
    const rising = target > bandEnergy[i]
    const tau = props.active ? (rising ? 0.045 : 0.12) : 0.3
    const k = 1 - Math.exp(-dt / tau)
    bandEnergy[i] += (target - bandEnergy[i]) * k
    sum += bandEnergy[i]
  }
  energy = bands > 0 ? sum / bands : 0
}

/** 按频带能量加权选出发位置（响的频段更易喷火） */
const pickBandIndex = (): number => {
  const n = bandEnergy.length
  if (n === 0) return 0
  let total = 0
  for (let i = 0; i < n; i++) total += 0.08 + bandEnergy[i] * bandEnergy[i]
  let r = Math.random() * total
  for (let i = 0; i < n; i++) {
    r -= 0.08 + bandEnergy[i] * bandEnergy[i]
    if (r <= 0) return i
  }
  return n - 1
}

const bandX = (index: number, stage: NowPlayingStage) => {
  const n = Math.max(1, bandEnergy.length)
  const t = (index + 0.5) / n
  const jitter = (Math.random() - 0.5) * (stage.usableW / n) * 0.7
  return stage.paddingX + t * stage.usableW + jitter
}

const spawnFlame = (kind: 0 | 1, stage: NowPlayingStage): Flame => {
  const band = pickBandIndex()
  const local = bandEnergy[band] ?? energy
  const power = 0.35 + local * 0.9
  const isWisp = kind === 1
  const maxLife = (isWisp ? 0.32 : 0.48) + Math.random() * (isWisp ? 0.4 : 0.65)
  const sizeBase = isWisp
    ? 6 + Math.random() * 14
    : 14 + Math.random() * 32
  const centerFocus = 1 - Math.abs((band + 0.5) / Math.max(1, bandEnergy.length) - 0.5) * 2

  return {
    x: bandX(band, stage),
    y: stage.baselineY - Math.random() * height * 0.01,
    vx: (Math.random() - 0.5) * (isWisp ? 55 : 28),
    // 本频段越响，火舌喷得越高、越快 —— 对应霓虹柱高
    vy: -(60 + Math.random() * (isWisp ? 160 : 120) + local * 220) * (0.5 + centerFocus * 0.55),
    life: 0,
    maxLife: maxLife * (0.7 + power * 0.5),
    size: sizeBase * (0.5 + power * 0.75),
    hueBias: isWisp ? (210 + Math.random() * 25) : (190 + Math.random() * 28),
    kind,
    power
  }
}

const spawnSpark = (stage: NowPlayingStage): Spark => {
  const band = pickBandIndex()
  const local = bandEnergy[band] ?? energy
  const power = 0.35 + local * 0.85
  return {
    x: bandX(band, stage),
    y: stage.baselineY - Math.random() * height * (0.08 + local * 0.28),
    vx: (Math.random() - 0.5) * 36,
    vy: -(45 + Math.random() * 100 + local * 140) * power,
    life: 0,
    maxLife: 0.6 + Math.random() * 1.4,
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
  const stretchY = e.kind === 1 ? 2.6 : 2.15
  const stretchX = e.kind === 1 ? 0.38 : 0.48
  const r = Math.max(2, e.size * (0.28 + grow * 0.72))
  const hue = e.hueBias + (e.life / e.maxLife) * 18 + e.power * 12
  const a = fade * (isLight ? (0.7 + e.power * 0.3) : (0.32 + e.power * 0.48))

  c.save()
  c.translate(e.x, e.y)
  c.scale(stretchX, stretchY)

  // 小粒子用实心色，避免每帧 createRadialGradient
  if (r < 8) {
    c.fillStyle = isLight
      ? hsla(hue + 8, 100, 55, a * 0.85)
      : hsla(hue + 12, 100, 70, a * 0.75)
    c.beginPath()
    c.arc(0, 0, r, 0, Math.PI * 2)
    c.fill()
    c.restore()
    return
  }

  const grad = c.createRadialGradient(0, r * 0.08, 0, 0, 0, r)
  if (isLight) {
    grad.addColorStop(0, hsla(hue + 30, 60, 96, a))
    grad.addColorStop(0.2, hsla(hue + 12, 100, 68, a * 0.92))
    grad.addColorStop(0.55, hsla(hue - 5, 98, 42, a * 0.55))
    grad.addColorStop(1, hsla(hue - 28, 90, 24, 0))
  } else {
    grad.addColorStop(0, hsla(hue + 35, 40, 98, a))
    grad.addColorStop(0.2, hsla(hue + 12, 100, 68, a * 0.88))
    grad.addColorStop(0.55, hsla(hue - 5, 100, 48, a * 0.45))
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
  const stage = getNowPlayingStage(width, height)
  const { paddingX, usableW, baselineY, maxH, topY } = stage

  ctx.globalCompositeOperation = 'destination-out'
  const tauTrail = isLight ? 0.065 : 0.05
  const trailCap = isLight ? 0.4 : 0.5
  const trailAlpha = Math.min(trailCap, 1 - Math.exp(-dt / tauTrail)).toFixed(3)
  ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`
  ctx.fillRect(0, 0, width, height)

  updateBands(dt)

  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingX, topY, usableW, maxH)
  ctx.clip()

  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 生成量约对齐分频前档位（强音合计约 25/帧上限），高度/位置仍由分频带驱动节拍感
  const peak = bandEnergy.reduce((m, v) => (v > m ? v : m), 0)
  const bodySpawn = Math.round((2.5 + energy * 8 + peak * 2) * (props.active ? 1 : 0.35))
  const wispSpawn = Math.round((1.5 + energy * 5 + peak) * (props.active ? 1 : 0.3))
  for (let i = 0; i < bodySpawn && flames.length < MAX_FLAMES; i++) flames.push(spawnFlame(0, stage))
  for (let i = 0; i < wispSpawn && flames.length < MAX_FLAMES; i++) flames.push(spawnFlame(1, stage))

  const sparkSpawn = Math.round((1 + energy * 4) * (props.active ? 1 : 0.25))
  for (let i = 0; i < sparkSpawn && sparks.length < MAX_SPARKS; i++) sparks.push(spawnSpark(stage))

  const nextFlames: Flame[] = []
  for (const e of flames) {
    e.life += dt
    if (e.life >= e.maxLife) continue

    e.vx += Math.sin(time * 4.2 + e.y * 0.03 + e.x * 0.01) * (e.kind === 1 ? 75 : 42) * dt
    e.vy -= (e.kind === 1 ? 70 : 48) * e.power * dt
    e.x += e.vx * dt
    e.y += e.vy * dt

    if (e.y < topY || e.y > baselineY) continue
    if (e.x < paddingX || e.x > paddingX + usableW) continue

    const fade = (1 - e.life / e.maxLife) ** (e.kind === 1 ? 1.4 : 1.7)
    drawBlueTongue(ctx, e, fade, isLight)
    nextFlames.push(e)
  }
  flames = nextFlames

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

    const lifeP = s.life / s.maxLife
    const a = (1 - lifeP) * (isLight ? 0.9 : 0.85) * (0.45 + energy * 0.55)
    ctx.fillStyle = isLight
      ? hsla(205, 100, 52, a)
      : hsla(200, 100, 78, a)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size * (1 - lifeP * 0.35), 0, Math.PI * 2)
    ctx.fill()
    nextSparks.push(s)
  }
  sparks = nextSparks

  ctx.globalCompositeOperation = 'destination-out'
  const topFade = ctx.createLinearGradient(0, topY, 0, topY + maxH * 0.2)
  topFade.addColorStop(0, isLight ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.55)')
  topFade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topFade
  ctx.fillRect(paddingX, topY, usableW, maxH * 0.2)

  const bottomFade = ctx.createLinearGradient(0, baselineY - maxH * 0.08, 0, baselineY)
  bottomFade.addColorStop(0, 'rgba(0,0,0,0)')
  bottomFade.addColorStop(1, isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.12)')
  ctx.fillStyle = bottomFade
  ctx.fillRect(paddingX, baselineY - maxH * 0.08, usableW, maxH * 0.08)

  ctx.restore()

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
  bandEnergy = []
})

watch(() => props.light, () => {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  flames = []
  sparks = []
})

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
}
</style>
