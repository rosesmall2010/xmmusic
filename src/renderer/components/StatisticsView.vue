<template>
  <div class="statistics-view">
    <div class="statistics-header">
      <h2>播放统计</h2>
      <div class="header-actions">
        <select v-model="selectedPeriod" @change="loadStatistics" class="period-select">
          <option value="7">最近7天</option>
          <option value="30">最近30天</option>
          <option value="90">最近90天</option>
          <option value="all">全部</option>
        </select>
        <button @click="exportStatistics" class="btn-export">导出报告</button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="statistics-content">
      <!-- 总体统计 -->
      <div class="stats-overview">
        <div class="stat-card">
          <div class="stat-label">总播放次数</div>
          <div class="stat-value">{{ formatNumber(overallStats.totalPlays) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总播放时长</div>
          <div class="stat-value">{{ formatDuration(overallStats.totalDuration) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总歌曲数</div>
          <div class="stat-value">{{ formatNumber(overallStats.totalSongs) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">平均播放次数</div>
          <div class="stat-value">{{ overallStats.averagePlaysPerSong.toFixed(2) }}</div>
        </div>
      </div>

      <!-- 播放趋势图表 -->
      <div class="stats-section">
        <h3>播放趋势</h3>
        <div class="chart-container">
          <canvas ref="trendChartRef" width="800" height="300"></canvas>
        </div>
      </div>

      <!-- 最常播放歌曲 -->
      <div class="stats-section">
        <h3>最常播放歌曲</h3>
        <div class="top-songs-list">
          <div
            v-for="(song, index) in topSongs"
            :key="song.id"
            class="song-item"
            @click="playSong(song)"
          >
            <div class="song-rank">{{ index + 1 }}</div>
            <div class="song-info">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-artist">{{ song.artist }}</div>
            </div>
            <div class="song-stats">
              <span class="play-count">{{ song.playCount }} 次</span>
              <span class="last-played">{{ formatDate(song.lastPlayedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 按艺术家统计 -->
      <div class="stats-section">
        <h3>最常播放艺术家</h3>
        <div class="artist-list">
          <div
            v-for="(item, index) in artistStats"
            :key="index"
            class="artist-item"
          >
            <div class="artist-rank">{{ index + 1 }}</div>
            <div class="artist-name">{{ item.artist }}</div>
            <div class="artist-stats">
              <span>{{ item.playCount }} 次播放</span>
              <span>{{ item.songCount }} 首歌曲</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import type { PlayStatistics, TopPlayedSong, PlayTrendData } from '@shared/types/statistics'

const playerStore = usePlayerStore()
const player = usePlayer()

const loading = ref(false)
const selectedPeriod = ref('30')
const overallStats = ref<PlayStatistics>({
  totalPlays: 0,
  totalDuration: 0,
  totalSongs: 0,
  averagePlaysPerSong: 0,
  averageDuration: 0
})
const topSongs = ref<TopPlayedSong[]>([])
const artistStats = ref<Array<{ artist: string; playCount: number; songCount: number }>>([])
const trendData = ref<PlayTrendData[]>([])
const trendChartRef = ref<HTMLCanvasElement | null>(null)

const formatNumber = (num: number): string => {
  return num.toLocaleString('zh-CN')
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '从未播放'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

const loadStatistics = async () => {
  loading.value = true
  try {
    // 加载总体统计（不受时间范围限制）
    overallStats.value = await window.electronAPI.getOverallStatistics()

    // 加载最常播放歌曲（不受时间范围限制）
    topSongs.value = await window.electronAPI.getTopPlayedSongs(20)

    // 加载艺术家统计（不受时间范围限制）
    artistStats.value = await window.electronAPI.getArtistStatistics(20)

    // 加载播放趋势（根据选择的时间范围）
    const days = selectedPeriod.value === 'all' ? 3650 : parseInt(selectedPeriod.value)
    trendData.value = await window.electronAPI.getPlayTrend(days)

    // 绘制图表
    await nextTick()
    drawTrendChart()
  } catch (error) {
    console.error('加载统计失败:', error)
  } finally {
    loading.value = false
  }
}

const drawTrendChart = () => {
  if (!trendChartRef.value) return

  if (trendData.value.length === 0) {
    // 如果没有数据，显示提示
    const canvas = trendChartRef.value
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary-text-color') || '#666'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('暂无播放数据', canvas.width / 2, canvas.height / 2)
    }
    return
  }

  const canvas = trendChartRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const padding = 40
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  // 清空画布
  ctx.clearRect(0, 0, width, height)

  // 设置样式
  ctx.strokeStyle = '#ff4757'
  ctx.fillStyle = '#ff4757'
  ctx.lineWidth = 2

  // 计算最大值
  const maxCount = Math.max(...trendData.value.map(d => d.count), 1)
  const maxDuration = Math.max(...trendData.value.map(d => d.duration), 1)

  // 绘制坐标轴
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding, padding)
  ctx.lineTo(padding, height - padding)
  ctx.lineTo(width - padding, height - padding)
  ctx.stroke()

  // 绘制数据线和点
  ctx.strokeStyle = '#ff4757'
  ctx.fillStyle = '#ff4757'
  ctx.lineWidth = 2
  ctx.beginPath()

  trendData.value.forEach((data, index) => {
    const x = padding + (index / Math.max(trendData.value.length - 1, 1)) * chartWidth
    const y = height - padding - (data.count / maxCount) * chartHeight

    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  // 绘制数据点
  trendData.value.forEach((data, index) => {
    const x = padding + (index / Math.max(trendData.value.length - 1, 1)) * chartWidth
    const y = height - padding - (data.count / maxCount) * chartHeight

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  // 绘制Y轴标签
  ctx.fillStyle = '#666'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxCount / 5) * i)
    const y = height - padding - (i / 5) * chartHeight
    ctx.fillText(value.toString(), padding - 10, y + 4)
  }

  // 绘制日期标签
  ctx.fillStyle = '#666'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  const labelInterval = Math.max(1, Math.ceil(trendData.value.length / 10))
  trendData.value.forEach((data, index) => {
    if (index % labelInterval === 0 || index === trendData.value.length - 1) {
      const x = padding + (index / Math.max(trendData.value.length - 1, 1)) * chartWidth
      const date = new Date(data.date + 'T00:00:00')
      const label = `${date.getMonth() + 1}/${date.getDate()}`
      ctx.fillText(label, x, height - padding + 20)
    }
  })
}

const playSong = async (song: TopPlayedSong) => {
  await player.play(song)
}

const exportStatistics = async () => {
  try {
    const filePath = await window.electronAPI.showSaveDialog({
      title: '导出播放统计报告',
      defaultPath: `播放统计_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (filePath) {
      const report = {
        generatedAt: new Date().toISOString(),
        period: selectedPeriod.value,
        overall: overallStats.value,
        topSongs: topSongs.value,
        artists: artistStats.value,
        trend: trendData.value
      }

      await window.electronAPI.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8')
      alert('导出成功！')
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    alert(`导出失败: ${error.message}`)
  }
}

onMounted(() => {
  loadStatistics()
})
</script>

<style scoped>
.statistics-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.statistics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.statistics-header h2 {
  margin: 0;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.period-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
}

.btn-export {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
}

.btn-export:hover {
  background: var(--hover-bg);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-color);
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  padding: 20px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: var(--secondary-text-color);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-color);
}

.stats-section {
  margin-bottom: 32px;
}

.stats-section h3 {
  margin-bottom: 16px;
  color: var(--text-color);
}

.chart-container {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  overflow-x: auto;
}

.top-songs-list,
.artist-list {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.song-item,
.artist-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.song-item:hover,
.artist-item:hover {
  background: var(--hover-bg);
}

.song-item:last-child,
.artist-item:last-child {
  border-bottom: none;
}

.song-rank,
.artist-rank {
  width: 30px;
  text-align: center;
  font-weight: bold;
  color: var(--secondary-text-color);
}

.song-info {
  flex: 1;
  margin-left: 12px;
}

.song-title {
  font-weight: 500;
  color: var(--text-color);
}

.song-artist {
  font-size: 12px;
  color: var(--secondary-text-color);
  margin-top: 4px;
}

.song-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.play-count {
  font-weight: 500;
  color: var(--text-color);
}

.last-played {
  font-size: 12px;
  color: var(--secondary-text-color);
}

.artist-name {
  flex: 1;
  font-weight: 500;
  color: var(--text-color);
}

.artist-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--secondary-text-color);
}
</style>
