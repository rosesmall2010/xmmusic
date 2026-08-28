<template>
  <div v-if="show" class="dialog-overlay">
    <div class="dialog lyrics-match-dialog" role="dialog" aria-modal="true">
      <h3>{{ $t('nowPlaying.selectLyricsTitle') }}</h3>
      <p class="hint">{{ $t('nowPlaying.selectLyricsHint', { title: musicTitle }) }}</p>

      <div class="candidate-list">
        <button
          v-for="item in candidates"
          :key="item.songId"
          type="button"
          class="candidate-item"
          :class="{ selected: selectedId === item.songId }"
          :disabled="applying"
          @click="selectedId = item.songId"
          @dblclick="confirmSelect"
        >
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

      <div class="preview-box">
        <div v-if="previewLoading" class="preview-hint">{{ $t('nowPlaying.loadingLyricsPreview') }}</div>
        <div v-else-if="previewError" class="preview-hint">{{ previewError }}</div>
        <textarea v-else readonly class="preview-text" :value="previewText"></textarea>
      </div>

      <div class="dialog-actions">
        <button class="btn-secondary" type="button" :disabled="applying" @click="emitClose">
          {{ $t('common.cancel') }}
        </button>
        <button
          class="btn-primary"
          type="button"
          :disabled="applying || selectedId == null"
          @click="confirmSelect"
        >
          {{ applying ? $t('nowPlaying.applyingLyrics') : $t('nowPlaying.useSelectedLyrics') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LyricsMatchCandidate } from '@shared/types/lyrics'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  musicTitle: string
  candidates: LyricsMatchCandidate[]
  applying?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', songId: number): void
}>()

const selectedId = ref<number | null>(null)
const previewText = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewCache = new Map<number, string>()

const loadPreview = async (songId: number) => {
  const cached = previewCache.get(songId)
  if (cached !== undefined) {
    previewText.value = cached
    previewError.value = ''
    previewLoading.value = false
    return
  }
  previewLoading.value = true
  previewError.value = ''
  try {
    const result = await window.electronAPI.previewLyricsCandidate(songId)
    if (selectedId.value !== songId) return
    const text = result.instrumental
      ? t('nowPlaying.previewInstrumental')
      : result.lyric || t('nowPlaying.previewEmpty')
    previewCache.set(songId, text)
    previewText.value = text
  } catch (error: any) {
    if (selectedId.value !== songId) return
    previewError.value = error?.message || t('nowPlaying.previewFailed')
  } finally {
    if (selectedId.value === songId) previewLoading.value = false
  }
}

watch(
  () => [props.show, props.candidates] as const,
  ([show]) => {
    if (show && props.candidates.length > 0) {
      selectedId.value = props.candidates[0].songId
    } else if (!show) {
      selectedId.value = null
      previewCache.clear()
    }
  },
  { immediate: true }
)

watch(selectedId, (id) => {
  if (id == null) {
    previewText.value = ''
    previewError.value = ''
    return
  }
  loadPreview(id)
})

const emitClose = () => {
  if (props.applying) return
  emit('close')
}

const confirmSelect = () => {
  if (selectedId.value == null || props.applying) return
  emit('select', selectedId.value)
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

.lyrics-match-dialog {
  width: min(640px, 100%);
  max-height: min(82vh, 680px);
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

.lyrics-match-dialog h3 {
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
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
  padding-right: 2px;
}

.preview-box {
  flex-shrink: 0;
  height: 160px;
}

.preview-text {
  width: 100%;
  height: 100%;
  resize: none;
  border-radius: 10px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  color: inherit;
  font-size: 0.82rem;
  line-height: 1.5;
  padding: 10px 12px;
  white-space: pre-wrap;
}

.preview-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  font-size: 0.82rem;
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
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
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
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
