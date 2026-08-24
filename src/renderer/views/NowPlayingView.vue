<template>
  <div class="now-playing-view" :class="{ 'is-light': isLight }" :style="backgroundStyle" @click="closeQueueContextMenu">
    <!-- 背景特效：随所选特效切换；唱片特效的主体在封面区，背景保持干净 -->
    <div class="background-effects" aria-hidden="true">
      <AudioEqualizerBackground v-if="effect === 'spectrum' && effectEnabled" :active="isPlaying" :light="isLight" />
      <FlameBackground v-else-if="effect === 'flame' && effectEnabled" :active="isPlaying" :light="isLight" />
      <LightningBackground v-else-if="effect === 'lightning' && effectEnabled" :active="isPlaying" :light="isLight" />
    </div>
    <!-- 返回按钮 -->
    <div class="top-bar">
      <button class="btn-back" @click="goBack">
        <span class="icon">←</span>
        <span>{{ $t('nowPlaying.back') }}</span>
      </button>

      <div class="actions">
        <button class="btn-action" @click="toggleMiniMode">
          <Minimize2 :size="20" />
          <span class="btn-tooltip">{{ $t('nowPlaying.switchToMini') }}</span>
        </button>
        <button class="btn-action" @click="toggleTheme">
          <Moon v-if="isLight" :size="20" />
          <Sun v-else :size="20" />
          <span class="btn-tooltip">
            {{ isLight ? $t('header.switchToDark') : $t('header.switchToLight') }}
          </span>
        </button>
        <button class="btn-action" @click="toggleLanguage">
          <Languages :size="20" />
          <span class="btn-tooltip">{{ $t('header.switchLanguage') }}</span>
        </button>
        <button class="btn-action" @click="cycleEffect">
          <component :is="EffectIcon" :size="20" />
          <span class="btn-tooltip">
            {{ $t('nowPlaying.switchEffect') }}：{{ $t(`nowPlaying.effect.${effect}`) }}
          </span>
        </button>
        <button
          class="btn-action"
          :class="{ 'is-disabled': effectToggleDisabled }"
          :aria-disabled="effectToggleDisabled"
          @click="onEffectToggleClick"
        >
          <Eye v-if="effectEnabled" :size="20" />
          <EyeOff v-else :size="20" />
          <span class="btn-tooltip">
            {{
              effectToggleDisabled
                ? $t('nowPlaying.effectToggleUnavailable')
                : (effectEnabled ? $t('nowPlaying.disableEffect') : $t('nowPlaying.enableEffect'))
            }}
          </span>
        </button>
        <button class="btn-action" @click="toggleDesktopLyrics">
          <Monitor :size="20" />
          <span class="btn-tooltip">{{ $t('nowPlaying.desktopLyrics') }}</span>
        </button>
        <button class="btn-action" @click="toggleQueue">
          <List :size="20" />
          <span class="btn-tooltip">{{ $t('nowPlaying.showQueue') }}</span>
        </button>

        <div v-if="!isMac" class="window-controls">
          <button class="win-btn minimize" @click="minimizeWindow" :data-tip="$t('window.minimize')">
            <span>−</span>
          </button>
          <button class="win-btn maximize" @click="maximizeWindow" :data-tip="$t('window.maximize')">
            <span>□</span>
          </button>
          <button class="win-btn close" @click="closeWindow" :data-tip="$t('common.close')">
            <X :size="18" />
          </button>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="content">
      <!-- 上半部分：左右分栏 -->
      <div class="main-area" :class="{ 'is-vinyl': effect === 'vinyl' }">
        <!-- 左侧：封面和歌曲信息 -->
        <div class="left-panel" :class="{ 'is-vinyl': effect === 'vinyl' }">
          <!-- 专辑封面：唱片特效下换成旋转黑胶 -->
          <div class="album-cover-container">
            <VinylRecord
              v-if="effect === 'vinyl'"
              :cover-url="displayCoverUrl"
              :active="isPlaying"
              :light="isLight"
              :alt="$t('music.cover')"
              @cover-error="onCoverError"
            >
              <template #fallback>
                <DefaultCover mode="fill" />
              </template>
            </VinylRecord>
            <CDDisc
              v-else-if="effect === 'cd'"
              :cover-url="displayCoverUrl"
              :active="isPlaying"
              :light="isLight"
              :alt="$t('music.cover')"
              @cover-error="onCoverError"
            >
              <template #fallback>
                <DefaultCover mode="fill" />
              </template>
            </CDDisc>
            <Cassette
              v-else-if="effect === 'cassette'"
              :cover-url="displayCoverUrl"
              :active="isPlaying"
              :light="isLight"
              :alt="$t('music.cover')"
              @cover-error="onCoverError"
            >
              <template #fallback>
                <DefaultCover mode="fill" />
              </template>
            </Cassette>
            <div v-else class="album-cover">
              <DefaultCover v-if="!displayCoverUrl" mode="fill" />
              <template v-else>
                <DefaultCover class="fallback-cover" mode="fill" />
                <img
                  :src="displayCoverUrl"
                  :alt="$t('music.cover')"
                  @error="onCoverError"
                />
              </template>
            </div>
          </div>

          <!-- 歌曲信息 -->
          <div class="song-info">
            <h1 class="song-title">{{ currentMusic?.title || $t('nowPlaying.noMusic') }}</h1>
            <p class="song-artist">{{ currentMusic?.artist || $t('nowPlaying.unknownArtist') }}</p>
            <p class="song-album" :class="{ 'is-empty': !currentMusic?.album }">{{ currentMusic?.album || ' ' }}</p>
          </div>
        </div>

        <!-- 右侧：歌词/队列 -->
        <div class="right-panel">
          <!-- 切换标签 -->
          <div class="panel-tabs">
            <button
              class="panel-tab"
              :class="{ active: rightPanelMode === 'lyrics' }"
              @click="rightPanelMode = 'lyrics'"
            >
              {{ $t('nowPlaying.lyrics') }}
            </button>
            <button
              class="panel-tab"
              :class="{ active: rightPanelMode === 'queue' }"
              @click="rightPanelMode = 'queue'"
            >
              {{ $t('nowPlaying.queue') }} ({{ queue.length }})
            </button>
          </div>

          <!-- 歌词面板 -->
          <div v-show="rightPanelMode === 'lyrics'" class="lyrics-panel">
            <div class="lyrics-container" ref="lyricsContainerRef">
              <p
                v-for="(line, index) in lyrics"
                :key="index"
                class="lyrics-line"
                :class="{ active: index === currentLyricIndex }"
                @click="seek(line.time)"
              >
                {{ line.text }}
              </p>
              <p v-if="lyrics.length === 0" class="lyrics-line empty">{{ $t('nowPlaying.noLyrics') }}</p>
            </div>
          </div>

          <!-- 队列面板：虚拟滚动，避免万级队列一次性渲染全部 DOM 节点。这里挂在 v-show 里，
               队列面板即使没打开也常驻 DOM，播放进度每 tick 触发的重渲染都要重新 diff 这份列表，
               不做虚拟滚动的话歌单上万条时全屏页 CPU 会明显偏高（做法与 PlayQueueDrawer.vue 一致） -->
          <div v-show="rightPanelMode === 'queue'" class="queue-panel">
            <div class="queue-list" ref="queueListRef" @scroll="handleQueueScroll">
              <div class="queue-list-inner" :style="{ height: queueTotalHeight + 'px' }">
                <div
                  v-for="item in visibleQueue"
                  :key="item.music.id"
                  class="queue-item"
                  :class="{ active: currentQueueIndex === item.index }"
                  :style="{ height: queueItemHeight + 'px', transform: `translateY(${item.index * queueItemHeight}px)` }"
                  @dblclick="playQueueItem(item.index)"
                  @contextmenu.prevent="showQueueContextMenu($event, item.music, item.index)"
                >
                  <div class="item-index">
                    <Volume2 v-if="currentQueueIndex === item.index" :size="14" class="playing-icon" />
                    <span v-else>{{ item.index + 1 }}</span>
                  </div>
                  <div class="item-info">
                    <div class="item-title">{{ item.music.title }}</div>
                    <div class="item-meta">
                      <span class="item-artist">{{ item.music.artist }}</span>
                      <span class="item-sep">·</span>
                      <span class="item-filename">{{ item.music.fileName }}</span>
                    </div>
                  </div>
                  <div class="item-duration">{{ formatTime(item.music.duration) }}</div>
                  <button class="item-remove" @click.stop="removeQueueItem(item.index)" :title="$t('queue.remove')">×</button>
                </div>
              </div>
              <div v-if="queue.length === 0" class="queue-empty">{{ $t('queue.empty') }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 下半部分：播放控制区 -->
      <div class="player-footer">
        <!-- 进度条 -->
        <div class="progress-section">
          <div class="progress-bar" @click="handleSeek">
            <div class="progress-fill" :style="{ width: progressPercentage + '%' }">
              <div class="progress-thumb"></div>
            </div>
          </div>
          <div class="progress-time">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- 播放控制 -->
        <div class="controls">
          <button class="btn-control btn-secondary has-tip" @click="toggleFavorite">
            <Heart :size="20" :fill="isFavorite ? 'currentColor' : 'none'" :class="{ 'text-red-500': isFavorite }" />
            <span class="btn-tooltip">
              {{ isFavorite ? $t('music.removeFromFavorites') : $t('music.addToFavorites') }}
            </span>
          </button>

          <button class="btn-control btn-secondary" @click="previous">
            <SkipBack :size="20" />
          </button>

          <button class="btn-control btn-primary" @click="togglePlay">
            <Play v-if="!isPlaying" :size="22" :style="{ marginLeft: '2px' }" />
            <Pause v-else :size="22" />
          </button>

          <button class="btn-control btn-secondary" @click="next">
            <SkipForward :size="20" />
          </button>

          <button class="btn-control btn-secondary has-tip" @click="togglePlayMode">
            <component :is="PlayModeIcon" :size="20" />
            <span class="btn-tooltip">{{ playModeText }}</span>
          </button>

          <button class="btn-control btn-secondary has-tip" @click="toggleEqualizer">
            <Sliders :size="20" />
            <span class="btn-tooltip">{{ $t('player.equalizer') }}</span>
          </button>

          <button
            class="btn-control btn-secondary has-tip"
            @click="handleOnlineMatchLyrics"
            :disabled="!currentMusic || matchingLyrics || showLyricsPick || applyingLyricsCandidate"
          >
            <FileText :size="20" />
            <span class="btn-tooltip">
              {{ matchingLyrics ? $t('nowPlaying.matchingLyrics') : $t('nowPlaying.matchLyricsOnline') }}
            </span>
          </button>

          <div class="volume-control">
            <button class="btn-control btn-secondary" @click="toggleMute">
              <component :is="VolumeIcon" :size="20" />
            </button>
            <div class="volume-slider">
              <input
                type="range"
                min="0"
                max="100"
                v-model="volumeValue"
                @change="handleVolumeSave"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 音效面板 - 全屏居中显示 -->
    <EqualizerPanel v-model="showEqualizer" />

    <LyricsMatchSelectModal
      :show="showLyricsPick"
      :music-title="lyricsMatchTargetTitle || currentMusic?.title || ''"
      :candidates="lyricsCandidates"
      :applying="applyingLyricsCandidate"
      @close="closeLyricsPick"
      @select="onSelectLyricsCandidate"
    />

    <!-- 队列右键菜单（不含批量操作） -->
    <div
      v-if="queueContextMenu.visible && queueContextMenu.music"
      class="np-context-menu"
      :style="{ top: queueContextMenu.y + 'px', left: queueContextMenu.x + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="playFromContextMenu">
        {{ $t('music.play') }}
      </div>
      <div class="menu-item" @click="toggleFavoriteFromContextMenu">
        <Heart
          :size="16"
          :fill="queueContextMenu.isFavorite ? 'currentColor' : 'none'"
          :class="{ 'text-red-500': queueContextMenu.isFavorite }"
          class="icon"
        />
        {{ queueContextMenu.isFavorite ? $t('music.removeFromFavorites') : $t('music.addToFavorites') }}
      </div>
      <div class="menu-item" @click="openAddToPlaylistFromContextMenu">
        <Music :size="16" class="icon" />
        {{ $t('music.addToPlaylist') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="openEditTagFromContextMenu">
        <Edit :size="16" class="icon" />
        {{ $t('music.editTags') }}
      </div>
      <div class="menu-item" @click="openFileExplorerFromContextMenu">
        <FolderOpen :size="16" class="icon" />
        {{ $t('music.openInExplorer') }}
      </div>
      <div class="menu-item" @click="showDetailsFromContextMenu">
        <Info :size="16" class="icon" />
        {{ $t('music.viewDetails') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item delete" @click="removeFromContextMenu">
        <Trash2 :size="16" class="icon" />
        {{ $t('music.removeFromQueue') }}
      </div>
    </div>

    <AddToPlaylistModal
      v-model="showAddToPlaylist"
      :music-to-ad="playlistMusic"
    />
    <EditTagModal
      :show="showEditTag"
      :music="editingMusic"
      @close="showEditTag = false; editingMusic = null"
      @saved="onTagSaved"
    />
    <MusicDetailsModal
      :show="showDetailsDialog"
      :music="detailsMusic"
      @close="showDetailsDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useElementSize } from '@vueuse/core'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore, isDiscEffect } from '@/stores/settings'
import { usePlayer } from '@/composables/usePlayer'
import DefaultCover from '@/components/common/DefaultCover.vue'
import AudioEqualizerBackground from '@/components/effects/AudioEqualizerBackground.vue'
import FlameBackground from '@/components/effects/FlameBackground.vue'
import LightningBackground from '@/components/effects/LightningBackground.vue'
import VinylRecord from '@/components/effects/VinylRecord.vue'
import CDDisc from '@/components/effects/CDDisc.vue'
import Cassette from '@/components/effects/Cassette.vue'
import CassetteIcon from '@/components/effects/CassetteIcon.vue'
import { type LyricLine } from '@/utils/lrcParser'
import { getCoverUrl } from '@/utils/media'
import type { MusicItem } from '@shared/types/music'
import { Monitor, List, Heart, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, Shuffle, ArrowRight, Minimize2, Volume2, VolumeX, Sliders, Moon, Sun, Languages, AudioLines, Flame, Zap, Disc3, Disc2, FileText, Eye, EyeOff, X, Music, Edit, FolderOpen, Info, Trash2 } from 'lucide-vue-next'
import { useEqualizer } from '@/composables/useEqualizer'
import EqualizerPanel from '@/components/music/EqualizerPanel.vue'
import LyricsMatchSelectModal from '@/components/music/LyricsMatchSelectModal.vue'
import AddToPlaylistModal from '@/components/music/AddToPlaylistModal.vue'
import EditTagModal from '@/components/music/EditTagModal.vue'
import MusicDetailsModal from '@/components/music/MusicDetailsModal.vue'
import type { LyricsMatchCandidate } from '@shared/types/lyrics'

const router = useRouter()
const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const { play, pause, resume, seek, setVolume, getAudioElement } = usePlayer()
const equalizer = useEqualizer()

/** 深色/浅色：跟随全局主题，system 模式下读系统偏好 */
const systemPrefersDark = ref(
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
)

if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (e: MediaQueryListEvent) => {
    systemPrefersDark.value = e.matches
  }
  mq.addEventListener('change', onChange)
  onUnmounted(() => mq.removeEventListener('change', onChange))
}

const isLight = computed(() => {
  const t = settingsStore.theme
  if (t === 'light') return true
  if (t === 'dark') return false
  return !systemPrefersDark.value
})

/** 当前特效：由 settingsStore 持久化，重启后保持上次选择 */
const effect = computed(() => settingsStore.nowPlayingEffect)
/** 特效开关：仅作用于随音频变化的背景特效，唱片特效不受影响 */
const effectEnabled = computed(() => settingsStore.nowPlayingEffectEnabled)

const EffectIcon = computed(() => {
  if (effect.value === 'flame') return Flame
  if (effect.value === 'lightning') return Zap
  if (effect.value === 'vinyl') return Disc3
  if (effect.value === 'cd') return Disc2
  if (effect.value === 'cassette') return CassetteIcon
  return AudioLines
})

/** vinyl/cd/cassette 是纯动画封面、不接管音频，特效开关保留占位但禁用，避免顶栏按钮移位 */
const effectToggleDisabled = computed(() => isDiscEffect(effect.value))

const cycleEffect = () => {
  settingsStore.cycleNowPlayingEffect()
}

/** 用 aria-disabled 而非原生 disabled，保证 tip 仍可悬停显示 */
const onEffectToggleClick = () => {
  if (effectToggleDisabled.value) return
  settingsStore.toggleNowPlayingEffectEnabled()
}

const backgroundColor = ref('#1a1a1a')
/** 展示中的封面 URL：切歌时等新图加载完成再替换，避免 img 清空透白 */
const displayCoverUrl = ref<string | null>(null)
const lyrics = ref<LyricLine[]>([])
const currentLyricIndex = ref(-1)
const lyricsContainerRef = ref<HTMLElement | null>(null)
const queueListRef = ref<HTMLElement | null>(null)
const rightPanelMode = ref<'lyrics' | 'queue'>('lyrics') // 右侧面板模式

// 队列虚拟滚动：只渲染可视区域，逻辑与 PlayQueueDrawer.vue 保持一致
const queueItemHeight = 60
const queueScrollTop = ref(0)
const { height: queueContainerHeight } = useElementSize(queueListRef)

const handleQueueScroll = (e: Event) => {
  const target = e.target as HTMLElement
  requestAnimationFrame(() => {
    queueScrollTop.value = target.scrollTop
  })
  closeQueueContextMenu()
}

const queueTotalHeight = computed(() => queue.value.length * queueItemHeight)
const queueMaxScrollTop = computed(() => Math.max(0, queueTotalHeight.value - queueContainerHeight.value))

const visibleQueue = computed(() => {
  const buffer = 10
  const effectiveScrollTop = Math.min(queueScrollTop.value, queueMaxScrollTop.value)
  const start = Math.max(0, Math.floor(effectiveScrollTop / queueItemHeight) - buffer)
  const visibleCount = Math.ceil(queueContainerHeight.value / queueItemHeight)
  const end = Math.min(queue.value.length, start + visibleCount + buffer * 2)
  const result: { music: MusicItem; index: number }[] = []
  for (let index = start; index < end; index++) {
    result.push({ music: queue.value[index], index })
  }
  return result
})

const showEqualizer = ref(false)
const matchingLyrics = ref(false)
const showLyricsPick = ref(false)
const lyricsCandidates = ref<LyricsMatchCandidate[]>([])
const applyingLyricsCandidate = ref(false)
/** 本次匹配锁定的曲目 id，防止切歌后把候选写到新歌 */
const lyricsMatchTargetId = ref<number | null>(null)
const lyricsMatchTargetTitle = ref('')
const volumeValue = computed<number>({
  get: () => playerStore.volume,
  set: (v) => {
    const next = Math.max(0, Math.min(100, Number(v)))
    playerStore.volume = next
    setVolume(next)
  }
})

// 计算属性
const currentMusic = computed(() => playerStore.currentMusic)
const isPlaying = computed(() => playerStore.isPlaying)
const currentTime = computed(() => playerStore.currentTime)
const duration = computed(() => playerStore.duration)
const playMode = computed(() => playerStore.playMode)

const progressPercentage = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const PlayModeIcon = computed(() => {
  const mode = playMode.value
  if (mode === 'random') return Shuffle
  if (mode === 'repeat') return Repeat
  if (mode === 'single') return Repeat1
  if (mode === 'sequential') return ArrowRight
  return ArrowRight
})

const playModeText = computed(() => {
  const texts = {
    sequential: t('player.sequential'),
    random: t('player.shuffle'),
    repeat: t('player.repeatAll'),
    single: t('player.repeat'),
  }
  return texts[playMode.value]
})

const VolumeIcon = computed(() => {
  return volumeValue.value === 0 ? VolumeX : Volume2
})

const backgroundStyle = computed(() => {
  // 拆开写：避免 background 简写冲掉 background-color 兜底
  const base = isLight.value ? '#fafbfc' : '#0a0a0a'
  return {
    backgroundColor: base,
    backgroundImage: `linear-gradient(135deg, ${backgroundColor.value} 0%, ${base} 100%)`,
  }
})

const onCoverError = () => {
  displayCoverUrl.value = null
}

/** 无封面可取色时的背景主色 */
const fallbackBackgroundColor = () => (isLight.value ? '#eef1f5' : '#1a1a1a')

/**
 * 从封面取色并写入背景主色。
 * 切歌与切主题是两条并发的异步链，用一个共用的递增序号保证只有最新一次能写回，
 * 否则慢的那次返回后会把背景改成上一首歌（或上一个主题）的颜色
 */
let colorRequestId = 0
const applyCoverColor = async (coverUrl: string | null) => {
  const id = ++colorRequestId
  if (!coverUrl) {
    backgroundColor.value = fallbackBackgroundColor()
    return
  }
  const color = await extractAverageColor(coverUrl)
  if (id !== colorRequestId) return
  backgroundColor.value = color ?? fallbackBackgroundColor()
}

const queue = computed(() => playerStore.queue)
const currentQueueIndex = computed(() => playerStore.currentQueueIndex)

const isFavorite = ref(false)

// 方法
const goBack = () => {
  router.back()
}

const togglePlay = async () => {
  if (isPlaying.value) {
    pause()
    return
  }

  if (currentMusic.value) {
    // 启动后首次播放：可能还没有创建/绑定音频实例，此时 resume() 不会生效
    const audioElement = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
    const hasValidAudioInstance = !!(
      audioElement &&
      audioElement.parentElement && // 确保在 DOM 中
      audioElement.src &&
      audioElement.src.length > 0
    )

    if (hasValidAudioInstance) {
      resume()
      return
    }

    await play(currentMusic.value)
    return
  }

  // 没有 currentMusic，但队列存在时尝试从队列当前索引播放
  if (playerStore.queue.length > 0 && playerStore.currentQueueIndex >= 0) {
    await play(playerStore.queue[playerStore.currentQueueIndex])
  }
}

const previous = async () => {
  const prev = playerStore.getPrevious()
  if (prev) {
    if (prev.index >= 0) playerStore.setCurrentQueueIndex(prev.index)
    await play(prev.music)
  }
}

const next = async () => {
  const nextMusic = playerStore.getNext()
  if (nextMusic) {
    if (nextMusic.index >= 0) playerStore.setCurrentQueueIndex(nextMusic.index)
    await play(nextMusic.music)
  }
}

const togglePlayMode = () => {
  playerStore.togglePlayMode()
}

const toggleFavorite = async () => {
  if (currentMusic.value) {
    // 先本地立即切换，提升响应速度
    isFavorite.value = !isFavorite.value
    // 再以数据库结果为准回填（toggleFavorite 直接返回最新状态，避免二次查询）
    isFavorite.value = await window.electronAPI.toggleFavorite(currentMusic.value.id)
    // 通知其他组件更新收藏状态
    window.dispatchEvent(new Event('favorites-updated'))
  }
}

const toggleQueue = () => {
  // 在NowPlayingView中，切换右侧面板显示队列
  closeQueueContextMenu()
  rightPanelMode.value = rightPanelMode.value === 'queue' ? 'lyrics' : 'queue'
}

const playQueueItem = async (index: number) => {
  playerStore.setCurrentQueueIndex(index)
  await play(queue.value[index])
}

const removeQueueItem = (index: number) => {
  playerStore.removeFromQueue(index)
}

// —— 队列右键菜单（不含批量操作） ——
const queueContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  music: null as MusicItem | null,
  index: -1,
  isFavorite: false
})
const showAddToPlaylist = ref(false)
const playlistMusic = ref<MusicItem | null>(null)
const showEditTag = ref(false)
const editingMusic = ref<MusicItem | null>(null)
const showDetailsDialog = ref(false)
const detailsMusic = ref<MusicItem | null>(null)

const closeQueueContextMenu = () => {
  queueContextMenu.visible = false
}

const adjustQueueContextMenuPosition = () => {
  if (!queueContextMenu.visible) return
  const menuElement = document.querySelector('.np-context-menu') as HTMLElement | null
  if (!menuElement) return

  const menuRect = menuElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = menuRect.width || 200
  const menuHeight = menuRect.height || 280

  let adjustedX = queueContextMenu.x
  let adjustedY = queueContextMenu.y
  if (adjustedX + menuWidth > viewportWidth) adjustedX = viewportWidth - menuWidth - 10
  if (adjustedX < 0) adjustedX = 10
  if (adjustedY + menuHeight > viewportHeight) adjustedY = viewportHeight - menuHeight - 10
  if (adjustedY < 0) adjustedY = 10

  queueContextMenu.x = adjustedX
  queueContextMenu.y = adjustedY
}

const showQueueContextMenu = async (event: MouseEvent, music: MusicItem, index: number) => {
  event.stopPropagation()
  const targetId = music.id
  queueContextMenu.music = music
  queueContextMenu.index = index
  queueContextMenu.visible = true
  queueContextMenu.x = event.clientX
  queueContextMenu.y = event.clientY
  queueContextMenu.isFavorite = !!music.favorite
  try {
    const fav = await window.electronAPI.isFileFavorite(targetId)
    // 快速连开另一项时，丢弃过期结果
    if (queueContextMenu.music?.id !== targetId) return
    queueContextMenu.isFavorite = fav
  } catch {
    if (queueContextMenu.music?.id === targetId) {
      queueContextMenu.isFavorite = !!music.favorite
    }
  }
  if (queueContextMenu.music?.id !== targetId) return
  await nextTick()
  adjustQueueContextMenuPosition()
}

const playFromContextMenu = async () => {
  const music = queueContextMenu.music
  closeQueueContextMenu()
  if (!music) return
  const index = queue.value.findIndex(m => m.id === music.id)
  if (index >= 0) await playQueueItem(index)
}

const toggleFavoriteFromContextMenu = async () => {
  const music = queueContextMenu.music
  if (!music) return
  const targetId = music.id
  const next = !queueContextMenu.isFavorite
  queueContextMenu.isFavorite = next
  try {
    const latest = await window.electronAPI.toggleFavorite(targetId)
    if (queueContextMenu.music?.id === targetId) {
      queueContextMenu.isFavorite = latest
    }
    music.favorite = latest
    if (currentMusic.value?.id === targetId) {
      isFavorite.value = latest
    }
    window.dispatchEvent(new Event('favorites-updated'))
  } catch (e) {
    if (queueContextMenu.music?.id === targetId) {
      queueContextMenu.isFavorite = !next
    }
    console.error('切换收藏失败', e)
  }
  closeQueueContextMenu()
}

const openAddToPlaylistFromContextMenu = () => {
  playlistMusic.value = queueContextMenu.music
  showAddToPlaylist.value = true
  closeQueueContextMenu()
}

const openEditTagFromContextMenu = () => {
  editingMusic.value = queueContextMenu.music
  showEditTag.value = true
  closeQueueContextMenu()
}

const openFileExplorerFromContextMenu = () => {
  const music = queueContextMenu.music
  closeQueueContextMenu()
  if (music) window.electronAPI.openInFileExplorer(music.filePath)
}

const showDetailsFromContextMenu = () => {
  detailsMusic.value = queueContextMenu.music
  showDetailsDialog.value = true
  closeQueueContextMenu()
}

const removeFromContextMenu = () => {
  const music = queueContextMenu.music
  closeQueueContextMenu()
  if (!music) return
  // 按 id 查找，避免菜单打开后队列变动导致下标过期删错歌
  const index = queue.value.findIndex(m => m.id === music.id)
  if (index >= 0) removeQueueItem(index)
}

const onTagSaved = () => {
  // EditTagModal 已派发 music-metadata-updated，playerStore 会同步当前曲/队列项
  showEditTag.value = false
  editingMusic.value = null
}

const toggleMiniMode = async () => {
  // 保存当前路由路径，以便退出Mini模式时恢复
  localStorage.setItem('lastRoute', router.currentRoute.value.fullPath)
  await window.electronAPI.setMiniMode(true)
  router.replace('/mini')
}

/** Windows / Linux 无边框窗口：全屏页右上角需自绘窗口控件 */
const isMac = ref(navigator.userAgent.includes('Mac'))

const minimizeWindow = () => {
  window.electronAPI.minimizeWindow()
}

const maximizeWindow = () => {
  window.electronAPI.maximizeWindow()
}

const closeWindow = () => {
  window.electronAPI.closeWindow()
}

/** 与主界面顶栏同一套逻辑：在 light/dark 间切换并同步窗口外观 */
const toggleTheme = async () => {
  const next = isLight.value ? 'dark' : 'light'
  settingsStore.setTheme(next)
  await window.electronAPI.saveSettings({ theme: next })
  await window.electronAPI.setWindowTheme(next)
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: next }))
}

