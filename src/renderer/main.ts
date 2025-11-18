import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import zh from './locales/zh.json'
import en from './locales/en.json'

const app = createApp(App)

// Pinia
const pinia = createPinia()
app.use(pinia)

// i18n
const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: 'zh',
  messages: { zh, en }
})
app.use(i18n)

app.mount('#app')
