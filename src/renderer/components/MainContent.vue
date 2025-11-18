<template>
  <main class="main-content">
    <component :is="currentView" />
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMusicStore } from '@/stores/music'
import MusicListView from './MusicListView.vue'
import PlaylistManager from './PlaylistManager.vue'
import FavoritesList from './FavoritesList.vue'
import PlayHistory from './PlayHistory.vue'
import PlayQueueView from './PlayQueueView.vue'
import PlaylistDetailView from './PlaylistDetailView.vue'
import RecommendationsView from './RecommendationsView.vue'
import StatisticsView from './StatisticsView.vue'
import SettingsView from './Settings/SettingsView.vue'

const musicStore = useMusicStore()

const currentView = computed(() => {
  switch (musicStore.currentView) {
    case 'local':
      return MusicListView
    case 'playlist':
      return PlaylistManager
    case 'favorites':
      return FavoritesList
    case 'recent':
      return PlayHistory
    case 'queue':
      return PlayQueueView
    case 'playlist-detail':
      return PlaylistDetailView
    case 'recommendations':
      return RecommendationsView
    case 'statistics':
      return StatisticsView
    case 'settings':
      return SettingsView
    default:
      return MusicListView
  }
})
</script>

<style scoped>
.main-content {
  flex: 1;
  overflow: hidden;
  background: var(--bg-color);
}
</style>