const toggleLanguage = () => {
  const newLang = settingsStore.language === 'zh' ? 'en' : 'zh'
  settingsStore.setLanguage(newLang)
}

const toggleDesktopLyrics = async () => {
  await window.electronAPI.toggleDesktopLyrics()
}

const toggleEqualizer = () => {
  showEqualizer.value = !showEqualizer.value
}

const toggleMute = () => {
  if (volumeValue.value > 0) {
    volumeValue.value = 0
  } else {
    volumeValue.value = 80
  }
}

const handleVolumeSave = async () => {
  await playerStore.saveState()
}

const scrollToCurrentQueueItem = () => {
  if (!queueListRef.value || currentQueueIndex.value < 0) return

  // 虚拟滚动下命中的行未必在 DOM 里，直接按下标算目标 scrollTop 居中显示（与 PlayQueueDrawer.vue 一致）
  const targetTop = currentQueueIndex.value * queueItemHeight - queueListRef.value.clientHeight / 2 + queueItemHeight / 2
  queueListRef.value.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
}



const handleSeek = (e: MouseEvent) => {
  if (!duration.value) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percentage = x / rect.width
  const time = percentage * duration.value
  seek(time)
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}



/**
 * 根据封面图提取平均色，用于背景与特效随歌曲变化
 * - 取 32x32 缩略图计算，成本低
 * - 深色主题压暗（避免亮封面「白屏闪一下」），浅色主题提亮成柔和淡彩
 * - 失败时返回 null
 */
