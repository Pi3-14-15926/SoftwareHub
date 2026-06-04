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
    <div class="nav-inner">
      <router-link to="/" class="logo-link">
        <img v-if="settings.settings.logo" :src="settings.settings.logo" :alt="settings.settings.siteName" class="logo-img" />
        <span v-else class="logo-text">{{ settings.settings.siteName }}</span>
      </router-link>

      <div class="search-box">
        <input
          v-model="keyword"
          placeholder="搜索软件..."
          class="header-search-input"
          @keyup.enter="doSearch"
        />
      </div>

      <nav class="nav-links">
        <router-link to="/" class="nav-link" active-class="nav-active">首页</router-link>
        <router-link :to="{ name: 'Search' }" class="nav-link" active-class="nav-active">探索</router-link>
        <router-link to="/admin" class="nav-link nav-pill">管理</router-link>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 8px 16px 0;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  pointer-events: none;
}
.nav-inner {
  max-width: 1024px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 56px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 2rem;
  border: 1px solid rgba(208, 206, 206, 0.3);
  pointer-events: auto;
}
.logo-link {
  text-decoration: none;
  flex-shrink: 0;
  padding-left: 4px;
  display: flex;
  align-items: center;
}
.logo-img {
  height: 32px;
  width: auto;
  display: block;
}
.logo-text {
  font-family: 'Noto Serif SC', 'Playfair Display', serif;
  font-weight: 700;
  font-size: 1.5rem;
  color: #333;
}
.search-box {
  flex: 1;
  max-width: 280px;
  margin: 0 16px;
}
.header-search-input {
  width: 100%;
  padding: 6px 16px;
  border-radius: 2rem;
  border: 1px solid rgba(208, 206, 206, 0.4);
  background: rgba(0, 0, 0, 0.02);
  font-size: 0.85rem;
  font-family: inherit;
  color: #333;
  outline: none;
  transition: border-color 0.2s;
}
.header-search-input:focus {
  border-color: #2098ff;
}
.header-search-input::placeholder {
  color: #aaa;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.nav-link {
  text-decoration: none;
  color: #777;
  font-size: 0.95rem;
  padding: 6px 14px;
  border-radius: 2rem;
  transition: color 0.2s;
  font-weight: 400;
  position: relative;
}
.nav-link:hover {
  color: #333;
}
.nav-active {
  color: #333;
  font-weight: 700;
}
.nav-active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 14px;
  right: 14px;
  height: 2px;
  background: #2098ff;
  border-radius: 1px;
}
.nav-pill {
  margin-left: 6px;
  border: 1px solid rgba(208, 206, 206, 0.5);
  font-size: 0.85rem;
  padding: 5px 16px;
  color: #777;
}
.nav-pill:hover {
  border-color: #2098ff;
  color: #2098ff;
}

@media (max-width: 700px) {
  .site-header { padding: 4px 10px 0; }
  .nav-inner { padding: 0 12px; height: 50px; }
  .logo-text { font-size: 1.2rem; }
  .search-box { max-width: 160px; margin: 0 8px; }
  .nav-link { font-size: 0.85rem; padding: 5px 10px; }
  .nav-pill { font-size: 0.8rem; padding: 4px 12px; }
}
@media (max-width: 500px) {
  .nav-inner { gap: 4px; }
  .search-box { max-width: none; flex: 1; }
  .nav-link { padding: 4px 8px; font-size: 0.82rem; }
  .nav-active::after { left: 8px; right: 8px; }
}
</style>
