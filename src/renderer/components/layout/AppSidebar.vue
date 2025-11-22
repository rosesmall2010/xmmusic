<template>
  <aside class="app-sidebar">
    <nav class="sidebar-nav">
      <!-- 主要导航 -->
      <div class="nav-section">
        <router-link
          v-for="item in mainNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </div>

      <!-- 分隔线 -->
      <div class="nav-divider"></div>

      <!-- 我的音乐 -->
      <div class="nav-section">
        <div class="section-header">
          <span class="section-title">我的音乐</span>
        </div>
        <router-link
          v-for="item in myMusicItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.count" class="nav-count">{{ item.count }}</span>
        </router-link>
      </div>

      <!-- 分隔线 -->
      <div class="nav-divider"></div>

      <!-- 创建的歌单 -->
      <div class="nav-section">
        <div class="section-header">
          <span class="section-title">创建的歌单</span>
          <button class="add-btn" @click="createPlaylist" title="创建歌单">
            <span>+</span>
          </button>
        </div>
        <router-link
          v-for="playlist in playlists"
          :key="playlist.id"
          :to="`/playlist/${playlist.id}`"
          class="nav-item"
          active-class="active"
        >
          <span class="nav-icon">🎵</span>
          <span class="nav-label">{{ playlist.name }}</span>
          <span class="nav-count">{{ playlist.songCount }}</span>
        </router-link>

        <div v-if="playlists.length === 0" class="empty-hint">
          <p>还没有歌单</p>
          <button class="link-button" @click="createPlaylist">创建第一个歌单</button>
        </div>
      </div>
    </nav>

    <!-- 底部统计信息 -->
    <div class="sidebar-footer">
      <div class="stats-item">
        <span class="stats-label">本地音乐</span>
        <span class="stats-value">{{ totalCount }} 首</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Music, Folder, Heart, Clock } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const totalCount = ref(0)
const playlists = ref<any[]>([])

const navItems = ref([
  { path: '/discover', icon: Music, label: '发现音乐', section: 'main' },
  { path: '/local', icon: Folder, label: '本地音乐', section: 'main' },
  { path: '/favorites', icon: Heart, label: '我喜欢', count: 0, section: 'myMusic' },
  { path: '/recent', icon: Clock, label: '最近播放', count: 0, section: 'myMusic' },
])

const mainNavFilteredItems = computed(() => navItems.value.filter(item => item.section === 'main'));
const myMusicFilteredItems = computed(() => navItems.value.filter(item => item.section === 'myMusic'));

onMounted(async () => {
  // 加载统计信息
  totalCount.value = await window.electronAPI.getMusicTotalCount()

  // 加载歌单列表
  try {
    playlists.value = await window.electronAPI.getPlaylists()
  } catch (error) {
    console.error('Failed to load playlists:', error)
  }
})

const createPlaylist = () => {
  router.push('/playlists')
}
</script>

<style scoped>
.app-sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) 0;
}

.nav-section {
  margin-bottom: var(--spacing-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  margin-bottom: var(--spacing-xs);
}

.section-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-lg);
  line-height: 1;
  transition: all var(--transition-base) var(--transition-timing);
}

.add-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--transition-base) var(--transition-timing);
  cursor: pointer;
  position: relative;
}

.nav-item:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.nav-item.active {
  background: var(--active-bg);
  color: var(--active-text);
  font-weight: 500;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--active-text);
}

.nav-icon {
  font-size: var(--font-size-lg);
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-count {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.nav-divider {
  height: 1px;
  background: var(--border-color);
  margin: var(--spacing-md) var(--spacing-lg);
}

.empty-hint {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.empty-hint p {
  margin-bottom: var(--spacing-sm);
}

.link-button {
  border: none;
  background: none;
  color: var(--active-text);
  cursor: pointer;
  padding: 0;
  font-size: var(--font-size-xs);
  text-decoration: underline;
}

.link-button:hover {
  opacity: 0.8;
}

.sidebar-footer {
  border-top: 1px solid var(--sidebar-border);
  padding: var(--spacing-lg);
}

.stats-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
}

.stats-label {
  color: var(--text-tertiary);
}

.stats-value {
  color: var(--text-secondary);
  font-weight: 600;
}
</style>