const extractAverageColor = async (src: string): Promise<string | null> => {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('封面加载失败'))
      img.src = src
    })

    const canvas = document.createElement('canvas')
    const size = 32
    canvas.width = size
    canvas.height = size
    const c = canvas.getContext('2d', { willReadFrequently: true })
    if (!c) return null
    c.drawImage(img, 0, 0, size, size)
    const { data } = c.getImageData(0, 0, size, size)

    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      // 忽略透明像素
      if (a < 16) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
    if (count === 0) return null
    r = Math.round(r / count)
    g = Math.round(g / count)
    b = Math.round(b / count)
    return isLight.value
      ? lightenColorForBackground(r, g, b)
      : darkenColorForBackground(r, g, b)
  } catch {
    return null
  }
}

/** 将封面主色压到深色区间，保证全屏背景不会接近白色 */
const darkenColorForBackground = (r: number, g: number, b: number): string => {
  // 相对亮度（0~1）
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  // 目标亮度约 0.18，过亮则整体按比例压暗
  const targetLuma = 0.18
  if (luminance > targetLuma && luminance > 0) {
    const scale = targetLuma / luminance
    r = Math.round(r * scale)
    g = Math.round(g * scale)
    b = Math.round(b * scale)
  }
  // 再限制单通道上限，避免某一通道过亮
  const maxChannel = Math.max(r, g, b)
  if (maxChannel > 96) {
    const s = 96 / maxChannel
    r = Math.round(r * s)
    g = Math.round(g * s)
    b = Math.round(b * s)
  }
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * 将封面主色提亮成柔和淡彩，用于浅色主题背景
 * 保留封面的色相倾向，但整体拉到接近白的高亮度区间，
 * 这样深色文字始终有足够对比度，也不会出现刺眼的高饱和大色块
 */
const lightenColorForBackground = (r: number, g: number, b: number): string => {
  // 往白色混合（保留约 22% 原色），得到淡彩底色
  const mixWithWhite = (v: number) => Math.round(255 - (255 - v) * 0.22)
  r = mixWithWhite(r)
  g = mixWithWhite(g)
  b = mixWithWhite(b)

  // 保证足够亮：亮度不足时继续往白靠
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const targetLuma = 0.88
  if (luminance < targetLuma) {
    const lift = (targetLuma - luminance) * 255
    r = Math.min(255, Math.round(r + lift))
    g = Math.min(255, Math.round(g + lift))
    b = Math.min(255, Math.round(b + lift))
  }
  return `rgb(${r}, ${g}, ${b})`
}

// 歌词逻辑
const loadLyrics = async () => {
  lyrics.value = []
  currentLyricIndex.value = -1

  if (!currentMusic.value) return

  try {
    // 尝试获取歌词
    // 优先查找同名 lrc 文件
    const lyricsData = await window.electronAPI.loadLyrics(currentMusic.value.id)
    if (lyricsData && lyricsData.lines) {
      lyrics.value = lyricsData.lines
    } else {
      lyrics.value = [{ time: 0, text: t('nowPlaying.noLyrics') }]
    }
  } catch (error) {
    console.error('Failed to load lyrics:', error)
    lyrics.value = [{ time: 0, text: t('nowPlaying.lyricsLoadError') }]
  }
}

/** 应用匹配结果后刷新歌词面板与当前曲元数据 */
const afterLyricsMatched = async (targetMusicId: number, lyricsPath?: string) => {
  if (currentMusic.value?.id === targetMusicId && lyricsPath) {
    currentMusic.value.lyricsPath = lyricsPath
  }
  if (currentMusic.value?.id === targetMusicId) {
    await loadLyrics()
    rightPanelMode.value = 'lyrics'
    // loadLyrics 会把高亮置 -1；若本来就在歌词面板则 watch 不触发，需按进度重新对齐
    syncLyricIndex(currentTime.value, true)
  }
}

const closeLyricsPick = () => {
  showLyricsPick.value = false
  lyricsCandidates.value = []
  lyricsMatchTargetId.value = null
  lyricsMatchTargetTitle.value = ''
}

const applyLyricsSongId = async (songId: number, targetMusicId: number, targetTitle: string) => {
  // 切歌后丢弃过期候选，避免写错曲目
  if (currentMusic.value?.id !== targetMusicId) {
    closeLyricsPick()
    return
  }
  applyingLyricsCandidate.value = true
  try {
    const result = await window.electronAPI.applyLyricsCandidate(targetMusicId, songId)
    if (currentMusic.value?.id !== targetMusicId) {
      closeLyricsPick()
      return
    }
    if (result.status === 'matched') {
      closeLyricsPick()
      await afterLyricsMatched(targetMusicId, result.lyricsPath)
    } else if (result.status === 'skipped_instrumental') {
      alert(t('music.matchLyricsInstrumental', { title: targetTitle }))
    } else {
      alert(t('music.matchLyricsFailed', {
        title: targetTitle,
        reason: result.message || ''
      }))
    }
  } catch (error: any) {
    alert(t('music.matchLyricsFailed', {
      title: targetTitle,
      reason: error?.message || error
    }))
  } finally {
    applyingLyricsCandidate.value = false
  }
}

const onSelectLyricsCandidate = async (songId: number) => {
  const id = lyricsMatchTargetId.value
  const title = lyricsMatchTargetTitle.value
  if (id == null) return
  await applyLyricsSongId(songId, id, title)
}

/**
 * 全屏播放控制栏：在线匹配歌词
 * - 已有歌词先确认是否替换
 * - 多条候选弹出选择对话框；仅一条则直接应用
 */
const handleOnlineMatchLyrics = async () => {
  if (
    !currentMusic.value ||
    matchingLyrics.value ||
    showLyricsPick.value ||
    applyingLyricsCandidate.value
  ) return

  const targetId = currentMusic.value.id
  const targetTitle = currentMusic.value.title
  lyricsMatchTargetId.value = targetId
  lyricsMatchTargetTitle.value = targetTitle
  matchingLyrics.value = true

  try {
    const { hasExistingLyrics, candidates } = await window.electronAPI.searchLyricsCandidates(targetId)

    // 搜索返回后若已切歌，放弃本次结果
    if (currentMusic.value?.id !== targetId) {
      closeLyricsPick()
      return
    }

    if (!candidates.length) {
      alert(t('nowPlaying.noLyricsCandidates'))
      return
    }

    if (hasExistingLyrics) {
      const ok = confirm(t('nowPlaying.replaceLyricsConfirm', { title: targetTitle }))
      if (!ok || currentMusic.value?.id !== targetId) {
        closeLyricsPick()
        return
      }
    }

    if (candidates.length === 1) {
      await applyLyricsSongId(candidates[0].songId, targetId, targetTitle)
      return
    }

    lyricsCandidates.value = candidates
    showLyricsPick.value = true
  } catch (error: any) {
    alert(t('music.matchLyricsFailed', {
      title: targetTitle,
      reason: error?.message || error
    }))
    closeLyricsPick()
  } finally {
    matchingLyrics.value = false
  }
}

const scrollToCurrentLyric = (instant = false) => {
  // 隐藏面板时 scrollIntoView 无效/错位，只在歌词面板可见时滚动
  if (rightPanelMode.value !== 'lyrics') return
  if (!lyricsContainerRef.value || currentLyricIndex.value < 0) return

  const activeLine = lyricsContainerRef.value.children[currentLyricIndex.value] as HTMLElement
  if (activeLine) {
    activeLine.scrollIntoView({
      behavior: instant ? 'instant' : 'smooth',
      block: 'center'
    })
  }
}

/** 按播放进度同步高亮行；forceScroll 用于从队列切回歌词时强制滚到可见区 */
const syncLyricIndex = (time: number, forceScroll = false) => {
  if (lyrics.value.length === 0) return

  let index = lyrics.value.findIndex(line => line.time > time)
  if (index === -1) {
    index = lyrics.value.length - 1
  } else {
    index = Math.max(0, index - 1)
  }

  const changed = index !== currentLyricIndex.value
  if (changed) currentLyricIndex.value = index

  if ((changed || forceScroll) && rightPanelMode.value === 'lyrics') {
    nextTick(() => {
      requestAnimationFrame(() => scrollToCurrentLyric(forceScroll))
    })
  }
}

// 监听当前音乐变化
watch(currentMusic, async (music, prev, onCleanup) => {
  // 切歌时关闭未完成的歌词选择，防止把候选写到新曲
  if (prev && music && prev.id !== music.id) {
    if (showLyricsPick.value || lyricsMatchTargetId.value != null) {
      closeLyricsPick()
    }
  }

  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })

  if (music) {
    isFavorite.value = await window.electronAPI.isFileFavorite(music.id)
    if (cancelled) return
    await loadLyrics()
    if (cancelled) return
    // 切歌/重载后若进度未变（暂停），currentTime watch 不会补高亮
    syncLyricIndex(currentTime.value, true)
    if (cancelled) return

    if (music.coverPath) {
      const coverUrl = getCoverUrl(music.coverPath)
      // 先预加载封面，完成后再替换展示，避免 src 切换时空图闪白
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = coverUrl
      })
      if (cancelled) return
      displayCoverUrl.value = coverUrl

      await applyCoverColor(coverUrl)
    } else {
      displayCoverUrl.value = null
      await applyCoverColor(null)
    }
  } else {
    isFavorite.value = false
    displayCoverUrl.value = null
    await applyCoverColor(null)
  }
}, { immediate: true })

