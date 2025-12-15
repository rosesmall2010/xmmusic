import { createI18n } from 'vue-i18n'
import zh from './zh.json'
import en from './en.json'

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

// 从 localStorage 获取保存的语言设置
// 如果是第一次启动（没有保存的语言），则根据系统语言自动设置
let savedLocale = localStorage.getItem('locale') as 'zh' | 'en' | null
if (!savedLocale) {
  // 第一次启动，根据系统语言设置
  savedLocale = detectSystemLanguage()
  localStorage.setItem('locale', savedLocale)
}

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: savedLocale,
  fallbackLocale: 'zh', // 回退语言
  messages: { zh, en }
})

export default i18n

// 导出切换语言的函数
export function setLocale(locale: 'zh' | 'en') {
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
}
