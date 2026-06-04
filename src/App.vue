<script setup lang="ts">
/* ===== 根组件 ===== */
import { computed, watch, onErrorCaptured } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { NMessageProvider } from 'naive-ui'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { useSettingStore } from './store/settings'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
const settings = useSettingStore()

onErrorCaptured((err) => {
  console.error('全局错误:', err)
  return false
})

watch(() => settings.settings, (s) => {
  document.title = s.siteName || 'Software Hub'
  // favicon
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = s.logo || '/favicon.svg'
  // SEO meta
  let desc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!desc) {
    desc = document.createElement('meta')
    desc.name = 'description'
    document.head.appendChild(desc)
  }
  desc.content = s.seo?.description || s.siteName || 'Software Hub'
  let kw = document.querySelector<HTMLMetaElement>('meta[name="keywords"]')
  if (!kw) {
    kw = document.createElement('meta')
    kw.name = 'keywords'
    document.head.appendChild(kw)
  }
  kw.content = (s.seo?.keywords || []).join(', ')
}, { immediate: true, deep: true })
</script>

<template>
  <NMessageProvider>
    <!-- 后台页面：不套 main，直接渲染 RouterView（AdminLayout 自包含全屏） -->
    <template v-if="isAdmin">
      <RouterView />
    </template>

    <!-- 前台页面：标准 header + main + footer 布局 -->
    <template v-else>
      <SiteHeader />
      <main>
        <RouterView />
      </main>
      <SiteFooter />
    </template>
  </NMessageProvider>
</template>
