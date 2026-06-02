<script setup lang="ts">
/* ===== 根组件 ===== */
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { NMessageProvider } from 'naive-ui'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
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
