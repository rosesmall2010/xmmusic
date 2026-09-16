<template>
  <div v-if="show" class="dialog-overlay">
    <div class="dialog cover-match-dialog" role="dialog" aria-modal="true">
      <h3>{{ $t('nowPlaying.selectCoverTitle') }}</h3>
      <p class="hint">{{ $t('nowPlaying.selectCoverHint', { title: musicTitle }) }}</p>

      <div class="candidate-list">
        <p v-if="candidates.length === 0" class="empty-hint">
          {{ $t('nowPlaying.noOnlineCoverCandidates') }}
        </p>
        <button
          v-for="item in candidates"
          :key="item.songId"
          type="button"
          class="candidate-item"
          :class="{ selected: selectedId === item.songId && !localPath }"
          :disabled="applying"
          @click="selectOnline(item.songId)"
          @dblclick="confirmSelect"
        >
          <img
            class="thumb"
            :src="item.coverUrl"
            :alt="item.name"
            loading="lazy"
            @error="onThumbError"
          />
          <div class="meta">
            <div class="name">{{ item.name }}</div>
            <div class="sub">
              <span>{{ item.artists || $t('nowPlaying.unknownArtist') }}</span>
              <span v-if="item.album" class="album"> · {{ item.album }}</span>
            </div>
          </div>
          <div class="similarity" :title="$t('nowPlaying.similarity')">
            {{ item.similarity.toFixed(1) }}%
          </div>
        </button>
      </div>

      <div class="preview-box" :class="{ 'is-local': !!localPath }">
        <img
          v-if="previewUrl"
          class="preview-img"
          :src="previewUrl"
          :alt="musicTitle"
        />
        <div v-else class="preview-hint">{{ $t('nowPlaying.selectCoverPreviewHint') }}</div>
        <span v-if="localPath" class="local-badge">{{ $t('nowPlaying.localCoverBadge') }}</span>
      </div>

      <div class="dialog-actions">
        <button
          class="btn-secondary btn-local"
          type="button"
          :disabled="applying"
          @click="pickLocalImage"
        >
          {{ $t('nowPlaying.pickLocalCover') }}
        </button>
        <div class="actions-right">
          <button class="btn-secondary" type="button" :disabled="applying" @click="emitClose">
            {{ $t('common.cancel') }}
          </button>
          <button
            class="btn-primary"
            type="button"
            :disabled="applying || !canConfirm"
            @click="confirmSelect"
          >
            {{ applying ? $t('nowPlaying.applyingCover') : $t('nowPlaying.useSelectedCover') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CoverMatchCandidate } from '@shared/types/coverMatch'
import { getCoverUrl } from '@/utils/media'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  musicTitle: string
  candidates: CoverMatchCandidate[]
  applying?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', payload: { songId: number; coverUrl: string }): void
  (e: 'select-local', localPath: string): void
}>()

const selectedId = ref<number | null>(null)
/** 用户选择的本地图片绝对路径 */
const localPath = ref<string | null>(null)

const canConfirm = computed(() => localPath.value != null || selectedId.value != null)

const previewUrl = computed(() => {
  if (localPath.value) return getCoverUrl(localPath.value)
  if (selectedId.value == null) return ''
  return props.candidates.find((c) => c.songId === selectedId.value)?.coverUrl || ''
})

watch(
  () => [props.show, props.candidates] as const,
  ([show]) => {
    if (show) {
      localPath.value = null
      selectedId.value = props.candidates.length > 0 ? props.candidates[0].songId : null
    } else {
      selectedId.value = null
      localPath.value = null
    }
  },
  { immediate: true }
)

const selectOnline = (songId: number) => {
  localPath.value = null
  selectedId.value = songId
}

const pickLocalImage = async () => {
  if (props.applying) return
  try {
    const file = await window.electronAPI.selectImageFile()
    if (!file) return
    localPath.value = file
    selectedId.value = null
  } catch (error: any) {
    console.error('选择本地封面失败:', error)
    alert(t('nowPlaying.pickLocalCoverError') + ': ' + (error?.message || error))
  }
}

const emitClose = () => {
  if (props.applying) return
  emit('close')
}

const confirmSelect = () => {
  if (props.applying || !canConfirm.value) return
  if (localPath.value) {
    emit('select-local', localPath.value)
    return
  }
  const item = props.candidates.find((c) => c.songId === selectedId.value)
  if (!item?.coverUrl) return
  emit('select', { songId: item.songId, coverUrl: item.coverUrl })
}

const onThumbError = (e: Event) => {
  const el = e.target as HTMLImageElement
  el.style.visibility = 'hidden'
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 24px;
}

.cover-match-dialog {
  width: min(640px, 100%);
  max-height: min(82vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px;
  border-radius: 14px;
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
}

.cover-match-dialog h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
}

.candidate-list {
  flex: 1 1 auto;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
  padding-right: 2px;
}

.empty-hint {
  margin: 12px 8px;
  font-size: 0.85rem;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  text-align: center;
}

.preview-box {
  position: relative;
  flex-shrink: 0;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  overflow: hidden;
}

.preview-box.is-local {
  border-color: var(--color-primary, #1db954);
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-hint {
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  font-size: 0.82rem;
}

.local-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--color-primary, #1db954);
  color: #fff;
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  color: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.candidate-item:hover:not(:disabled) {
  background: var(--bg-hover, rgba(255, 255, 255, 0.08));
}

.candidate-item.selected {
  border-color: var(--color-primary, #1db954);
  background: color-mix(in srgb, var(--color-primary, #1db954) 16%, transparent);
}

.candidate-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  margin-top: 2px;
  font-size: 0.8rem;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.similarity {
  flex-shrink: 0;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-primary, #1db954);
}

.dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}

.actions-right {
  display: flex;
  gap: 10px;
}

.btn-secondary,
.btn-primary {
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-secondary {
  background: var(--bg-secondary, rgba(255, 255, 255, 0.08));
  color: inherit;
}

.btn-local {
  flex-shrink: 0;
}

.btn-primary {
  background: var(--color-primary, #1db954);
  color: #fff;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