// 切换主题时重算背景主色：深色要压暗、浅色要提亮，不能沿用上一主题的结果
watch(isLight, () => {
  applyCoverColor(displayCoverUrl.value)
})

// 频谱/火焰/闪电可视化需要 Web Audio；音效开启时也必须接管滤波链（与特效开关独立）
watch(
  [isPlaying, effect, effectEnabled, () => equalizer.enabled.value],
  ([playing], prev) => {
    const wantFx = settingsStore.shouldCaptureNowPlayingAudio()
    const wantEq = equalizer.enabled.value
    if (playing && (wantFx || wantEq)) {
      if (wantEq) {
        equalizer.ensureCapturedForEq()
      } else {
        const el = getAudioElement() ?? (document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null)
        if (el) equalizer.initAudioContext(el)
      }
      return
    }
    // EQ 从开→关由 toggle → releaseCapture → restore 负责；此处再派发会造成双重重建（断音/进度跳）
    const prevEqEnabled = Array.isArray(prev) ? prev[3] : undefined
    if (prevEqEnabled === true && wantEq === false) {
      return
    }
    // 特效不再需要频谱且 EQ 也未开：释放此前为可视化接管的 Web Audio
    if (!wantFx && !wantEq && equalizer.isCaptured()) {
      window.dispatchEvent(new CustomEvent('xmmusic:restore-native-audio'))
    }
  },
  { immediate: true }
)

