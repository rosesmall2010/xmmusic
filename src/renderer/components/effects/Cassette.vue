<template>
  <!--
    实体磁带：浅灰横纹壳体；开口（磁头舱）在上方；
    贴纸区用专辑封面铺满；中间双卷轴 + 透明走带窗；播放时卷轴旋转。
  -->
  <div class="cassette" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="cassette-shell">
      <!-- 壳体横纹纹理 -->
      <div class="shell-ribs" aria-hidden="true"></div>

      <!-- 顶部磁头舱开口（相对实物照片上下翻转） -->
      <div class="head-bay" aria-hidden="true">
        <div class="head-bay-inner">
          <span class="bay-hole bay-circle"></span>
          <span class="bay-hole bay-square"></span>
          <span class="bay-tape"></span>
          <span class="bay-hole bay-square"></span>
          <span class="bay-hole bay-circle"></span>
        </div>
        <div class="head-bay-lip"></div>
      </div>

      <!-- 封面贴纸：圆角矩形，封面 object-fit 铺满 -->
      <div class="cassette-label">
        <img
          v-if="coverUrl"
          class="label-cover"
          :src="coverUrl"
          :alt="alt"
          @error="$emit('coverError')"
        />
        <div v-else class="label-fallback">
          <slot name="fallback" />
        </div>

        <!-- 贴纸上的走带窗：双卷轴 + 中间透明窗 -->
        <div class="cassette-window">
          <div class="window-frame">
            <span class="window-hole">
              <svg ref="reelLeftRef" class="reel" viewBox="0 0 100 100" aria-hidden="true">
                <circle class="reel-tape" cx="50" cy="50" r="42" />
                <circle class="reel-disc" cx="50" cy="50" r="28" />
                <g class="reel-teeth">
                  <rect
                    v-for="n in 6"
                    :key="'L' + n"
                    x="47"
                    y="14"
                    width="6"
                    height="14"
                    rx="1"
                    :transform="`rotate(${(n - 1) * 60} 50 50)`"
                  />
                </g>
                <circle class="reel-core" cx="50" cy="50" r="10" />
                <circle class="reel-hole" cx="50" cy="50" r="5.5" />
              </svg>
            </span>

            <span class="window-strip">
              <span class="strip-tape"></span>
              <span class="strip-guide"></span>
            </span>

            <span class="window-hole">
              <svg ref="reelRightRef" class="reel" viewBox="0 0 100 100" aria-hidden="true">
                <circle class="reel-tape" cx="50" cy="50" r="36" />
                <circle class="reel-disc" cx="50" cy="50" r="28" />
                <g class="reel-teeth">
                  <rect
                    v-for="n in 6"
                    :key="'R' + n"
                    x="47"
                    y="14"
                    width="6"
                    height="14"
                    rx="1"
                    :transform="`rotate(${(n - 1) * 60} 50 50)`"
                  />
                </g>
                <circle class="reel-core" cx="50" cy="50" r="10" />
                <circle class="reel-hole" cx="50" cy="50" r="5.5" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      <!-- 四角螺丝沉孔 -->
      <span class="screw screw-tl" aria-hidden="true"></span>
      <span class="screw screw-tr" aria-hidden="true"></span>
      <span class="screw screw-bl" aria-hidden="true"></span>
      <span class="screw screw-br" aria-hidden="true"></span>

      <!-- 左侧壳体凹槽（实物常见） -->
      <span class="side-notch" aria-hidden="true"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  coverUrl?: string | null
  active?: boolean
  light?: boolean
  alt?: string
}>(), {
  coverUrl: null,
  active: false,
  light: false,
  alt: ''
})

defineEmits<{ (e: 'coverError'): void }>()

const reelLeftRef = ref<SVGElement | null>(null)
const reelRightRef = ref<SVGElement | null>(null)

// 直写 transform，避免每帧 Vue 响应式更新
let angle = 0
let rafId = 0
let lastTs = 0
let mounted = false

