import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/mini',
    name: 'MiniPlayer',
    component: () => import('@/views/MiniPlayerView.vue'),
    meta: { layout: 'blank' }
  },
  {
    path: '/desktop-lyrics',
    name: 'DesktopLyrics',
    component: () => import('@/views/DesktopLyricsWindow.vue'),
    meta: { layout: 'blank' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/discover'
  },
  {
    path: '/discover',
    name: 'Discover',
    component: () => import('@/views/DiscoverView.vue'),
    meta: {
      title: '发现音乐',
      icon: '🎵',
    },
  },
  {
    path: '/local',
    name: 'LocalMusic',
    component: () => import('@/views/LocalMusicView.vue'),
    meta: {
      title: '本地音乐',
      icon: '📁',
    },
  },
  {
    path: '/favorites',
    name: 'Favorites',
    component: () => import('@/views/FavoritesView.vue'),
    meta: {
      title: '我喜欢',
      icon: '❤️',
    },
  },
  {
    path: '/playlists',
    name: 'Playlists',
    component: () => import('@/views/PlaylistsView.vue'),
    meta: {
      title: '歌单',
      icon: '🎶',
    },
  },
  {
    path: '/playlist/:id',
    name: 'PlaylistDetail',
    component: () => import('@/views/PlaylistDetailView.vue'),
    meta: {
      title: '歌单详情',
    },
  },
  {
    path: '/recent',
    name: 'RecentPlay',
    component: () => import('@/views/RecentPlayView.vue'),
    meta: {
      title: '最近播放',
      icon: '🕐',
    },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: {
      title: '设置',
      icon: '⚙️',
    },
  },
  {
    path: '/playing',
    name: 'NowPlaying',
    component: () => import('@/views/NowPlayingView.vue'),
    meta: {
      title: '正在播放',
      fullscreen: true,
    },
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('@/views/SearchView.vue'),
    meta: {
      title: '搜索结果',
      icon: '🔍',
    },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫
router.beforeEach((_to, _from, next) => {
  next()
})

export default router
