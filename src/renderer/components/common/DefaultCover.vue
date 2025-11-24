<template>
  <div class="default-cover" :class="coverClasses">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
        <radialGradient id="vinylGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.3" />
          <stop offset="70%" style="stop-color:#000000;stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
        </radialGradient>
      </defs>

      <!-- Background -->
      <rect width="100" height="100" fill="url(#bgGradient)" />

      <!-- Vinyl Record Effect -->
      <circle cx="50" cy="50" r="40" fill="url(#vinylGradient)" opacity="0.4" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="white" stroke-width="0.5" opacity="0.15" />
      <circle cx="50" cy="50" r="25" fill="none" stroke="white" stroke-width="0.5" opacity="0.15" />
      <circle cx="50" cy="50" r="15" fill="none" stroke="white" stroke-width="0.5" opacity="0.15" />

      <!-- Center Music Icon -->
      <g transform="translate(50, 50)" fill="white" opacity="0.9">
        <!-- Music Note -->
        <circle cx="-8" cy="8" r="4" />
        <circle cx="0" cy="6" r="4" />
        <rect x="0" y="-8" width="1.5" height="14" />
        <path d="M 0 -8 Q 8 -10 8 -6 L 8 0 Q 8 -4 0 -3 Z" />

        <!-- Second Note -->
        <circle cx="10" cy="10" r="3" />
        <rect x="13" y="-2" width="1.2" height="12" />
      </g>

      <!-- Shine Effect -->
      <circle cx="30" cy="30" r="8" fill="white" opacity="0.1" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'small' | 'medium' | 'large'
  mode?: 'fixed' | 'fill'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  mode: 'fixed'
})

const coverClasses = computed(() => ({
  small: props.size === 'small' && props.mode !== 'fill',
  large: props.size === 'large' && props.mode !== 'fill',
  fill: props.mode === 'fill'
}))
</script>

<style scoped>
.default-cover {
  width: 50px;
  height: 50px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.default-cover:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.default-cover.small {
  width: 40px;
  height: 40px;
  border-radius: 4px;
}

.default-cover.large {
  width: 150px;
  height: 150px;
  border-radius: 12px;
}

.default-cover.fill {
  width: 100% !important;
  height: 100% !important;
  border-radius: inherit;
}

.default-cover svg {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
}

/* Override styles for fallback mode */
.default-cover.fallback-cover {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
  box-shadow: none !important;
}
</style>
