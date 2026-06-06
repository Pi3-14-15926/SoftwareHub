import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import router from './router'
import { loadRemoteData } from './utils/api'
import './style.css'

async function boot() {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(naive)
  app.mount('#app')
  loadRemoteData().catch((e) => console.warn('loadRemoteData failed:', e))
}
boot()
