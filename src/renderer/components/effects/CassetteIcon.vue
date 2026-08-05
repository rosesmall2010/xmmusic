<template>
  <!-- 磁带图标：开口朝上，风格对齐 lucide 线宽 -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <!-- 顶部开口 -->
    <path d="M7 5v-1.5h10V5" />
    <path d="M9 5v1.5M12 5v1.5M15 5v1.5" />
    <!-- 双卷轴 -->
    <circle cx="8" cy="13" r="2.2" />
    <circle cx="16" cy="13" r="2.2" />
    <path d="M10.2 13h3.6" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>
