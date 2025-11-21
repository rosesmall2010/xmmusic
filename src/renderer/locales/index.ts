import { createI18n } from 'vue-i18n'
import zh from './zh.json'
import en from './en.json'

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: 'zh',
  messages: { zh, en }
})

export default i18n
