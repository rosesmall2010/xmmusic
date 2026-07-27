<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时火焰压低） */
  active?: boolean
  /** 浅色主题：蓝色火焰（正常混合 + 青蓝勾边）；深色主题：黄橙火焰 */
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

/** 上浮火星 */
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
 * 与柱状频谱 AudioEqualizerBackground 完全一致的舞台区域：
 * paddingX / baselineY / maxH 同源，底边停在进度条上沿（不含控制栏）
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

const spawnFlame = (): Flame => {
  const { paddingX, usableW, baselineY } = stage()
  const centered = (Math.random() + Math.random()) / 2
  const x = paddingX + centered * usableW
  const centerFocus = 1 - Math.abs(centered - 0.5) * 2
  const power = 0.4 + energy * 0.7
  // 浅色下寿命略长，火墙更连成片、更绚丽
  const lifeScale = props.light ? 1.15 : 1
  const maxLife = (0.4 + Math.random() * 0.55) * (0.7 + power * 0.5) * lifeScale
  const sizeScale = props.light ? 1.18 : 1
  return {
    x,
    // 只在柱脚线上生成，绝不进入控制栏
    y: baselineY - Math.random() * height * 0.012,
    vx: (Math.random() - 0.5) * 32,
    vy: -(80 + Math.random() * 130) * (0.55 + power) * (0.55 + centerFocus * 0.5),
    life: 0,
    maxLife,
    size: (12 + Math.random() * 26) * (0.6 + power * 0.65) * sizeScale,
    // 浅色：蓝色火焰；深色：黄橙火焰
    hue: props.light ? (195 + Math.random() * 35) : (8 + Math.random() * 26)
  }
}

