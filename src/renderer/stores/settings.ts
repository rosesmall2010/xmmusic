import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref<Theme>((localStorage.getItem('theme') as Theme) || 'dark')
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
    closeToTray,
    autoPlay,
    scanOnStartup,
    setTheme,
    toggleCloseToTray,
    toggleAutoPlay,
    toggleScanOnStartup
  }
})
