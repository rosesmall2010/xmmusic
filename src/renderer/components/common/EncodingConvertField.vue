<template>
  <div class="encoding-convert-section">
    <div class="original-value-display">
      <span class="label">{{ $t('metadataEdit.originalValue') }}:</span>
      <span class="value corrupted">{{ originalValue }}</span>
    </div>
    <div class="convert-buttons">
      <button
        v-for="encoding in ['GBK', 'GB2312', 'ANSI']"
        :key="encoding"
        @click="convert(encoding)"
        class="btn-convert"
        :disabled="disabled || converting"
      >
        {{ $t('metadataEdit.convertFrom', { encoding }) }}
      </button>
    </div>
    <div v-if="convertedValue" class="converted-value-display">
      <span class="label">{{ $t('metadataEdit.convertedValue') }}:</span>
      <span class="value converted">{{ convertedValue }}</span>
      <button
        @click="apply"
        class="btn-apply"
        :disabled="disabled"
      >
        {{ $t('metadataEdit.applyAndSave') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  originalValue: string
  currentValue: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  (e: 'converted', value: string): void
}>()

const convertedValue = ref<string | null>(null)
const converting = ref(false)

const convert = async (encoding: string) => {
  if (!props.originalValue) return

  try {
    converting.value = true
    const result = await window.electronAPI.convertStringEncoding(props.originalValue, encoding.toLowerCase())

    if (result.success) {
      convertedValue.value = result.result
    } else {
      alert(t('metadataEdit.convertFailed', { encoding, error: result.error || '' }))
    }
  } catch (error: any) {
    console.error('编码转换失败:', error)
    alert(t('metadataEdit.convertError') + ': ' + error.message)
  } finally {
    converting.value = false
  }
}

const apply = () => {
  if (!convertedValue.value) return
  emit('converted', convertedValue.value)
  convertedValue.value = null
}
</script>

<style scoped>
.encoding-convert-section {
  margin-top: var(--spacing-xs, 4px);
  padding: var(--spacing-sm, 8px);
  background: var(--bg-secondary, #f5f5f5);
  border-radius: var(--radius-base, 4px);
  border: 1px solid var(--border-color, #ddd);
  font-size: var(--font-size-xs, 12px);
}

.original-value-display,
.converted-value-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 4px);
  margin-bottom: var(--spacing-xs, 4px);
}

.original-value-display .label,
.converted-value-display .label {
  color: var(--text-secondary, #666);
  font-weight: 500;
}

.original-value-display .value.corrupted {
  color: var(--color-error, #ef4444);
  font-family: monospace;
}

.converted-value-display .value.converted {
  color: var(--color-success, #10b981);
  font-weight: 500;
}

.convert-buttons {
  display: flex;
  gap: var(--spacing-xs, 4px);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-xs, 4px);
}

.btn-convert {
  padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
  border: 1px solid var(--border-color, #ddd);
  border-radius: var(--radius-sm, 2px);
  background: var(--bg-primary, #fff);
  color: var(--text-color, #333);
  cursor: pointer;
  font-size: var(--font-size-xs, 12px);
  transition: all 0.2s;
}

.btn-convert:hover:not(:disabled) {
  background: var(--hover-bg, #f0f0f0);
  color: var(--color-primary, #ff4757);
  border-color: var(--color-primary, #ff4757);
}

.btn-convert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-apply {
  padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
  border: none;
  border-radius: var(--radius-sm, 2px);
  background: var(--color-primary, #ff4757);
  color: white;
  cursor: pointer;
  font-size: var(--font-size-xs, 12px);
  font-weight: 500;
  transition: all 0.2s;
  margin-left: var(--spacing-xs, 4px);
}

.btn-apply:hover:not(:disabled) {
  background: var(--color-primary-light, #ff6b7a);
  transform: translateY(-1px);
}

.btn-apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
