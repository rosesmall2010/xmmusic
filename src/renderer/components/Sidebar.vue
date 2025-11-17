<template>
  <aside class="sidebar">
    <nav class="sidebar-nav">
      <template v-for="item in menuItems" :key="item.id">
        <div
          class="nav-item"
          :class="{ active: activeMenu === item.id || (item.id === 'playlist' && activeMenu.startsWith('playlist')) }"
          @click="selectMenu(item.id)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-text">{{ $t(`sidebar.${item.id}`) }}</span>
          <span v-if="item.id === 'playlist' && playlists.length > 0" class="submenu-toggle">
            {{ expandedMenu === 'playlist' ? '▲' : '▼' }}
          </span>
        </div>

        <div
          v-if="item.id === 'playlist' && expandedMenu === 'playlist' && playlists.length > 0"
          class="submenu"
        >
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="submenu-item"
            :class="{ active: activeMenu === `playlist-${playlist.id}` }"
            @click.stop="selectPlaylist(playlist.id)"
          >
            <span class="submenu-bullet">•</span>
            <span class="submenu-text">{{ playlist.name }}</span>
          </div>
        </div>
      </template>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMusicStore } from '@/stores/music'

const musicStore = useMusicStore()
const activeMenu = ref('local')
const playlists = computed(() => musicStore.playlists)
const expandedMenu = ref<string | null>('playlist')

const menuItems = [
  { id: 'local', icon: '🎵' },
  { id: 'recent', icon: '🕒' },
  { id: 'playlist', icon: '📋' },
  { id: 'favorites', icon: '❤️' },
  { id: 'queue', icon: '📻' },
  { id: 'settings', icon: '⚙️' }
]

onMounted(async () => {
  await musicStore.loadPlaylists()
})

const selectMenu = (menuId: string) => {
  activeMenu.value = menuId
  if (menuId === 'playlist') {
    expandedMenu.value = expandedMenu.value === 'playlist' ? null : 'playlist'
    musicStore.setCurrentView('playlist')
  } else {
    musicStore.setCurrentView(menuId as any)
  }
}

const selectPlaylist = (playlistId: number) => {
  musicStore.selectPlaylist(playlistId)
  activeMenu.value = `playlist-${playlistId}`
}
</script>

<style scoped>
.sidebar {
  width: 200px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  overflow-y: auto;
}

.sidebar-nav {
  padding: 20px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  user-select: none;
  color: var(--text-color);
}

.nav-item:hover {
  background-color: var(--hover-bg);
}

.nav-item.active {
  background-color: var(--active-bg);
  color: var(--active-text);
}

.submenu-toggle {
  margin-left: auto;
  font-size: 12px;
}

.submenu {
  padding-left: 30px;
  background: var(--sidebar-bg);
}

.submenu-item {
  display: flex;
  align-items: center;
  padding: 6px 0;
  cursor: pointer;
  color: var(--secondary-text-color);
  transition: color 0.2s;
}

.submenu-item.active,
.submenu-item:hover {
  color: var(--active-text);
}

.submenu-bullet {
  margin-right: 8px;
}

.submenu-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-icon {
  margin-right: 10px;
  font-size: 16px;
}

.nav-text {
  flex: 1;
  font-size: 14px;
}
</style>
