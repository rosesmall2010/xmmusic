<template>
  <canvas ref="canvasRef" class="lightning-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'
import { getNowPlayingStage, type NowPlayingStage } from '@/utils/nowPlayingStage'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时压低闪电） */
  active?: boolean
  /** 浅色主题：深色电弧；深色主题：亮色电光；均不加闪屏背景 */
  light?: boolean
}>(), {
  active: false,
  light: false
})

type Point = { x: number; y: number }

type Bolt = {
  points: Point[]
  branches: Point[][]
  life: number
  maxLife: number
  /** 0-1 强度，影响线宽与亮度 */
  intensity: number
  hue: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const equalizer = useEqualizer()

let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let dpr = 1
let width = 0
let height = 0

let spectrum: Uint8Array | null = null
let bandEnergy: number[] = []
let prevBand: number[] = []
let bolts: Bolt[] = []
let energy = 0
let time = 0
let lastTs = 0
let spawnCooldown = 0
/** 当前帧是否拿到真实 FFT（未开音效时为 false，假频谱需更严的突增判定） */
let hasRealSpectrum = false

const MAX_BOLTS = 14

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

/** 分频带能量：与霓虹频谱同一 bin 范围，上升快、回落慢 */
const updateBands = (dt: number) => {
  const bands = Math.max(20, Math.min(40, Math.floor(width / 32)))
  if (bandEnergy.length !== bands) {
    bandEnergy = Array.from({ length: bands }, () => 0)
    prevBand = Array.from({ length: bands }, () => 0)
  }

  const data = getFrequency()
  const activeFactor = props.active ? 1 : 0.25
  const len = data?.length ?? 0
  hasRealSpectrum = !!(data && len > 0)
  const startBin = Math.floor(len * 0.02)
  const endBin = Math.max(startBin + 1, Math.floor(len * 0.55))

  let sum = 0
  for (let i = 0; i < bands; i++) {
    prevBand[i] = bandEnergy[i]
    let v01: number
    const t01 = i / Math.max(1, bands - 1)
    const centerBoost = 1 - Math.abs(t01 - 0.5) * 0.7
    if (hasRealSpectrum) {
      const bin = Math.floor(startBin + (endBin - startBin) * t01)
      v01 = data![Math.max(0, Math.min(len - 1, bin))] / 255
    } else {
      // 假数据做成稀疏脉冲（大部分时间贴近静默），避免正弦常驻中高值导致每帧过击打阈值
      const phase = time * 1.7 + t01 * 4.5 + i * 0.19
      const pulse = Math.sin(phase)
      const spike = pulse > 0.91 ? (pulse - 0.91) / 0.09 : 0
      const rare = Math.sin(time * 0.55 + i * 1.4) > 0.985 ? 0.7 : 0
      v01 = clamp01((spike * 0.95 + rare * 0.55) * centerBoost)
    }

    const target = clamp01(v01 * 1.45) * activeFactor
    // 假频谱上升快、下落也快，突增后迅速回落，才能形成「击打」而非常驻
    const rising = target > bandEnergy[i]
    const tau = props.active
      ? (hasRealSpectrum ? (rising ? 0.04 : 0.1) : (rising ? 0.03 : 0.06))
      : 0.28
    const k = 1 - Math.exp(-dt / tau)
    bandEnergy[i] += (target - bandEnergy[i]) * k
    sum += bandEnergy[i]
  }
  energy = bands > 0 ? sum / bands : 0
}

/** 中点位移折线闪电路径 */
const buildJaggedPath = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  displace: number,
  detail: number
): Point[] => {
  const pts: Point[] = [{ x: x0, y: y0 }, { x: x1, y: y1 }]
  let amp = displace
  for (let pass = 0; pass < detail; pass++) {
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i - 1]
      const b = pts[i]
      const mx = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * amp
      const my = (a.y + b.y) * 0.5 + (Math.random() - 0.5) * amp * 0.35
      pts.splice(i, 0, { x: mx, y: my })
    }
    amp *= 0.52
  }
  return pts
}

