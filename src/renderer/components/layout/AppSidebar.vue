<template>
  <aside class="app-sidebar">
    <nav class="sidebar-nav">
      <!-- 主要导航 -->
      <nav class="nav-section">
        <router-link
          v-for="item in mainNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
        >
          <component :is="item.icon" :size="20" class="nav-icon" />
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- 分隔线 -->
      <div class="nav-divider"></div>

      <!-- 我的音乐 -->
      <div class="nav-section">
        <div class="section-header">
          <span class="section-title">{{ $t('sidebar.myMusic') }}</span>
        </div>
        <nav class="nav-section">
          <router-link
            v-for="item in myMusicItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            active-class="active"
          >
            <component :is="item.icon" :size="20" class="nav-icon" />
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.count !== undefined" class="count">{{ item.count }}</span>
          </router-link>
        </nav>
      </div>

      <!-- 分隔线 -->
      <div class="nav-divider"></div>

      <!-- 创建的歌单 -->
      <div class="nav-section">
        <div class="section-header">
          <span class="section-title">{{ $t('sidebar.myPlaylists') }}</span>
          <button class="add-btn" @click="createPlaylist" :title="$t('sidebar.createPlaylist')">
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
          <div class="nav-icon playlist-icon">
            <img
              v-if="playlist.firstSongCover"
              :src="playlist.firstSongCover"
              class="playlist-cover-img"
              @error="handleCoverError(playlist)"
            />
            <ListMusic v-else :size="20" />
          </div>
          <span class="nav-label">{{ playlist.name }}</span>
          <span class="nav-count">{{ playlist.songCount }}</span>
        </router-link>

        <div v-if="playlists.length === 0" class="empty-hint">
          <p>{{ $t('sidebar.noPlaylists') }}</p>
          <button class="link-button" @click="createPlaylist">{{ $t('sidebar.createFirstPlaylist') }}</button>
        </div>
      </div>
    </nav>

    <!-- 底部统计信息 -->
    <div class="sidebar-footer">
      <div class="stats-item">
        <span class="stats-label">{{ $t('sidebar.local') }}</span>
        <span class="stats-value">{{ $t('sidebar.totalSongs', { count: totalCount }) }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Music, Folder, Heart, Clock, ListMusic } from 'lucide-vue-next'

const router = useRouter()
const { t } = useI18n()
const totalCount = ref(0)
const playlists = ref<any[]>([])
// 数量必须用独立的 ref 保存：直接修改 computed 返回的普通对象不具备响应式，界面不会更新
const favoritesCount = ref(0)
const recentPlaysCount = ref(0)

const navItems = computed(() => [
  { path: '/discover', icon: Music, label: t('sidebar.recommendations') },
  { path: '/local', icon: Folder, label: t('sidebar.local') },
  { path: '/favorites', icon: Heart, label: t('sidebar.favorites'), count: favoritesCount.value },
  { path: '/recent', icon: Clock, label: t('sidebar.recent'), count: recentPlaysCount.value },
])

const mainNavItems = computed(() => navItems.value.slice(0, 2))
const myMusicItems = computed(() => navItems.value.slice(2))

onMounted(async () => {
  // 加载统计信息
  await refreshCounts()

  // 加载歌单列表
  await loadPlaylists()

  // 监听歌单更新事件
  window.addEventListener('playlist-updated', loadPlaylists)
  window.addEventListener('song-added-to-playlist', loadPlaylists)

  // 监听收藏和播放历史更新事件
  window.addEventListener('favorites-updated', refreshFavoritesCount)
  window.addEventListener('recent-plays-updated', refreshRecentPlaysCount)
})

onUnmounted(() => {
  // 清理事件监听
  window.removeEventListener('playlist-updated', loadPlaylists)
  window.removeEventListener('song-added-to-playlist', loadPlaylists)
  window.removeEventListener('favorites-updated', refreshFavoritesCount)
  window.removeEventListener('recent-plays-updated', refreshRecentPlaysCount)
})

const refreshCounts = async () => {
  totalCount.value = await window.electronAPI.getMusicTotalCount()
  await refreshFavoritesCount()
  await refreshRecentPlaysCount()
}

const refreshFavoritesCount = async () => {
  try {
    const favorites = await window.electronAPI.getFavorites()
    favoritesCount.value = favorites.length
  } catch (error) {
    console.error('Failed to load favorites count:', error)
  }
}

const refreshRecentPlaysCount = async () => {
  try {
    const recentPlays = await window.electronAPI.getRecentPlays()
    recentPlaysCount.value = recentPlays.length
  } catch (error) {
    console.error('Failed to load recent plays count:', error)
  }
}

const loadPlaylists = async () => {
  try {
    const playlistData = await window.electronAPI.getPlaylists()
    // 为每个歌单加载第一首歌的封面
    playlists.value = await Promise.all(
      playlistData.map(async (playlist) => {
        try {
          const songs = await window.electronAPI.getPlaylistSongs(playlist.id)
          // 更新歌曲数量（确保是最新的）
          playlist.songCount = songs.length
          // 加载封面
          if (songs.length > 0 && songs[0].coverPath) {
            playlist.firstSongCover = `local-file://${songs[0].coverPath}`
          } else {
            // 如果没有歌曲，清除封面
            playlist.firstSongCover = null
          }
        } catch (error) {
          console.error(`Failed to load cover for playlist ${playlist.id}:`, error)
        }
        return playlist
      })
    )
  } catch (error) {
    console.error('Failed to load playlists:', error)
  }
}

const handleCoverError = (playlist: any) => {
  // 封面加载失败时移除封面引用
  playlist.firstSongCover = null
}

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

.playlist-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.playlist-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
