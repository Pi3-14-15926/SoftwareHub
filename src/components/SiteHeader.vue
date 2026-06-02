<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingStore } from '../store/settings'

const router = useRouter()
const settings = useSettingStore()
const keyword = ref('')

function doSearch() {
  const kw = keyword.value.trim()
  if (kw) router.push({ name: 'Search', query: { q: kw } })
}
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <!-- 左：站点名称 -->
      <router-link to="/" class="logo-link">
        <span class="logo-text">{{ settings.settings.siteName }}</span>
      </router-link>

      <!-- 中：搜索框 -->
      <div class="search-box">
        <input
          v-model="keyword"
          placeholder="搜索软件..."
          class="header-search-input"
          @keyup.enter="doSearch"
        />
      </div>

      <!-- 右：导航链接 -->
      <nav class="nav-links">
        <router-link to="/" class="nav-link">首页</router-link>
        <router-link :to="{ name: 'Search' }" class="nav-link">探索</router-link>
        <router-link to="/admin" class="nav-link admin-link">管理</router-link>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}
.logo-link {
  text-decoration: none;
  flex-shrink: 0;
  margin-left: -12px;
}
.logo-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.3rem;
  color: #000;
  letter-spacing: 0.5px;
}
.search-box {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
}
.header-search-input {
  width: 100%;
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  font-size: 0.88rem;
  font-family: inherit;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.header-search-input:focus {
  border-color: var(--accent-teal);
  box-shadow: 0 0 0 3px rgba(42, 157, 143, 0.15);
}
.nav-links {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.nav-link {
  text-decoration: none;
  color: var(--text-sec);
  font-size: 0.88rem;
  padding: 6px 14px;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
  font-weight: 500;
}
.nav-link:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-main);
}
.admin-link {
  color: var(--accent-teal);
  font-weight: 600;
}
.nav-link.router-link-active {
  background: rgba(42, 157, 143, 0.1);
  color: var(--accent-teal);
}

@media (max-width: 700px) {
  .header-inner { padding: 0 12px; }
  .search-box { width: 180px; }
  .nav-link { padding: 6px 10px; font-size: 0.84rem; }
}
@media (max-width: 500px) {
  .search-box { position: static; transform: none; width: auto; flex: 1; }
  .header-inner { gap: 8px; }
}
</style>