// 离开全屏页：无可视化消费者时释放仅为频谱挂上的 Web Audio（EQ 开着则保留）
const onQueueContextMenuKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && queueContextMenu.visible) {
    closeQueueContextMenu()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onQueueContextMenuKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onQueueContextMenuKeydown)
  if (!equalizer.enabled.value && equalizer.isCaptured()) {
    window.dispatchEvent(new CustomEvent('xmmusic:restore-native-audio'))
  }
})

// 监听播放进度更新歌词
watch(currentTime, (time) => {
  syncLyricIndex(time)
})

// 监听当前队列索引变化，自动滚动到当前播放的歌曲
watch(currentQueueIndex, () => {
  if (rightPanelMode.value === 'queue') {
    // 延迟一下确保 DOM 已更新
    setTimeout(() => {
      scrollToCurrentQueueItem()
    }, 100)
  }
})

// 切换到队列 → 滚到当前曲；切回歌词 → 按当前进度对齐并滚到可见区
watch(rightPanelMode, (mode) => {
  closeQueueContextMenu()
  if (mode === 'queue') {
    setTimeout(() => {
      scrollToCurrentQueueItem()
    }, 100)
  } else if (mode === 'lyrics') {
    syncLyricIndex(currentTime.value, true)
  }
})

// 监听播放器音量变化，同步到实际播放器
watch(
  () => playerStore.volume,
  (v) => {
    setVolume(v)
  },
  { immediate: true }
)
</script>

