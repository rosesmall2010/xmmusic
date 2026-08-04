import { defineStore } from 'pinia'
import { ref } from 'vue'
import { setLocale } from '@/locales'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh' | 'en'
/** 全屏播放页的视觉特效 */
export type NowPlayingEffect = 'spectrum' | 'flame' | 'lightning' | 'vinyl'

/** 特效切换顺序：按钮每次点击按此顺序循环 */
export const NOW_PLAYING_EFFECTS: NowPlayingEffect[] = ['spectrum', 'flame', 'lightning', 'vinyl']

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

  // 全屏播放特效：从 localStorage 恢复，重启后保持上次选择；值非法时回落到频谱
  const savedEffect = localStorage.getItem('nowPlayingEffect') as NowPlayingEffect | null
  const nowPlayingEffect = ref<NowPlayingEffect>(
    savedEffect && NOW_PLAYING_EFFECTS.includes(savedEffect) ? savedEffect : 'spectrum'
  )
  // 特效开关：只对频谱/火焰/闪电有意义（唱盘本身不依赖这个开关）
  const nowPlayingEffectEnabled = ref(localStorage.getItem('nowPlayingEffectEnabled') !== 'false')

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

  function setNowPlayingEffect(effect: NowPlayingEffect) {
    nowPlayingEffect.value = effect
    localStorage.setItem('nowPlayingEffect', effect)
  }

  /** 按固定顺序切到下一个特效 */
  function cycleNowPlayingEffect() {
    const idx = NOW_PLAYING_EFFECTS.indexOf(nowPlayingEffect.value)
    setNowPlayingEffect(NOW_PLAYING_EFFECTS[(idx + 1) % NOW_PLAYING_EFFECTS.length])
  }

  function toggleNowPlayingEffectEnabled() {
    nowPlayingEffectEnabled.value = !nowPlayingEffectEnabled.value
    localStorage.setItem('nowPlayingEffectEnabled', String(nowPlayingEffectEnabled.value))
  }

  /** 是否应该为可视化接管 Web Audio：唱盘不读频谱，用户关闭特效开关时也不需要 */
  function shouldCaptureNowPlayingAudio() {
    return nowPlayingEffect.value !== 'vinyl' && nowPlayingEffectEnabled.value
  }

  // Helper to apply theme
  function applyTheme(t: Theme) {
    const appElement = document.getElementById('app')
    if (!appElement) {
      console.warn('未找到 #app 元素，无法应用主题')
      return
    }

    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    // 移除所有主题类
    appElement.classList.remove('light', 'dark')

    // 添加对应的主题类
    if (isDark) {
      appElement.classList.add('dark')
    } else {
      appElement.classList.add('light')
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
    nowPlayingEffect,
    nowPlayingEffectEnabled,
    setTheme,
    setLanguage,
    setNowPlayingEffect,
    cycleNowPlayingEffect,
    toggleNowPlayingEffectEnabled,
    shouldCaptureNowPlayingAudio,
    toggleCloseToTray,
    toggleAutoPlay,
    toggleScanOnStartup
  }
})
