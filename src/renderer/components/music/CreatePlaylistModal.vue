<template>
  <div v-if="modelValue" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑歌单' : '新建歌单' }}</h3>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>歌单名称</label>
          <input
            v-model="name"
            type="text"
            placeholder="请输入歌单名称"
            ref="inputRef"
            @keyup.enter="confirm"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close">取消</button>
        <button class="btn-confirm" @click="confirm" :disabled="!name.trim()">
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  modelValue: boolean
  initialName?: string
  isEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', name: string): void
}>()

const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.modelValue, (val) => {
  if (val) {
    name.value = props.initialName || ''
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

const close = () => {
  emit('update:modelValue', false)
}

const confirm = () => {
  if (!name.value.trim()) return
  emit('confirm', name.value.trim())
  close()
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  width: 400px;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-color);
}

.modal-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: var(--font-size-xl);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-color);
}

.modal-body {
  padding: var(--spacing-xl);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-group label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.form-group input {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  padding: var(--spacing-md);
  color: var(--text-color);
  font-size: var(--font-size-base);
  outline: none;
  transition: border-color var(--transition-base);
}

.form-group input:focus {
  border-color: var(--color-primary);
}

.modal-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
}

.btn-cancel,
.btn-confirm {
  padding: var(--spacing-sm) var(--spacing-xl);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border: none;
  transition: all var(--transition-base);
}

.btn-cancel {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-cancel:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.btn-confirm {
  background: var(--color-primary);
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