<style scoped>
.now-playing-view {
  /* 全屏播放页的局部配色令牌：深色为默认，.is-light 整组覆盖。
     背景是随封面变化的渐变 + canvas 特效，无法直接套用全局变量，
     因此这里单独定义一套，保证两种主题下文字与控件都有足够对比度 */
  /* 文字层级：因为要压在高对比的频谱特效上，即使是次要文字也必须足够「实」，
     不能像普通页面那样用低不透明度的灰 —— 层级差靠这几档 + 字号/字重体现 */
  --np-fg: #ffffff;
  --np-fg-2: rgba(255, 255, 255, 0.96);
  --np-fg-3: rgba(255, 255, 255, 0.88);
  --np-fg-4: rgba(255, 255, 255, 0.8);
  --np-fg-5: rgba(255, 255, 255, 0.62);
  --np-hover: rgba(255, 255, 255, 0.1);
  --np-hover-soft: rgba(255, 255, 255, 0.05);
  --np-border: rgba(255, 255, 255, 0.1);
  --np-track: rgba(255, 255, 255, 0.2);
  --np-scroll-thumb: rgba(255, 255, 255, 0.2);
  --np-scroll-thumb-hover: rgba(255, 255, 255, 0.3);
  /* 进度条 / 滑块的填充色 */
  --np-fill: #ffffff;
  /* 文字描边色：深色主题用黑描边，浅色主题用白描边 */
  --np-outline: rgba(0, 0, 0, 0.9);
  --np-outline-glow: rgba(0, 0, 0, 0.75);
  /* 八向描边 + 外发光：四向描边挡不住对角线方向的背景，
     所有压在频谱特效上的文字（歌名/歌词/队列/时间）统一用这一套 */
  --np-text-outline:
    -1px -1px 0 var(--np-outline),
    1px -1px 0 var(--np-outline),
    -1px 1px 0 var(--np-outline),
    1px 1px 0 var(--np-outline),
    0 -1px 0 var(--np-outline),
    0 1px 0 var(--np-outline),
    -1px 0 0 var(--np-outline),
    1px 0 0 var(--np-outline),
    0 0 4px var(--np-outline-glow);

  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xl) 0;
  color: var(--np-fg);
  /* 兜底色：正常情况下会被内联的 backgroundStyle 覆盖，
     仅在内联样式还没应用的那一帧防止露出相反主题的底色 */
  background-color: #0a0a0a;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  isolation: isolate; /* 确保背景层不会影响内部堆叠 */
}

