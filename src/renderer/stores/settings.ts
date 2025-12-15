import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { setLocale } from '@/locales'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh' | 'en'

// 检测系统语言
function detectSystemLanguage(): 'zh' | 'en' {
  const systemLang = navigator.language || (navigator as any).userLanguage || 'zh'
  // 检查是否是中文（包括 zh-CN, zh-TW, zh-HK 等）
  if (systemLang.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  // 默认返回英文
  return 'en'
}

export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref<Theme>((localStorage.getItem('theme') as Theme) || 'dark')
  // 如果 localStorage 中没有语言设置，则根据系统语言自动设置
  const savedLanguage = localStorage.getItem('locale') as Language | null
  const language = ref<Language>(savedLanguage || detectSystemLanguage())
  
  // 如果是第一次启动（没有保存的语言），自动保存系统语言
  if (!savedLanguage) {
    const systemLang = detectSystemLanguage()
    language.value = systemLang
    localStorage.setItem('locale', systemLang)
    setLocale(systemLang)
  }
  const closeToTray = ref(localStorage.getItem('closeToTray') === 'true')
  const autoPlay = ref(localStorage.getItem('autoPlay') !== 'false') // Default true
  const scanOnStartup = ref(localStorage.getItem('scanOnStartup') === 'true')

  // Actions
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  }

  function toggleCloseToTray() {
    closeToTray.value = !closeToTray.value
    localStorage.setItem('closeToTray', String(closeToTray.value))
  }

  function toggleAutoPlay() {
    autoPlay.value = !autoPlay.value
    localStorage.setItem('autoPlay', String(autoPlay.value))
  }

  function toggleScanOnStartup() {
    scanOnStartup.value = !scanOnStartup.value
    localStorage.setItem('scanOnStartup', String(scanOnStartup.value))
  }

  function setLanguage(newLanguage: Language) {
    language.value = newLanguage
    localStorage.setItem('locale', newLanguage)
    setLocale(newLanguage)
  }

  // Helper to apply theme
  function applyTheme(t: Theme) {
    const root = document.documentElement
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    if (isDark) {
      root.classList.add('dark-theme')
      root.classList.remove('light-theme')
    } else {
      root.classList.add('light-theme')
      root.classList.remove('dark-theme')
    }
  }

  // Initialize theme
  applyTheme(theme.value)

  // Watch for system theme changes if in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') {
      applyTheme('system')
    }
  })

  return {
    theme,
    language,
    closeToTray,
    autoPlay,
    scanOnStartup,
    setTheme,
    setLanguage,
    toggleCloseToTray,
    toggleAutoPlay,
    toggleScanOnStartup
  }
})
