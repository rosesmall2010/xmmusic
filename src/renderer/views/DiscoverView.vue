<template>
  <div class="discover-view">
    <h1 class="page-title">发现音乐</h1>

    <!-- 推荐分类 -->
    <section class="section">
      <h2 class="section-title">智能推荐</h2>
      <div class="recommendation-grid">
        <div class="recommendation-card" @click="goToRecent">
          <div class="card-icon">🕐</div>
          <h3>最近播放</h3>
          <p>{{ recentCount }} 首歌曲</p>
        </div>

        <div class="recommendation-card" @click="goToFavorites">
          <div class="card-icon">❤️</div>
          <h3>我喜欢</h3>
          <p>{{ favoritesCount }} 首歌曲</p>
        </div>

        <div class="recommendation-card" @click="goToLocalMusic">
          <div class="card-icon">📁</div>
          <h3>本地音乐</h3>
          <p>{{ totalCount }} 首歌曲</p>
        </div>

        <div class="recommendation-card">
          <div class="card-icon">🎲</div>
          <h3>随机播放</h3>
          <p>打乱播放所有歌曲</p>
        </div>
      </div>
    </section>

    <!-- 最近添加 -->
    <section class="section">
      <h2 class="section-title">最近添加</h2>
      <div class="music-list">
        <div
          v-for="music in recentlyAdded"
          :key="music.id"
          class="music-item"
          @dblclick="playMusic(music)"
        >
          <div class="music-cover">
            <DefaultCover v-if="!music.coverPath" mode="fill" />
            <img v-else :src="getCoverUrl(music.coverPath)" alt="封面" />
            <div class="play-overlay">▶</div>
          </div>
          <div class="music-info">
            <div class="music-title">{{ music.title }}</div>
            <div class="music-artist">{{ music.artist }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from '@/components/common/DefaultCover.vue'
import { getCoverUrl } from '@/utils/media'
import type { MusicItem } from '@shared/types/music'

const router = useRouter()
const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const { play } = usePlayer()

const recentCount = ref(0)
const favoritesCount = ref(0)
const totalCount = ref(0)
const recentlyAdded = ref<MusicItem[]>([])

onMounted(async () => {
  // 加载统计数据
  totalCount.value = await window.electronAPI.getMusicTotalCount()

  // 加载最近添加的歌曲
  const criteria = {
    sortBy: 'addedAt' as const,
    sortOrder: 'desc' as const,
    limit: 10,
  }
  const results = await window.electronAPI.advancedSearch(criteria)
  recentlyAdded.value = results
})

const goToRecent = () => {
  router.push('/recent')
}

const goToFavorites = () => {
  router.push('/favorites')
}

const goToLocalMusic = () => {
  router.push('/local')
}

const playMusic = async (music: MusicItem) => {
  playerStore.addToQueue(music)
  const index = playerStore.queue.findIndex(m => m.id === music.id)
  playerStore.setCurrentQueueIndex(index >= 0 ? index : playerStore.queue.length - 1)
  await play(music)
}
</script>

<style scoped>
.discover-view {
  padding: var(--spacing-xl);
  height: 100%;
  overflow-y: auto;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-xl);
}

.section {
  margin-bottom: var(--spacing-2xl);
}

.section-title {
  font-size: var(--font-size-2xl);
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: var(--spacing-lg);
}

.recommendation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-lg);
}

.recommendation-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
  box-shadow: var(--shadow-sm);
}

.recommendation-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.card-icon {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
}

.recommendation-card h3 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.recommendation-card p {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.music-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--spacing-lg);
}

.music-item {
  cursor: pointer;
  transition: transform var(--transition-base) var(--transition-timing);
}

.music-item:hover {
  transform: scale(1.05);
}

.music-item:hover .play-overlay {
  opacity: 1;
}

.music-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.music-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: white;
  opacity: 0;
  transition: opacity var(--transition-base) var(--transition-timing);
}

.music-info {
  text-align: center;
}

.music-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: var(--spacing-xs);
}

.music-artist {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