.now-playing-view.is-light {
  --np-fg: #14161a;
  --np-fg-2: rgba(20, 22, 26, 0.96);
  --np-fg-3: rgba(20, 22, 26, 0.88);
  --np-fg-4: rgba(20, 22, 26, 0.8);
  --np-fg-5: rgba(20, 22, 26, 0.62);
  --np-hover: rgba(20, 22, 26, 0.07);
  --np-hover-soft: rgba(20, 22, 26, 0.04);
  --np-border: rgba(20, 22, 26, 0.1);
  --np-track: rgba(20, 22, 26, 0.14);
  --np-scroll-thumb: rgba(20, 22, 26, 0.18);
  --np-scroll-thumb-hover: rgba(20, 22, 26, 0.28);
  /* 浅色下白色填充不可见，改用主色 */
  --np-fill: var(--color-primary);
  --np-outline: rgba(255, 255, 255, 0.95);
  --np-outline-glow: rgba(255, 255, 255, 0.85);

  background-color: #fafbfc;
}

.background-effects {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xl);
  padding: 0 var(--spacing-xl);
  -webkit-app-region: drag;
  position: relative;
  /* 高于内容区，避免 tip 被下层盖住；勿用 overflow 裁切 tip */
  z-index: 20;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: visible;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: none;
  border: none;
  color: var(--np-fg);
  font-size: var(--font-size-lg);
  cursor: pointer;
  padding: var(--spacing-sm);
  border-radius: var(--radius-base);
  transition: background var(--transition-base);
  -webkit-app-region: no-drag;
}

.btn-back:hover {
  background: var(--np-hover);
}

.actions {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  -webkit-app-region: no-drag;
}

.window-controls {
  display: flex;
  align-items: center;
  margin-left: var(--spacing-sm);
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--np-fg);
  font-size: var(--font-size-base);
  transition: background var(--transition-fast) var(--transition-timing);
  position: relative;
}

.win-btn:hover {
  background: var(--np-hover);
}

.win-btn.close:hover {
  background: #e81123;
  color: white;
}

.win-btn[data-tip]::before {
  content: attr(data-tip);
  position: absolute;
  /* 顶栏贴顶：tip 向下展开，避免被页面 overflow 裁掉 */
  top: calc(100% + 6px);
  bottom: auto;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--tooltip-bg);
  color: var(--tooltip-fg);
  font-size: var(--font-size-xs);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--tooltip-border);
  z-index: 1000;
}

.win-btn[data-tip]:hover::before {
  opacity: 1;
  transition: opacity 0.12s ease 1s;
}

.btn-action {
  background: none;
  border: none;
  color: var(--np-fg);
  font-size: var(--font-size-xl);
  cursor: pointer;
  padding: var(--spacing-sm);
  border-radius: var(--radius-base);
  transition: background var(--transition-base);
  -webkit-app-region: no-drag;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.btn-action:hover {
  background: var(--np-hover);
}

.btn-action.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-action.is-disabled:hover {
  background: none;
}

/* 自定义 tip：悬停约 1s 显示，移开约 0.15s 消失；颜色随主题 */
.btn-tooltip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: var(--tooltip-bg);
  color: var(--tooltip-fg);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--tooltip-border);
  z-index: 1000;
}

/* 顶栏按钮：tip 显示在下方（上方会被全屏页 overflow 裁切） */
.top-bar .btn-tooltip {
  top: calc(100% + 8px);
  bottom: auto;
}

.top-bar .btn-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  top: auto;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-bottom-color: var(--tooltip-bg);
}

/* 底栏控制：tip 显示在上方 */
.player-footer .btn-tooltip {
  bottom: calc(100% + 8px);
  top: auto;
}

.player-footer .btn-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  bottom: auto;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--tooltip-bg);
}

.btn-action:hover .btn-tooltip,
.btn-control.has-tip:hover .btn-tooltip {
  opacity: 1;
  transition: opacity 0.12s ease 1s;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  min-height: 0;
  gap: var(--spacing-2xl);
  position: relative;
  z-index: 1;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* 上半部分 - 左右对半：封面+标题 | 歌词/队列 */
.main-area {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-3xl);
  min-height: 0;
  overflow: hidden;
  min-width: 0;
  align-items: stretch;
}

/* 唱片唱臂可能略超出左栏，父级也要放开，否则仍会被裁切 */
.main-area.is-vinyl {
  overflow: visible;
}

/* 左侧面板 - 封面和歌曲信息 */
.left-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xl);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 仅唱片特效放开裁切，避免唱臂被切；频谱/火焰/闪电保持 hidden 防溢出 */
.left-panel.is-vinyl {
  overflow: visible;
}

.album-cover-container {
  width: 100%;
  max-width: min(100%, 360px);
  /* 占满标题上方剩余高度，让封面在矮窗口里等比缩小，而不是被裁底 */
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* 以容器宽高较小边作为封面边长，避免 width:100% 压不住 max-height 时裁底 */
  container-type: size;
  container-name: album-cover;
}

.left-panel.is-vinyl .album-cover-container {
  overflow: visible;
}

.album-cover {
  /* 取容器宽、高中的较小值，始终保持正方形且完整可见 */
  width: min(100%, 100cqh);
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
  height: auto;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: none;
  position: relative;
  margin: 0 auto;
  flex-shrink: 0;
  /* 不透明底，避免圆角抗锯齿透出背景形成浅色晕边 */
  background: #ffffff;
}

/* 唱片/CD 跟容器较小边缩放；磁带为横向 1.57 比例，按高度反推宽度 */
.album-cover-container :deep(.vinyl),
.album-cover-container :deep(.cd-disc) {
  width: min(100%, 100cqh);
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
  height: auto;
}

.album-cover-container :deep(.cassette) {
  width: min(100%, calc(100cqh * 1.57));
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1.57;
  height: auto;
}

.now-playing-view.is-light .album-cover {
  background: #ffffff;
}

.now-playing-view:not(.is-light) .album-cover {
  /* 深色下默认封面外沿是白边，底用白才能衔接；真实封面会铺满盖住 */
  background: #ffffff;
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: relative;
  z-index: 1;
  /* img 是独立合成层，父级圆角 overflow:hidden 裁不住它的方角（浅色下露出灰角），自身圆角兜底 */
  border-radius: inherit;
}

.fallback-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  border-radius: inherit;
}

