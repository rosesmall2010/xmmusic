<template>
  <div class="local-music-view">
    <LocalMusicList />
  </div>
</template>

<script setup lang="ts">
import LocalMusicList from '@/components/music/LocalMusicList.vue'
</script>

<style scoped>
.local-music-view {
  height: 100%;
  overflow: hidden;
}
</style>
