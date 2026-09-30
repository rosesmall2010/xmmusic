import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** 轻提示，默认 2 秒后自动消失（无需点确定） */
export function showToast(text: string, durationMs = 2000) {
  const content = String(text || '').trim()
  if (!content) return

  message.value = content
  visible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
    hideTimer = null
  }, durationMs)
}

export function useToastState() {
  return { message, visible }
}
