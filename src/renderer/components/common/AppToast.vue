<template>
  <Transition name="toast-fade">
    <div v-if="visible" class="app-toast" role="status" aria-live="polite">
      {{ message }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useToastState } from '@/composables/useToast'

const { message, visible } = useToastState()
</script>

<style scoped>
.app-toast {
  position: fixed;
  left: 50%;
  bottom: 100px;
  transform: translateX(-50%);
  z-index: 1080;
  max-width: min(480px, calc(100vw - 48px));
  padding: 10px 18px;
  border-radius: var(--radius-base, 8px);
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  font-size: var(--font-size-sm, 13px);
  line-height: 1.45;
  text-align: center;
  word-break: break-word;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  pointer-events: none;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
