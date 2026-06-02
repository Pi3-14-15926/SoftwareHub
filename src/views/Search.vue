<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()

const keyword = ref((route.query.q as string) || '')
const categoryFilter = ref<string>('')

const results = computed(() => {
  let list = projects.projects
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw),
    )
  }
  if (categoryFilter.value && categoryFilter.value !== 'all') {
    list = list.filter((p) => p.categoryId === categoryFilter.value)
  }
  return list
})

watch(
  () => route.query.q,
  (q) => {
    keyword.value = (q as string) || ''
  },
)

function doSearch() {
  router.replace({ query: { q: keyword.value.trim() || undefined } })
}
</script>

<template>
  <AmbientOrbs />
  <div class="container">
    <header>
      <router-link to="/" class="back-link">← 返回首页</router-link>
      <h1>🔍 搜索</h1>
      <div class="subtitle">探索所有软件</div>
    </header>

    <div class="search-bar">
      <input
        v-model="keyword"
        placeholder="输入软件名称或描述..."
        class="search-input"
        @keyup.enter="doSearch"
      />
      <button class="search-btn" @click="doSearch">搜索</button>
    </div>

    <div class="filters">
      <div class="filter-pills">
        <button
          :class="['pill', { active: categoryFilter === '' }]"
          @click="categoryFilter = ''"
        >全部页面</button>
        <button
          v-for="c in categories.categories"
          :key="c.id"
          :class="['pill', { active: categoryFilter === c.id }]"
          @click="categoryFilter = c.id"
        >{{ c.icon }} {{ c.name }}</button>
      </div>
      <span class="result-count">共 {{ results.length }} 个结果</span>
    </div>

    <div v-if="results.length" class="card-grid">
      <ProjectCard v-for="p in results" :key="p.id" :project="p" />
    </div>
    <div v-else class="not-found">
      <p v-if="keyword.trim()">未找到匹配"{{ keyword }}"的软件</p>
      <p v-else>输入关键词开始搜索</p>
    </div>

    <footer>
      <p>本项目仅为聚合下载页面，应用版权归原作者所有</p>
    </footer>
  </div>
</template>

<style scoped>
.container {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
header {
  text-align: center;
  margin-bottom: 24px;
  padding: 20px 0 10px;
  position: relative;
}
h1 {
  font-family: var(--font-display);
  color: var(--text-main);
  margin: 0 0 6px;
  font-weight: 700;
  font-size: clamp(1.5rem, 2vw + 0.8rem, 2rem);
}
.subtitle { color: var(--text-sec); font-size: 0.92rem; }
.back-link {
  position: absolute;
  top: 12px;
  left: 0;
  font-size: 0.85rem;
  color: var(--text-sec);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(46, 42, 36, 0.06);
  border: 1px solid var(--border-color);
  text-decoration: none;
}
.back-link:hover { background: rgba(46, 42, 36, 0.12); }

.search-bar {
  display: flex;
  gap: 10px;
  max-width: 680px;
  margin: 0 auto 16px;
}
.search-input {
  flex: 1;
  padding: 12px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  font-size: 0.95rem;
  font-family: inherit;
  color: var(--text-main);
  outline: none;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s;
}
.search-input:focus {
  border-color: var(--accent-teal);
}
.search-btn {
  padding: 12px 24px;
  border-radius: 999px;
  border: none;
  background: var(--btn-bg);
  color: #fffaf2;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: var(--btn-shadow);
  transition: opacity 0.18s, transform 0.12s;
  font-family: inherit;
}
.search-btn:hover {
  background: var(--btn-bg-hover);
  opacity: 0.95;
  transform: translateY(-1px);
}

.filters {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 100%;
  margin: 0 auto 25px;
  background: var(--card-bg);
  padding: 10px 18px;
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  overflow-x: auto;
}
.filter-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pill {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-sec);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.pill:hover {
  background: rgba(46, 42, 36, 0.06);
  color: var(--text-main);
  border-color: rgba(46, 42, 36, 0.25);
}
.pill.active {
  background: var(--btn-bg);
  color: #fffaf2;
  border-color: var(--btn-bg);
}
.result-count { font-size: 0.88rem; color: var(--text-sec); margin-left: auto; white-space: nowrap; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.not-found {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-sec);
}

footer { text-align: center; margin-top: 50px; color: var(--text-sec); font-size: 0.82rem; padding-bottom: 20px; }

@media (min-width: 900px) {
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  .search-bar { flex-direction: column; }
  .search-btn { width: 100%; }
  .filters { flex-wrap: wrap; }
}
</style>
