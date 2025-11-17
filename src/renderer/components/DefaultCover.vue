<template>
  <div class="default-cover" :class="coverClasses">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#ff4757;stop-opacity:1" />
        </linearGradient>
      </defs>

      <!-- 背景 -->
      <rect width="100" height="100" fill="url(#bgGradient)" />

      <!-- 音符 -->
      <g fill="white" opacity="0.9">
        <!-- 第一个音符 -->
        <circle cx="35" cy="65" r="8" />
        <circle cx="42" cy="63" r="8" />
        <rect x="42" y="35" width="3" height="28" />
        <path d="M 42 35 Q 55 32 55 38 L 55 45 Q 55 40 42 42 Z" />

        <!-- 第二个音符 -->
        <circle cx="60" cy="70" r="6" />
        <rect x="65" y="45" width="2.5" height="25" />
      </g>
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
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.default-cover.small {
  width: 40px;
  height: 40px;
}

.default-cover.large {
  width: 150px;
  height: 150px;
  border-radius: 8px;
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
</style>