const ROTATE_SPEED = 72 // 度/秒

const applyAngle = () => {
  const t = `rotate(${angle}deg)`
  if (reelLeftRef.value) reelLeftRef.value.style.transform = t
  if (reelRightRef.value) reelRightRef.value.style.transform = t
}

const step = (ts: number) => {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  angle = (angle + ROTATE_SPEED * dt) % 360
  applyAngle()
  rafId = requestAnimationFrame(step)
}

const start = () => {
  if (!mounted || rafId) return
  lastTs = 0
  applyAngle()
  rafId = requestAnimationFrame((ts) => {
    lastTs = ts
    rafId = requestAnimationFrame(step)
  })
}

const stop = () => {
  cancelAnimationFrame(rafId)
  rafId = 0
}

watch(() => props.active, (v) => {
  if (!mounted) return
  v ? start() : stop()
})

onMounted(() => {
  mounted = true
  applyAngle()
  if (props.active) start()
})

onBeforeUnmount(() => {
  mounted = false
  stop()
})
</script>

<style scoped>
/* 标准磁带比例约 100.4 × 63.8 mm ≈ 1.57 */
.cassette {
  --shell: #c8c9cc;
  --shell-dark: #a8a9ad;
  --shell-light: #e0e1e4;
  --rib: rgba(0, 0, 0, 0.07);
  --label-edge: rgba(0, 0, 0, 0.22);
  --hole: #1a1b1e;
  --tape: #2a2118;
  --hub: #f4f4f6;
  --hub-tooth: #d8d9de;
  --screw: #9a9b9f;

  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1.57;
  height: auto;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 浅色主题：壳体略深，避免贴在浅背景上发白 */
.cassette.is-light {
  --shell: #8e8f95;
  --shell-dark: #6e6f75;
  --shell-light: #a8a9af;
  --rib: rgba(0, 0, 0, 0.12);
  --label-edge: rgba(0, 0, 0, 0.35);
  --screw: #6a6b70;
}

.cassette-shell {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 7% / 11%;
  background:
    linear-gradient(180deg, var(--shell-light) 0%, var(--shell) 42%, var(--shell-dark) 100%);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18),
    inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

/* 细密水平横纹 */
.shell-ribs {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(
    180deg,
    transparent 0,
    transparent 1.5px,
    var(--rib) 1.5px,
    var(--rib) 2.5px
  );
  pointer-events: none;
  z-index: 1;
  opacity: 0.9;
}

/* —— 顶部磁头舱 —— */
.head-bay {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 0;
  height: 16%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.head-bay-inner {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3.2%;
  padding: 2% 4% 1%;
  box-sizing: border-box;
  /* 梯形外轮廓：上宽下略窄的舱口感 */
  clip-path: polygon(4% 0, 96% 0, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, #b0b1b5 0%, #9a9b9f 100%);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.35);
}

.cassette.is-light .head-bay-inner {
  background: linear-gradient(180deg, #6a6b70 0%, #525357 100%);
}

.head-bay-lip {
  height: 18%;
  margin: 0 2%;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.18), transparent);
  border-radius: 0 0 4px 4px;
}

.bay-hole {
  flex: 0 0 auto;
  background: var(--hole);
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.45);
}

.bay-circle {
  width: 7%;
  aspect-ratio: 1;
  border-radius: 50%;
}

.bay-square {
  width: 8%;
  aspect-ratio: 1.05;
  border-radius: 8%;
}

.bay-tape {
  flex: 1 1 auto;
  height: 42%;
  max-width: 38%;
  border-radius: 2px;
  background:
    linear-gradient(90deg,
      transparent 0,
      var(--tape) 8%,
      #3d3226 50%,
      var(--tape) 92%,
      transparent 100%);
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.6);
}