const spawnSpark = (): Spark => {
  const { paddingX, usableW, baselineY } = stage()
  const x = paddingX + Math.random() * usableW
  const power = 0.4 + energy * 0.7
  return {
    x,
    y: baselineY - Math.random() * height * 0.18,
    vx: (Math.random() - 0.5) * 28,
    vy: -(40 + Math.random() * 90) * power,
    life: 0,
    maxLife: 0.8 + Math.random() * 1.4,
    // 浅色火星略大，保证可见
    size: (props.light ? 1.8 : 1.2) + Math.random() * (props.light ? 3.4 : 2.8)
  }
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  const isLight = props.light
  const { paddingX, usableW, baselineY, maxH, topY } = stage()

  // 拖尾擦除：浅色擦得慢一点，火舌更连成墙、更绚丽
  ctx.globalCompositeOperation = 'destination-out'
  const tauTrail = isLight ? 0.07 : 0.04
  const trailCap = isLight ? 0.42 : 0.65
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

  // 裁剪到与柱状特效相同的舞台矩形：左右内边距 + 顶到柱顶 + 底到柱脚（进度条上沿）
  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingX, topY, usableW, maxH)
  ctx.clip()

  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 只要火舌/火星，不要底部黄色渐变炉心背景
  // 浅色多生一点粒子，密度上来才有绚丽感
  const flameSpawn = Math.round(
    (4 + energy * (isLight ? 18 : 14)) * (props.active ? 1 : 0.35)
  )
  for (let i = 0; i < flameSpawn && flames.length < (isLight ? 380 : 320); i++) {
    flames.push(spawnFlame())
  }

  const sparkSpawn = Math.round(
    (1 + energy * (isLight ? 8 : 6)) * (props.active ? 1 : 0.25)
  )
  for (let i = 0; i < sparkSpawn && sparks.length < (isLight ? 200 : 160); i++) {
    sparks.push(spawnSpark())
  }

  const nextFlames: Flame[] = []
  for (const e of flames) {
    e.life += dt
    if (e.life >= e.maxLife) continue

    const p = e.life / e.maxLife
    e.vx += Math.sin(time * 3.2 + e.y * 0.025) * 48 * dt
    e.vy -= 55 * dt
    e.x += e.vx * dt
    e.y += e.vy * dt

    // 超出舞台顶部 / 越过柱脚 / 超出左右内边距 → 丢弃
    if (e.y < topY || e.y > baselineY) continue
    if (e.x < paddingX || e.x > paddingX + usableW) continue

    const grow = Math.sin(Math.min(1, p * 1.35) * Math.PI)
    const r = Math.max(2, e.size * (0.35 + grow * 0.55))
    const fade = (1 - p) ** 1.8
    // 浅色蓝焰向上变冷蓝，深色橙焰向上偏红
    const hue = isLight ? e.hue + p * 12 : e.hue - p * 10

    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.scale(0.68, 1.5)
    const grad = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r)
    if (isLight) {
      // 浅色蓝焰：外圈深蓝/靛勾边 + 中层亮青蓝 + 芯近白蓝，浅底上对比清晰又绚丽
      const a = fade * (0.62 + energy * 0.38)
      const blue = hue // 约 195~230
      grad.addColorStop(0, hsla(blue + 20, 100, 72, a))
      grad.addColorStop(0.22, hsla(blue + 8, 100, 58, a * 0.95))
      grad.addColorStop(0.5, hsla(blue - 5, 98, 46, a * 0.78))
      grad.addColorStop(0.78, hsla(blue - 18, 95, 34, a * 0.42))
      grad.addColorStop(1, hsla(blue - 28, 90, 28, 0))
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

  const nextSparks: Spark[] = []
  for (const s of sparks) {
    s.life += dt
    if (s.life >= s.maxLife) continue
    s.vx += Math.sin(time * 4 + s.x * 0.01) * 18 * dt
    s.vy -= 20 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (s.y < topY || s.y > baselineY) continue
    if (s.x < paddingX || s.x > paddingX + usableW) continue

    const p = s.life / s.maxLife
    const a = (1 - p) * (isLight ? 0.85 : 0.75) * (0.45 + energy * 0.55)
    ctx.fillStyle = isLight
      ? hsla(210, 100, 48, a)
      : hsla(32, 100, 62, a)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size * (1 - p * 0.4), 0, Math.PI * 2)
    ctx.fill()
    nextSparks.push(s)
  }
  sparks = nextSparks

  // 顶部收口（舞台内）：与柱顶融合；浅色收得轻一点，保住上半段火舌
  ctx.globalCompositeOperation = 'destination-out'
  const topFade = ctx.createLinearGradient(0, topY, 0, topY + maxH * 0.22)
  topFade.addColorStop(0, isLight ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.7)')
  topFade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topFade
  ctx.fillRect(paddingX, topY, usableW, maxH * 0.22)

  // 底部收口：浅色几乎不擦，避免把最绚丽的柱脚抹淡
  const bottomFade = ctx.createLinearGradient(0, topY, 0, baselineY)
  if (isLight) {
    bottomFade.addColorStop(0, 'rgba(0,0,0,0)')
    bottomFade.addColorStop(0.88, 'rgba(0,0,0,0)')
    bottomFade.addColorStop(1, 'rgba(0,0,0,0.06)')
  } else {
    bottomFade.addColorStop(0, 'rgba(0,0,0,0)')
    bottomFade.addColorStop(0.72, 'rgba(0,0,0,0.06)')
    bottomFade.addColorStop(1, 'rgba(0,0,0,0.35)')
  }
  ctx.fillStyle = bottomFade
  ctx.fillRect(paddingX, topY, usableW, maxH)

  ctx.restore()

  // 硬擦除：舞台矩形之外全部清空（尤其是 baseline 以下的控制栏区域）
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  // 上
  ctx.fillRect(0, 0, width, topY)
  // 下（控制栏）
  ctx.fillRect(0, baselineY, width, height - baselineY)
  // 左
  ctx.fillRect(0, topY, paddingX, maxH)
  // 右
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
