<template>
  <div class="recommendations-view">
    <div class="recommendations-header">
      <h2>智能推荐</h2>
      <div class="header-actions">
        <button @click="refreshRecommendations" class="btn-refresh" :disabled="loading">
          {{ loading ? '加载中...' : '刷新推荐' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="recommendations-content">
      <!-- 基于播放历史的推荐 -->
      <div class="recommendation-section">
        <h3>
          <span class="section-icon">🕒</span>
          <span>基于播放历史</span>
        </h3>
        <div v-if="historyBased.length === 0" class="empty-state">
          暂无推荐（需要播放记录）
        </div>
        <div v-else class="recommendation-list">
          <div
            v-for="song in historyBased"
            :key="song.id"
            class="recommendation-item"
            @dblclick="playSong(song)"
          >
            <div class="song-info">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-meta">{{ song.artist }} · {{ song.album || '未知专辑' }}</div>
            </div>
            <div class="song-actions">
              <button @click.stop="addToQueue(song)" class="btn-action" title="添加到队列">➕</button>
              <button @click.stop="playSong(song)" class="btn-action" title="播放">▶️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 基于收藏的推荐 -->
      <div class="recommendation-section">
        <h3>
          <span class="section-icon">❤️</span>
          <span>基于我的收藏</span>
        </h3>
        <div v-if="favoriteBased.length === 0" class="empty-state">
          暂无推荐（需要收藏歌曲）
        </div>
        <div v-else class="recommendation-list">
          <div
            v-for="song in favoriteBased"
            :key="song.id"
            class="recommendation-item"
            @dblclick="playSong(song)"
          >
            <div class="song-info">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-meta">{{ song.artist }} · {{ song.album || '未知专辑' }}</div>
            </div>
            <div class="song-actions">
              <button @click.stop="addToQueue(song)" class="btn-action" title="添加到队列">➕</button>
              <button @click.stop="playSong(song)" class="btn-action" title="播放">▶️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 基于相似度的推荐 -->
      <div class="recommendation-section">
        <h3>
          <span class="section-icon">✨</span>
          <span>基于相似度</span>
        </h3>
        <div v-if="similarityBased.length === 0" class="empty-state">
          暂无推荐（需要播放或收藏歌曲）
        </div>
        <div v-else class="recommendation-list">
          <div
            v-for="song in similarityBased"
            :key="song.id"
            class="recommendation-item"
            @dblclick="playSong(song)"
          >
            <div class="song-info">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-meta">{{ song.artist }} · {{ song.album || '未知专辑' }}</div>
            </div>
            <div class="similarity-score" v-if="song.similarity !== undefined">
              <span class="score-value">{{ Math.round(song.similarity * 100) }}%</span>
            </div>
            <div class="song-actions">
              <button @click.stop="addToQueue(song)" class="btn-action" title="添加到队列">➕</button>
              <button @click.stop="playSong(song)" class="btn-action" title="播放">▶️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import type { MusicItem } from '@shared/types/music'

interface SimilarSong extends MusicItem {
  similarity?: number
}

const playerStore = usePlayerStore()
const player = usePlayer()

const loading = ref(false)
const historyBased = ref<MusicItem[]>([])
const favoriteBased = ref<MusicItem[]>([])
const similarityBased = ref<SimilarSong[]>([])

const loadRecommendations = async () => {
  loading.value = true
  try {
    // 基于播放历史：获取最常播放的歌曲，然后为每首找相似歌曲
    const topSongs = await window.electronAPI.getTopPlayedSongs(5)
    if (topSongs.length > 0) {
      const recommendations = new Set<number>()
      for (const song of topSongs.slice(0, 3)) {
        const similar = await window.electronAPI.getSimilarMusic(song.id, 5, 0.6)
        similar.forEach(s => {
          if (!topSongs.some(t => t.id === s.id)) {
            recommendations.add(s.id)
          }
        })
      }
      const historyIds = Array.from(recommendations).slice(0, 10)
      if (historyIds.length > 0) {
        const songs = await Promise.all(
          historyIds.map(id => window.electronAPI.getMusicById(id))
        )
        historyBased.value = songs.filter(s => s !== null) as MusicItem[]
      }
    }

    // 基于收藏：获取收藏的歌曲，然后为每首找相似歌曲
    const favorites = await window.electronAPI.getFavorites()
    if (favorites.length > 0) {
      const recommendations = new Set<number>()
      for (const song of favorites.slice(0, 5)) {
        const similar = await window.electronAPI.getSimilarMusic(song.id, 5, 0.6)
        similar.forEach(s => {
          if (!favorites.some(f => f.id === s.id)) {
            recommendations.add(s.id)
          }
        })
      }
      const favoriteIds = Array.from(recommendations).slice(0, 10)
      if (favoriteIds.length > 0) {
        const songs = await Promise.all(
          favoriteIds.map(id => window.electronAPI.getMusicById(id))
        )
        favoriteBased.value = songs.filter(s => s !== null) as MusicItem[]
      }
    }

    // 基于相似度：如果当前正在播放，推荐相似歌曲
    if (playerStore.currentMusic) {
      const similar = await window.electronAPI.getSimilarMusic(
        playerStore.currentMusic.id,
        10,
        0.5
      )
      similarityBased.value = similar as SimilarSong[]
    } else if (favorites.length > 0) {
      // 如果没有正在播放，基于最喜欢的歌曲推荐
      const favorite = favorites[0]
      const similar = await window.electronAPI.getSimilarMusic(favorite.id, 10, 0.5)
      similarityBased.value = similar as SimilarSong[]
    }
  } catch (error) {
    console.error('加载推荐失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshRecommendations = () => {
  loadRecommendations()
}

const playSong = async (song: MusicItem) => {
  await player.play(song)
}

const addToQueue = (song: MusicItem) => {
  playerStore.addToQueue(song)
}

onMounted(() => {
  loadRecommendations()
})
</script>

<style scoped>
.recommendations-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.recommendations-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.recommendations-header h2 {
  margin: 0;
  color: var(--text-color);
}

.btn-refresh {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--hover-bg);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--secondary-text-color);
}

.recommendations-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.recommendation-section {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
}

.recommendation-section h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--text-color);
}

.section-icon {
  font-size: 20px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--secondary-text-color);
  font-size: 14px;
}

.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recommendation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;
}

.recommendation-item:hover {
  background: var(--hover-bg);
}

.song-info {
  flex: 1;
  min-width: 0;
}

.song-title {
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-meta {
  font-size: 12px;
  color: var(--secondary-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similarity-score {
  display: flex;
  align-items: center;
  min-width: 50px;
}

.score-value {
  font-size: 13px;
  font-weight: 600;
  color: #ff4757;
}

.song-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--hover-bg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.btn-action:hover {
  background: var(--active-bg);
}
</style>