const spawnBolt = (band: number, local: number, stage: NowPlayingStage): Bolt => {
  const n = Math.max(1, bandEnergy.length)
  const t = (band + 0.5) / n
  const xTop = stage.paddingX + t * stage.usableW + (Math.random() - 0.5) * (stage.usableW / n) * 0.6
  // 越高的频段能量 → 闪电越长（更接近底边）
  const reach = stage.topY + stage.maxH * (0.35 + local * 0.62)
  const xBot = xTop + (Math.random() - 0.5) * stage.usableW * 0.08
  const displace = 18 + local * 42
  const detail = local > 0.65 ? 5 : 4
  const main = buildJaggedPath(xTop, stage.topY + 4, xBot, Math.min(reach, stage.baselineY - 8), displace, detail)

  const branches: Point[][] = []
  const branchCount = local > 0.55 ? 1 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2)
  for (let b = 0; b < branchCount && main.length > 4; b++) {
    const idx = 2 + Math.floor(Math.random() * (main.length - 4))
    const origin = main[idx]
    const lenY = (40 + local * 90) * (0.5 + Math.random())
    const endX = origin.x + (Math.random() - 0.5) * 80
    const endY = Math.min(stage.baselineY - 6, origin.y + lenY)
    branches.push(buildJaggedPath(origin.x, origin.y, endX, endY, displace * 0.55, 3))
  }

  return {
    points: main,
    branches,
    life: 0,
    maxLife: 0.12 + Math.random() * 0.18 + local * 0.12,
    intensity: 0.45 + local * 0.55,
    hue: 195 + Math.random() * 35 + (1 - t) * 20
  }
}

const strokePath = (
  c: CanvasRenderingContext2D,
  pts: Point[],
  widthPx: number,
  color: string
) => {
  if (pts.length < 2) return
  c.strokeStyle = color
  c.lineWidth = widthPx
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y)
  c.stroke()
}

