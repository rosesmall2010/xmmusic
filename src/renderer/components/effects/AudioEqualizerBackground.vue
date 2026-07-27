<template>
  <canvas ref="canvasRef" class="eq-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEqualizer } from '@/composables/useEqualizer'
import { getNowPlayingStage } from '@/utils/nowPlayingStage'

const props = withDefaults(defineProps<{
  /** 是否处于播放状态（暂停时降低强度） */
  active?: boolean
  /** 浅色主题：改用正常混合 + 中等亮度色，避免加法混合把画面洗白 */
  light?: boolean
}>(), {
  active: false,
  light: false
})

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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`

const ensureAudioNodes = () => {
  // 仅在音效开启时才接管 Web Audio；否则用时间域假频谱，保住原生直出音质
  if (!equalizer.enabled.value) return
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
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 保持透明：底色由 .now-playing-view 的封面渐变提供。
    // 这里若铺不透明底色，会把渐变整块盖掉（封面取色就白做了）
  }
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
// 满帧渲染（60fps）保证跟手；绘制成本已通过去掉 shadowBlur 大幅降低，
// 不会再挤占音频解码（此前限帧 30fps 反而造成明显延迟感）
const tick = (ts: number) => {
  rafId = requestAnimationFrame(tick)
  if (!ctx) return

  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  time += dt

  const isLight = props.light

  // 背景拖尾（类似示例图的“光带残影”）；按帧时长换算，帧率无关。
  // 用 destination-out 按 alpha 擦除上一帧，而不是叠一层不透明底色：
  // 叠底色会让 canvas 越来越不透明，把下层的封面渐变整块盖住
  ctx.globalCompositeOperation = 'destination-out'
  // 浅色/深色拖尾节奏接近，避免浅色残影被抹得太快显得发闷
  const tauTrail = 0.055
  const trailAlpha = Math.min(0.4, 1 - Math.exp(-dt / tauTrail)).toFixed(3)
  // destination-out 只用 alpha，颜色本身无意义
  ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`
  ctx.fillRect(0, 0, width, height)

  const data = getFrequency()
  const activeFactor = props.active ? 1 : 0.25

  // 柱子数量（减少数量让柱子更粗、更有“块感”）
  const bars = Math.max(32, Math.min(72, Math.floor(width / 22)))
  if (smoothed.length !== bars) smoothed = Array.from({ length: bars }).map(() => 0)

  // 频谱映射到 bars（偏向中低频，让变化更明显）
  const len = data?.length ?? 0
  const startBin = Math.floor(len * 0.02)
  const endBin = Math.max(startBin + 1, Math.floor(len * 0.55))

  // 无真实频谱时：多频段假数据，仍有舞台感，但不劫持播放链路
  const fakeBands = !data
    ? Array.from({ length: bars }, (_, i) => {
        const t01 = i / Math.max(1, bars - 1)
        const wave =
          0.35 +
          0.28 * Math.sin(time * 2.4 + t01 * 6.2) +
          0.18 * Math.sin(time * 5.1 + t01 * 11) +
          0.12 * Math.sin(time * 8.7 + i * 0.4)
        const centerBoost = 1 - Math.abs(t01 - 0.5) * 0.7
        return clamp01(wave * centerBoost * (props.active ? 1 : 0.35))
      })
    : null

  // 布局：底部中央为主的“舞台感”（与火焰共用舞台常量）
  const { paddingX, usableW, baselineY, maxH } = getNowPlayingStage(width, height)
  const gap = 4
  const barW = Math.max(3, Math.floor((usableW - gap * (bars - 1)) / bars))

  // 拖尾用的是 destination-out；深色用加法混合出霓虹感，浅色必须用正常混合
  // （加法混合在浅背景上只会把画面洗成白色）
  ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter'

  // 透视微缩放：两侧略短（更接近示例图的“中心聚焦”）
  for (let i = 0; i < bars; i++) {
    let v01 = fakeBands?.[i] ?? 0.2
    if (data && len > 0) {
      const t01 = i / Math.max(1, bars - 1)
      const bin = Math.floor(startBin + (endBin - startBin) * t01)
      const v = data[Math.max(0, Math.min(len - 1, bin))] / 255
      v01 = v
    }

    // 平滑（基于帧时长的指数趋近，帧率无关；上升快、回落稍慢，跟手又不碎）
    const target = clamp01(v01 * 1.35) * activeFactor
    const rising = target > smoothed[i]
    const tau = props.active ? (rising ? 0.045 : 0.12) : 0.3
    const k = 1 - Math.exp(-dt / tau)
    const smooth = smoothed[i] = smoothed[i] + (target - smoothed[i]) * k

    const centerFocus = 1 - Math.abs(i / (bars - 1) - 0.5) * 2
    const perspective = 0.55 + centerFocus * 0.55
    const h = Math.max(2, smooth * maxH * perspective)

    const x = paddingX + i * (barW + gap)
    const y = baselineY - h

    // 轻微左右摆动（让画面更“活”但不抢内容）
    const wobble = Math.sin(time * 0.9 + i * 0.22) * (props.active ? 0.6 : 0.25)
    const xx = x + wobble

    // 多彩霓虹：顶部亮、底部收暗（改浅色主题前的绚丽方向）。
    // 文字已有八向描边，可读性够，不再为避文字把柱顶抹淡。
    const hue = (i / Math.max(1, bars - 1)) * 320 + time * 10
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    if (isLight) {
      // 浅色不能用 lighter，靠高饱和 + 实一点的 alpha 出彩；明度略低于深色以免发粉
      const alpha = (0.22 + smooth * 0.62) * (props.active ? 1 : 0.65)
      grad.addColorStop(0, hsla(hue, 90, 52, alpha))
      grad.addColorStop(0.55, hsla(hue, 88, 40, alpha * 0.82))
      grad.addColorStop(1, hsla(hue, 86, 32, alpha * 0.55))
    } else {
      const alpha = (0.12 + smooth * 0.62) * (props.active ? 1 : 0.7)
      grad.addColorStop(0, hsla(hue, 92, 58, alpha))
      grad.addColorStop(0.55, hsla(hue, 92, 40, alpha * 0.75))
      grad.addColorStop(1, hsla(hue, 92, 22, alpha * 0.45))
    }

    ctx.fillStyle = grad
    roundRect(ctx, xx, y, barW, h, Math.min(8, barW * 0.45))
    ctx.fill()

    // 柱顶高光线：点出霓虹边缘
    if (smooth > 0.08) {
      ctx.strokeStyle = isLight
        ? hsla(hue, 90, 42, 0.22 + smooth * 0.28)
        : hsla(hue, 92, 66, 0.14 + smooth * 0.22)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xx + 1, y + 1)
      ctx.lineTo(xx + barW - 1, y + 1)
      ctx.stroke()
    }
  }

  // 底部虚化：擦除柱脚不透明度，让柱子融入背景；浅色擦得轻，保住绚丽柱基
  ctx.globalCompositeOperation = 'destination-out'
  const fade = ctx.createLinearGradient(0, baselineY - maxH, 0, height)
  if (isLight) {
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.78, 'rgba(0,0,0,0.03)')
    fade.addColorStop(1, 'rgba(0,0,0,0.18)')
  } else {
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.72, 'rgba(0,0,0,0.06)')
    fade.addColorStop(1, 'rgba(0,0,0,0.35)')
  }
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

// 主题切换时清空画布，避免上一主题的残影用新主题的混合模式继续叠加
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
.eq-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
