import { createI18n } from 'vue-i18n'
import zh from './zh.json'
import en from './en.json'

// 从 localStorage 获取保存的语言设置，默认为中文
const savedLocale = localStorage.getItem('locale') || 'zh'

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
