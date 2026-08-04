<template>
  <div class="cd-disc" :class="{ 'is-light': light }">
    <div ref="discRef" class="disc-rotor">
      <div class="disc-surface">
        <div class="disc-rings" aria-hidden="true"></div>
      </div>
      <div class="disc-label">
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
      </div>
      <div class="disc-hole" aria-hidden="true"></div>
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

const discRef = ref<HTMLElement | null>(null)
let angle = 0
let rafId = 0
let lastTs = 0
const ROTATE_SPEED = 18

const applyAngle = () => {
  if (discRef.value) discRef.value.style.transform = `rotate(${angle}deg)`
}

const step = (ts: number) => {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  angle = (angle + ROTATE_SPEED * dt) % 360
  applyAngle()
  rafId = requestAnimationFrame(step)
}

const start = () => {
  if (rafId) return
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

watch(() => props.active, (playing) => {
  if (playing) start()
  else stop()
})

onMounted(() => {
  applyAngle()
  if (props.active) start()
})

onBeforeUnmount(() => {
  stop()
})
</script>

<style scoped>
.cd-disc {
  width: 100%;
  max-width: min(100%, 360px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.disc-rotor {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 50%;
  will-change: transform;
}

.disc-surface {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 28%, rgba(0, 0, 0, 0.22) 62%, rgba(0, 0, 0, 0.45) 100%),
    linear-gradient(135deg, #1f232d 0%, #0d0f14 100%);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.48);
}

.cd-disc.is-light .disc-surface {
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.04) 30%, rgba(0, 0, 0, 0.18) 64%, rgba(0, 0, 0, 0.36) 100%),
    linear-gradient(135deg, #2b303c 0%, #141821 100%);
  box-shadow: 0 14px 34px rgba(20, 22, 26, 0.26), inset 0 0 18px rgba(0, 0, 0, 0.4);
}

.disc-rings {
  position: absolute;
  inset: 7%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.disc-rings::before,
.disc-rings::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  inset: 12%;
}

.disc-rings::after {
  inset: 28%;
}

.disc-label {
  position: absolute;
  inset: 30%;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.2);
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

.disc-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 11%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(255, 255, 255, 0.12) 0%, #11151c 48%, #020305 100%);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.8);
}
</style>