.song-info {
  text-align: center;
  width: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

/* 描边效果：让文字在流动的背景特效上始终清晰
   深色主题用黑描边、浅色主题用白描边（见 --np-outline） */
.song-title,
.song-artist,
.song-album {
  text-shadow: var(--np-text-outline);
}

.song-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
  color: var(--np-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: var(--font-size-base);
  color: var(--np-fg-2);
  margin-bottom: var(--spacing-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-album {
  font-size: var(--font-size-sm);
  color: var(--np-fg-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 专辑名可能为空，用不可见占位保留一行高度，避免封面区域可用高度随歌曲跳变 */
.song-album.is-empty {
  visibility: hidden;
}

/* 右侧面板 - 歌词/队列 */
.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  gap: var(--spacing-md);
}

/* 面板切换标签 */
.panel-tabs {
  display: flex;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--np-border);
  overflow-x: hidden;
  flex-wrap: nowrap;
}

.panel-tab {
  background: none;
  border: none;
  color: var(--np-fg-3);
  font-size: var(--font-size-base);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  border-radius: var(--radius-base);
  transition: all var(--transition-base);
  white-space: nowrap;
  flex-shrink: 0;
}

.panel-tab:hover {
  color: var(--np-fg-2);
  background: var(--np-hover-soft);
}

.panel-tab.active {
  color: var(--np-fg);
  background: var(--np-hover);
  font-weight: 600;
}

/* 歌词面板 */
.lyrics-panel {
  height: 100%;
  overflow: hidden;
  position: relative;
  flex: 1;
}

.lyrics-container {
  height: 100%;
  overflow-y: auto;
  padding: 50% 0;
  text-align: center;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.lyrics-container::-webkit-scrollbar {
  display: none;
}

.lyrics-line {
  font-size: var(--font-size-xl);
  color: var(--np-fg-4);
  margin: var(--spacing-xl) 0;
  transition: all var(--transition-base);
  cursor: pointer;
  min-height: 1.5em;
  padding: 0 var(--spacing-lg);
  text-shadow: var(--np-text-outline);
}

.lyrics-line:hover {
  color: var(--np-fg-2);
}

.lyrics-line.active {
  font-size: var(--font-size-3xl);
  color: var(--np-fg);
  font-weight: 700;
  transform: scale(1.05);
  /* 当前行字号大、更突出，描边之外再加一层扩散提升可读性 */
  text-shadow: var(--np-text-outline), 0 0 6px var(--np-outline-glow);
}

.lyrics-line.empty {
  color: var(--np-fg-5);
}

/* 队列面板 */
.queue-panel {
  flex: 1;
  overflow: hidden;
}

.queue-list {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--np-scroll-thumb) transparent;
}

.queue-list::-webkit-scrollbar {
  width: 6px;
}

.queue-list::-webkit-scrollbar-track {
  background: transparent;
}

.queue-list::-webkit-scrollbar-thumb {
  background: var(--np-scroll-thumb);
  border-radius: 3px;
}

.queue-list::-webkit-scrollbar-thumb:hover {
  background: var(--np-scroll-thumb-hover);
}

.queue-list-inner {
  position: relative;
}

.queue-item {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-base);
  cursor: pointer;
  transition: background var(--transition-base);
  /* 队列文字同样压在频谱特效上，统一加描边 */
  text-shadow: var(--np-text-outline);
}

.queue-item:hover {
  background: var(--np-hover-soft);
}

.queue-item.active {
  background: var(--np-hover);
}

.queue-item .item-index {
  width: 24px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--np-fg-4);
  flex-shrink: 0;
}

.queue-item.active .item-index {
  color: var(--np-fg);
}

.queue-item .playing-icon {
  color: var(--np-fg);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.queue-item .item-info {
  flex: 1;
  min-width: 0;
}

.queue-item .item-title {
  font-size: var(--font-size-sm);
  color: var(--np-fg-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.queue-item.active .item-title {
  color: var(--np-fg);
  font-weight: 600;
}

.queue-item .item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--np-fg-4);
  overflow: hidden;
}

.queue-item .item-artist,
.queue-item .item-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item .item-artist {
  flex-shrink: 1;
}

.queue-item .item-filename {
  flex-shrink: 2;
}

.queue-item .item-sep {
  flex-shrink: 0;
}

.queue-item .item-duration {
  font-size: var(--font-size-xs);
  color: var(--np-fg-4);
  flex-shrink: 0;
}

.queue-item .item-remove {
  opacity: 0;
  background: none;
  border: none;
  color: var(--np-fg-4);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  transition: all var(--transition-base);
  flex-shrink: 0;
}

.queue-item:hover .item-remove {
  opacity: 1;
}

.queue-item .item-remove:hover {
  color: var(--np-fg);
}

.queue-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--np-fg-5);
  font-size: var(--font-size-base);
  text-shadow: var(--np-text-outline);
}

/* 队列右键菜单：用全局 elevated 底，保证深/浅主题可读；z-index 高于全屏页 */
.np-context-menu {
  position: fixed;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs);
  min-width: 180px;
  z-index: calc(var(--z-modal) + 10);
  color: var(--text-color);
}

.np-context-menu .menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: var(--spacing-xs) 0;
}

.np-context-menu .menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  transition: background var(--transition-fast);
}

.np-context-menu .menu-item .icon {
  flex-shrink: 0;
}

.np-context-menu .menu-item:hover {
  background: var(--hover-bg);
}

.np-context-menu .menu-item.delete {
  color: var(--color-danger, #ef4444);
}

/* 底部播放控制区 */
.player-footer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) 0;
  width: 100%;
  max-width: 100%;
  /* 允许 tip 向上溢出，勿用 overflow-x:hidden（会连带裁掉纵向） */
  overflow: visible;
  box-sizing: border-box;
  position: relative;
  z-index: 20;
}

.progress-section {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.progress-bar {
  height: 4px;
  background: var(--np-track);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
  /* 左右/上方留出 6px：拖动按钮比轨道大，否则会被外层的 overflow 裁掉 */
  margin: 6px 6px var(--spacing-xs);
}

.progress-fill {
  height: 100%;
  background: var(--np-fill);
  border-radius: 2px;
  position: relative;
}

.progress-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  /* 白底 + 主色描边：深色与浅色主题下都能看清 */
  background: #ffffff;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.progress-bar:hover .progress-thumb {
  opacity: 1;
}

.progress-time {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--np-fg-3);
  /* 与进度条左右对齐（进度条有 6px 外边距） */
  padding: 0 6px;
  text-shadow: var(--np-text-outline);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  box-sizing: border-box;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-left: var(--spacing-md);
  height: 44px; /* 与播放按钮高度一致，确保垂直居中 */
}

.volume-slider {
  width: 100px;
  height: 4px;
  position: relative;
  display: flex;
  align-items: center;
}

.volume-slider input[type="range"] {
  width: 100%;
  height: 4px;
  background: var(--np-track);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  -webkit-appearance: none;
}

.volume-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--np-track);
  border-radius: 2px;
}

.volume-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--np-fill);
  border-radius: 50%;
  cursor: pointer;
  margin-top: -5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.volume-slider input[type="range"]:hover::-webkit-slider-thumb {
  transform: scale(1.2);
}

.volume-slider input[type="range"]::-moz-range-track {
  height: 4px;
  background: var(--np-track);
  border-radius: 2px;
}

.volume-slider input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--np-fill);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.volume-slider input[type="range"]:hover::-moz-range-thumb {
  transform: scale(1.2);
}

.btn-control {
  background: none;
  border: none;
  color: var(--np-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--transition-base);
  position: relative;
  overflow: visible;
}

/* 悬停时只加亮不放大，避免按钮溢出容器导致抖动和滚动条 */
.btn-control:active {
  transform: scale(0.95);
}

.btn-secondary {
  font-size: 1.2rem;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  color: var(--np-fg-2);
}

.btn-secondary:hover {
  background: var(--np-hover);
}

.btn-secondary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  width: 72px;
  height: 44px;
  /* 全屏底栏透明 + 父级 overflow 会裁掉阴影，留下底部一条发灰的直线残影；
     这里不加 box-shadow，只保留实心胶囊 */
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 22px; /* 胶囊：高度的一半 */
  box-shadow: none;
  transition: background-color var(--transition-base) var(--transition-timing),
    transform var(--transition-base) var(--transition-timing);
}

.btn-primary:hover {
  background-color: var(--color-primary-light);
  box-shadow: none;
}

.btn-primary:active {
  transform: scale(0.98);
}

/* Animations */
.animate-scale-in {
  animation: scaleIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.animate-slide-in-up {
  animation: slideInUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
