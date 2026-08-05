import { defineStore } from 'pinia'
import { ref } from 'vue'
import { setLocale } from '@/locales'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh' | 'en'
/** 全屏播放页的视觉特效 */
export type NowPlayingEffect = 'spectrum' | 'flame' | 'lightning' | 'vinyl' | 'cd' | 'cassette'
/** 迷你封面形态：无特效 / 唱片 / CD / 磁带 */
export type MiniCoverStyle = 'plain' | 'vinyl' | 'cd' | 'cassette'

/** 特效切换顺序：按钮每次点击按此顺序循环 */
export const NOW_PLAYING_EFFECTS: NowPlayingEffect[] = ['spectrum', 'flame', 'lightning', 'vinyl', 'cd', 'cassette']
export const MINI_COVER_STYLES: MiniCoverStyle[] = ['plain', 'vinyl', 'cd', 'cassette']

const DISC_EFFECTS: Array<'vinyl' | 'cd' | 'cassette'> = ['vinyl', 'cd', 'cassette']

export function isDiscEffect(effect: NowPlayingEffect): effect is 'vinyl' | 'cd' | 'cassette' {
  return (DISC_EFFECTS as string[]).includes(effect)
}

function isMiniCoverStyle(value: string | null): value is MiniCoverStyle {
  return !!value && (MINI_COVER_STYLES as string[]).includes(value)
}

/** 当前是否在全屏播放路由（hash 路由：#/playing） */
export function isOnNowPlayingRoute(): boolean {
  const hash = window.location.hash || ''
  return hash.includes('/playing')
}

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

  // 迷你封面形态（进迷你时会被全屏特效映射覆盖；用户在迷你内手动切换会写回）
  const savedMiniCover = localStorage.getItem('miniCoverStyle')
  const miniCoverStyle = ref<MiniCoverStyle>(
    isMiniCoverStyle(savedMiniCover) ? savedMiniCover : 'plain'
  )
  // 切入迷你时的全屏特效快照：迷你为「无特效」退出时用来还原（会话级即可）
  const effectBeforeMini = ref<NowPlayingEffect | null>(null)

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

  function setMiniCoverStyle(style: MiniCoverStyle) {
    miniCoverStyle.value = style
    localStorage.setItem('miniCoverStyle', style)
  }

  function cycleMiniCoverStyle() {
    const idx = MINI_COVER_STYLES.indexOf(miniCoverStyle.value)
    setMiniCoverStyle(MINI_COVER_STYLES[(idx + 1) % MINI_COVER_STYLES.length])
  }

  /**
   * 进入迷你：记住当前全屏特效；
   * 唱片/CD/磁带 → 迷你同名；频谱/火焰/闪电 → 迷你无特效
   */
  function syncMiniCoverOnEnter() {
    effectBeforeMini.value = nowPlayingEffect.value

    if (isDiscEffect(nowPlayingEffect.value)) {
      setMiniCoverStyle(nowPlayingEffect.value)
    } else {
      setMiniCoverStyle('plain')
    }
  }

  /**
   * 退出迷你：迷你是唱片/CD/磁带 → 全屏同名；
   * 迷你无特效 → 还原切入迷你时的全屏特效
   */
  function syncFullscreenEffectOnExit() {
    if (miniCoverStyle.value !== 'plain') {
      setNowPlayingEffect(miniCoverStyle.value)
      effectBeforeMini.value = null
      return
    }
    const restore = effectBeforeMini.value
    if (restore && NOW_PLAYING_EFFECTS.includes(restore)) {
      setNowPlayingEffect(restore)
    }
    effectBeforeMini.value = null
  }

  /**
   * 是否应为可视化接管 Web Audio。
   * 仅全屏播放页 + 频谱类特效 + 开关开启；唱盘类 / 迷你 / 其它路由都不接管。
   * （均衡器是否接管由 equalizer.enabled 单独决定，不走本函数）
   */
  function shouldCaptureNowPlayingAudio() {
    if (!isOnNowPlayingRoute()) return false
    if (isDiscEffect(nowPlayingEffect.value)) return false
    return nowPlayingEffectEnabled.value
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
    miniCoverStyle,
    setTheme,
    setLanguage,
    setNowPlayingEffect,
    cycleNowPlayingEffect,
    toggleNowPlayingEffectEnabled,
    setMiniCoverStyle,
    cycleMiniCoverStyle,
    syncMiniCoverOnEnter,
    syncFullscreenEffectOnExit,
    shouldCaptureNowPlayingAudio,
    toggleCloseToTray,
    toggleAutoPlay,
    toggleScanOnStartup
  }
})
