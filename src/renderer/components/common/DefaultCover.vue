<template>
  <div class="default-cover" :class="coverClasses">
    <img :src="defaultCoverImage" alt="默认封面" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import defaultCoverImage from '@/assets/default-cover.png'

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

.default-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