const drawBolt = (c: CanvasRenderingContext2D, bolt: Bolt, isLight: boolean) => {
  const lifeP = bolt.life / bolt.maxLife
  // 闪一下再衰减
  const pulse = lifeP < 0.18 ? 1 : Math.max(0, 1 - (lifeP - 0.18) / 0.82)
  const a = pulse * bolt.intensity

  if (isLight) {
    // 浅色主题：深色闪电（靛青外晕 → 近黑芯），无发光背景
    strokePath(c, bolt.points, 4.2 + bolt.intensity * 2.5, hsla(bolt.hue, 55, 28, a * 0.35))
    strokePath(c, bolt.points, 2.2 + bolt.intensity * 1.6, hsla(bolt.hue + 8, 65, 18, a * 0.88))
    strokePath(c, bolt.points, 1.05, hsla(bolt.hue + 15, 35, 8, a))
    for (const br of bolt.branches) {
      strokePath(c, br, 2.4, hsla(bolt.hue, 50, 26, a * 0.28))
      strokePath(c, br, 1.2, hsla(bolt.hue + 5, 60, 16, a * 0.75))
      strokePath(c, br, 0.65, hsla(bolt.hue + 12, 30, 7, a * 0.9))
    }
    return
  }

  // 深色主题：亮色电光（外晕 → 白芯）
  strokePath(c, bolt.points, 5.5 + bolt.intensity * 4, hsla(bolt.hue, 100, 55, a * 0.22))
  strokePath(c, bolt.points, 2.2 + bolt.intensity * 2.2, hsla(bolt.hue, 100, 70, a * 0.75))
  strokePath(c, bolt.points, 1.1, hsla(bolt.hue + 20, 80, 96, a))

  for (const br of bolt.branches) {
    strokePath(c, br, 3.2, hsla(bolt.hue, 100, 55, a * 0.15))
    strokePath(c, br, 1.4, hsla(bolt.hue, 95, 72, a * 0.65))
    strokePath(c, br, 0.7, hsla(bolt.hue + 15, 70, 96, a * 0.85))
  }
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt
  spawnCooldown = Math.max(0, spawnCooldown - dt)

  const isLight = props.light
  const stage = getNowPlayingStage(width, height)
  const { paddingX, usableW, baselineY, maxH, topY } = stage

  // 拖尾擦除：闪电更短促，拖尾略快
  ctx.globalCompositeOperation = 'destination-out'
  const tauTrail = isLight ? 0.04 : 0.032
  const trailAlpha = Math.min(0.55, 1 - Math.exp(-dt / tauTrail)).toFixed(3)
  ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`
  ctx.fillRect(0, 0, width, height)

  updateBands(dt)

  // 频带突增触发闪电；假频谱必须「陡升」才算击打，禁止靠常驻高值连闪
  const peak = bandEnergy.reduce((m, v) => (v > m ? v : m), 0)
  const strikeThreshold = props.active
    ? (hasRealSpectrum ? Math.max(0.32, 0.52 - energy * 0.22) : 0.42)
    : 0.85
  const minRise = hasRealSpectrum ? 0.04 : 0.14
  const candidates: { i: number; score: number }[] = []
  for (let i = 0; i < bandEnergy.length; i++) {
    const cur = bandEnergy[i]
    const prev = prevBand[i] ?? 0
    const rise = cur - prev
    const hit = hasRealSpectrum
      ? cur >= strikeThreshold && (rise > minRise || cur > 0.78)
      : cur >= strikeThreshold && rise > minRise
    if (hit) candidates.push({ i, score: cur + rise * 2.5 })
  }
  candidates.sort((a, b) => b.score - a.score)

  const maxSpawn = props.active
    ? Math.min(hasRealSpectrum ? 4 : 2, 1 + Math.floor(peak * (hasRealSpectrum ? 3 : 1.5) + energy * (hasRealSpectrum ? 2 : 0.8)))
    : 0
  if (spawnCooldown <= 0 && candidates.length > 0 && bolts.length < MAX_BOLTS) {
    let spawned = 0
    for (const c of candidates) {
      if (spawned >= maxSpawn || bolts.length >= MAX_BOLTS) break
      if (Math.random() > 0.55 + bandEnergy[c.i] * 0.4) continue
      const local = bandEnergy[c.i]
      bolts.push(spawnBolt(c.i, local, stage))
      spawned++
    }
    // 真频谱跟拍更密；假频谱加长冷却，避免脉冲串连成暴雨
    spawnCooldown = props.active
      ? (hasRealSpectrum
        ? Math.max(0.028, 0.09 - energy * 0.06)
        : Math.max(0.2, 0.38 - peak * 0.08))
      : 0.2
  }

  // 仅真实频谱：无候选时偶尔弱闪保舞台感；假频谱靠稀疏脉冲即可，不再兜底刷闪
  if (
    hasRealSpectrum &&
    props.active &&
    !candidates.length &&
    energy > 0.35 &&
    spawnCooldown <= 0 &&
    Math.random() < energy * 0.08
  ) {
    const bi = Math.floor(Math.random() * bandEnergy.length)
    bolts.push(spawnBolt(bi, Math.max(0.35, bandEnergy[bi]), stage))
    spawnCooldown = 0.12
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingX, topY, usableW, maxH)
  ctx.clip()

  // 仅绘制闪电本身，不加闪屏/晕底背景；深色用加法混合提亮电光
  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  const next: Bolt[] = []
  for (const bolt of bolts) {
    bolt.life += dt
    if (bolt.life >= bolt.maxLife) continue
    drawBolt(ctx, bolt, isLight)
    next.push(bolt)
  }
  bolts = next

  // 顶部轻度淡出，避免切顶硬边
  ctx.globalCompositeOperation = 'destination-out'
  const topFade = ctx.createLinearGradient(0, topY, 0, topY + maxH * 0.1)
  topFade.addColorStop(0, 'rgba(0,0,0,0.4)')
  topFade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topFade
  ctx.fillRect(paddingX, topY, usableW, maxH * 0.1)

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
  bolts = []
  bandEnergy = []
  prevBand = []
})

watch(() => props.light, () => {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  bolts = []
})

watch(() => props.active, (v) => {
  if (v && equalizer.enabled.value) ensureAudioNodes()
})

watch(() => equalizer.enabled.value, (on) => {
  if (on) ensureAudioNodes()
})
</script>

<style scoped>
.lightning-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