/* —— 封面贴纸 —— */
.cassette-label {
  position: absolute;
  left: 5.5%;
  right: 5.5%;
  top: 18%;
  bottom: 11%;
  z-index: 2;
  overflow: hidden;
  border-radius: 4% / 6%;
  background: #e8e9ec;
  box-shadow:
    0 0 0 1px var(--label-edge),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    0 2px 6px rgba(0, 0, 0, 0.12);
}

.label-cover,
.label-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.label-cover {
  object-fit: cover;
  display: block;
}

.label-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.label-fallback :deep(*) {
  width: 100%;
  height: 100%;
}

/* —— 走带窗 —— */
.cassette-window {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  width: 86%;
  height: 42%;
  z-index: 3;
  pointer-events: none;
}

.window-frame {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 2.5%;
  padding: 3% 3.5%;
  box-sizing: border-box;
  border-radius: 8% / 18%;
  background:
    linear-gradient(180deg, rgba(210, 211, 215, 0.92) 0%, rgba(170, 171, 176, 0.95) 100%);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -1px 2px rgba(0, 0, 0, 0.2);
}

.cassette.is-light .window-frame {
  background:
    linear-gradient(180deg, rgba(120, 121, 128, 0.95) 0%, rgba(90, 91, 98, 0.97) 100%);
}

.window-hole {
  position: relative;
  height: 92%;
  aspect-ratio: 1;
  flex: 0 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 40% 35%, #3a3b40 0%, #121317 70%);
  box-shadow:
    inset 0 0 8px rgba(0, 0, 0, 0.85),
    0 0 0 1.5px rgba(60, 60, 64, 0.9);
}

.reel {
  width: 88%;
  height: 88%;
  will-change: transform;
  transform-origin: 50% 50%;
}

.reel-tape {
  fill: #2c241c;
  stroke: #1a1510;
  stroke-width: 1;
}

.reel-disc {
  fill: var(--hub);
  stroke: rgba(0, 0, 0, 0.25);
  stroke-width: 1;
}

.reel-teeth rect {
  fill: var(--hub-tooth);
}

.reel-core {
  fill: #2e2f34;
}

.reel-hole {
  fill: #0a0b0e;
}

.window-strip {
  position: relative;
  flex: 1 1 auto;
  height: 78%;
  border-radius: 4px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(40, 42, 48, 0.35) 0%, rgba(20, 22, 26, 0.55) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.15),
    inset 0 0 6px rgba(0, 0, 0, 0.45);
}

.strip-tape {
  position: absolute;
  left: 6%;
  right: 6%;
  top: 38%;
  height: 22%;
  border-radius: 1px;
  background: linear-gradient(90deg, #1e1812, #3a2e22, #1e1812);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.strip-guide {
  position: absolute;
  left: 50%;
  top: 18%;
  bottom: 18%;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(180, 182, 188, 0.45);
  border-radius: 1px;
}

/* —— 螺丝 —— */
.screw {
  position: absolute;
  width: 3.2%;
  aspect-ratio: 1;
  border-radius: 50%;
  z-index: 4;
  background:
    radial-gradient(circle at 35% 30%, #d0d1d5 0%, var(--screw) 55%, #6a6b70 100%);
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.35),
    inset 0 -1px 2px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(0, 0, 0, 0.2);
}

.screw::after {
  content: '';
  position: absolute;
  left: 20%;
  right: 20%;
  top: 46%;
  height: 12%;
  background: rgba(40, 40, 44, 0.55);
  border-radius: 1px;
  transform: rotate(35deg);
}

.screw-tl { top: 3.5%; left: 3.5%; }
.screw-tr { top: 3.5%; right: 3.5%; }
.screw-bl { bottom: 3.5%; left: 3.5%; }
.screw-br { bottom: 3.5%; right: 3.5%; }

.side-notch {
  position: absolute;
  left: 0;
  top: 62%;
  width: 2.2%;
  height: 10%;
  z-index: 4;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 0 2px 2px 0;
  box-shadow: inset -1px 0 2px rgba(0, 0, 0, 0.25);
}
</style>
