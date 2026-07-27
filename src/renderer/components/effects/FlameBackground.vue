<template>
  <canvas ref="canvasRef" class="flame-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时火焰压低） */
  active?: boolean
  /** 浅色主题：改用正常混合 + 深一档的暖色，避免加法混合把画面洗白 */
  light?: boolean
}>(), {
  active: false,
  light: false
})

type Ember = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
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
let embers: Ember[] = []
// 火焰能量（0-1）：由低频驱动，做指数平滑避免忽明忽暗
let energy = 0
let time = 0
let lastTs = 0

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`

const ensureAudioNodes = () => {
  // 与频谱特效一致：只有开了音效才接管 Web Audio，否则用假数据保住原生直出音质
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
  // 保持透明：底色由 .now-playing-view 的封面渐变提供
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** 火苗根部：贴着底边生成，中间密两侧疏，形成一条火线 */
const spawnEmber = (): Ember => {
  const t01 = Math.random()
  // 中心加权：两次随机取中值，让火苗集中在画面中下部
  const centered = (t01 + Math.random()) / 2
  const x = centered * width
  const centerFocus = 1 - Math.abs(centered - 0.5) * 2
  const power = 0.35 + energy * 0.65
  const maxLife = (0.7 + Math.random() * 0.9) * (0.6 + power * 0.6)
  return {
    x,
    y: height * (0.94 + Math.random() * 0.06),
    vx: (Math.random() - 0.5) * 26,
    vy: -(70 + Math.random() * 120) * (0.5 + power) * (0.5 + centerFocus * 0.5),
    life: 0,
    maxLife,
    // 粒子偏大：靠彼此重叠融成火舌，避免看出一个个圆圈
    size: (16 + Math.random() * 32) * (0.6 + power * 0.7),
    // 火心偏黄、外焰偏红
    hue: 14 + Math.random() * 28
  }
}

const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  const isLight = props.light

  // 拖尾：destination-out 按 alpha 擦除，canvas 保持透明让下层封面渐变透出
  ctx.globalCompositeOperation = 'destination-out'
  const trailAlpha = Math.min(0.5, 1 - Math.exp(-dt / 0.075)).toFixed(3)
  ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`
  ctx.fillRect(0, 0, width, height)

  // 低频能量驱动火势；无频谱数据时用正弦假数据，保证静态也有火苗
  const data = getFrequency()
  let target: number
  if (data && data.length > 0) {
    const bins = Math.max(1, Math.floor(data.length * 0.18))
    let sum = 0
    for (let i = 0; i < bins; i++) sum += data[i]
    target = clamp01(sum / bins / 255 * 1.5)
  } else {
    target = 0.35 + 0.2 * Math.sin(time * 2.1) + 0.1 * Math.sin(time * 5.3)
  }
  if (!props.active) target *= 0.28
  energy += (clamp01(target) - energy) * (1 - Math.exp(-dt / 0.09))

  // 火焰叠色：深色用 lighter 出灼烧感；浅色必须正常混合，否则只会把画面洗白
  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 生成新火苗：数量随能量增减，上限控制绘制成本
  const spawnCount = Math.round((2 + energy * 9) * (props.active ? 1 : 0.35))
  for (let i = 0; i < spawnCount && embers.length < 260; i++) embers.push(spawnEmber())

  const next: Ember[] = []
  for (const e of embers) {
    e.life += dt
    if (e.life >= e.maxLife) continue

    const p = e.life / e.maxLife
    // 上升途中被“热浪”左右推，越往上摆幅越大
    e.vx += Math.sin(time * 3 + e.y * 0.02) * 34 * dt
    e.vy -= 42 * dt // 热气上浮加速
    e.x += e.vx * dt
    e.y += e.vy * dt

    // 生命周期：先胀后缩，颜色由亮黄烧到暗红
    const grow = Math.sin(Math.min(1, p * 1.25) * Math.PI)
    const r = Math.max(1, e.size * (0.35 + grow * 0.65))
    const fade = (1 - p) ** 1.5

    const hue = e.hue - p * 12
    // 纵向拉长成竖椭圆，圆形粒子看着像气泡，拉长才有火舌的形
    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.scale(0.78, 1.45)
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    if (isLight) {
      // 浅底上要更饱和、更深，否则暖色会糊成一片看不清
      const a = fade * (0.2 + energy * 0.24)
      grad.addColorStop(0, hsla(hue + 16, 98, 52, a))
      grad.addColorStop(0.45, hsla(hue, 95, 46, a * 0.68))
      grad.addColorStop(1, hsla(hue - 6, 90, 42, 0))
    } else {
      const a = fade * (0.11 + energy * 0.2)
      grad.addColorStop(0, hsla(hue + 22, 100, 66, a))
      grad.addColorStop(0.45, hsla(hue, 100, 52, a * 0.65))
      grad.addColorStop(1, hsla(hue - 8, 100, 40, 0))
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    next.push(e)
  }
  embers = next

  // 底部炉火：贴着底边的一条暖光，让火苗有“火源”而不是凭空冒出
  const baseH = height * 0.3
  const base = ctx.createLinearGradient(0, height - baseH, 0, height)
  if (isLight) {
    base.addColorStop(0, hsla(24, 92, 52, 0))
    base.addColorStop(1, hsla(18, 95, 48, 0.13 + energy * 0.14))
  } else {
    base.addColorStop(0, hsla(24, 100, 52, 0))
    base.addColorStop(1, hsla(16, 100, 50, 0.07 + energy * 0.12))
  }
  ctx.fillStyle = base
  ctx.fillRect(0, height - baseH, width, baseH)

  // 顶部收口：擦淡上方，避免火焰盖住歌词/队列文字
  ctx.globalCompositeOperation = 'destination-out'
  const fade = ctx.createLinearGradient(0, 0, 0, height * 0.62)
  fade.addColorStop(0, 'rgba(0,0,0,0.5)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, width, height * 0.62)
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
  embers = []
})

// 主题切换时清空，避免上一主题的残影用新混合模式继续叠加
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
