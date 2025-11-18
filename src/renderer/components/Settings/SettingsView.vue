<template>
  <div class="settings-view">
    <div class="settings-sidebar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-name">{{ tab.name }}</span>
      </div>
    </div>

    <div class="settings-content">
      <component :is="activeComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import GeneralSettings from './GeneralSettings.vue'
import PlaybackSettings from './PlaybackSettings.vue'
import EqualizerView from '../EqualizerView.vue'
import MusicDirectorySettings from './MusicDirectorySettings.vue'
import ShortcutSettings from './ShortcutSettings.vue'
import About from './About.vue'
import ID3FixView from '../ID3FixView.vue'

const activeTab = ref('general')

const tabs = [
  { id: 'general', name: '通用', icon: '⚙️' },
  { id: 'playback', name: '播放', icon: '🎵' },
  { id: 'equalizer', name: '均衡器', icon: '🎚️' },
  { id: 'library', name: '媒体库', icon: '📚' },
  { id: 'shortcuts', name: '快捷键', icon: '⌨️' },
  { id: 'id3fix', name: 'ID3修复', icon: '🔧' },
  { id: 'about', name: '关于', icon: 'ℹ️' }
]

const activeComponent = computed(() => {
  switch (activeTab.value) {
    case 'general':
      return GeneralSettings
    case 'playback':
      return PlaybackSettings
    case 'equalizer':
      return EqualizerView
    case 'library':
      return MusicDirectorySettings
    case 'shortcuts':
      return ShortcutSettings
    case 'id3fix':
      return ID3FixView
    case 'about':
      return About
    default:
      return GeneralSettings
  }
})
</script>

<style scoped>
.settings-view {
  display: flex;
  height: 100%;
}

.settings-sidebar {
  width: 200px;
  border-right: 1px solid var(--border-color);
  padding: 20px 0;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--text-color);
}

.tab-item:hover {
  background-color: var(--hover-bg);
}

.tab-item.active {
  background-color: var(--active-bg);
  color: var(--active-text);
}

.tab-icon {
  margin-right: 10px;
  font-size: 18px;
}

.tab-name {
  font-size: 14px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
}
</style>
