<script setup lang="ts">
/* ===== 软件详情页 — 匹配目标站风格 ===== */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import { useSettingStore } from '../store/settings'
import { fmtDate, relTime, fmtCompact } from '../utils'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()

const project = computed(() => projects.bySlug(route.params.slug as string))
const category = computed(() =>
  project.value ? categories.categories.find((c) => c.id === project.value!.categoryId) : null,
)

const expanded = ref(false)
const latestVer = computed(() => project.value?.versions[0] ?? null)
const historyVers = computed(() => project.value?.versions.slice(1) ?? [])
</script>

<template>
  <AmbientOrbs />
  <div class="container">
    <!-- 头部 -->
    <header>
      <router-link to="/" class="back-link">← 返回首页</router-link>
      <h1>{{ project?.name || '软件详情' }}</h1>
      <div class="subtitle">
        {{ settings.settings.siteName }}
      </div>
    </header>

    <!-- 项目未找到 -->
    <div v-if="!project" class="not-found">
      项目未找到，请检查链接是否正确
    </div>

    <template v-else>
      <!-- 项目信息卡片 -->
      <div class="detail-card">
        <div class="card-header">
          <div class="icon">
            <img v-if="project.logo" :src="project.logo" :alt="project.name" />
            <span v-else>{{ project.name[0] }}</span>
          </div>
          <div style="flex:1">
            <h2 class="card-title">{{ project.name }}</h2>
            <div class="source-desc" style="margin-bottom:0;border-bottom:none;padding-bottom:0">
              {{ project.description }}
            </div>
          </div>
        </div>
        <div class="detail-meta">
          <span v-if="category" class="meta-tag">{{ category.icon }} {{ category.name }}</span>
          <span v-if="project.stars !== undefined" class="meta-tag">⭐ {{ fmtCompact(project.stars) }}</span>
          <span v-if="project.githubRepo" class="meta-tag">
            <a :href="`https://github.com/${project.githubRepo}`" target="_blank" @click.stop>
              GitHub
            </a>
          </span>
        </div>
      </div>

      <!-- 最新版本 -->
      <div v-if="latestVer" class="detail-card">
        <div class="release-header">
          <span class="release-title">{{ latestVer.version }}</span>
          <span class="release-date">
            {{ fmtDate(latestVer.publishedAt) }} · {{ relTime(latestVer.publishedAt) }}
          </span>
        </div>
        <div class="release-notes">{{ latestVer.changelog || '该版本未提供更新日志。' }}</div>
        <div class="download-list">
          <a
            v-for="dl in latestVer.downloads"
            :key="dl.url"
            :href="dl.url"
            target="_blank"
            rel="noopener noreferrer"
            class="download-btn"
          >
            <span class="apk-name">{{ dl.filename }}</span>
            <span class="apk-size">{{ dl.size }}</span>
          </a>
          <div v-if="latestVer.downloads.length === 0" class="error-msg" style="display:block">
            该版本暂无文件
          </div>
        </div>
      </div>

      <!-- 历史版本 -->
      <div v-if="historyVers.length > 0" class="detail-card">
        <div class="section-title" @click="expanded = !expanded" style="cursor:pointer">
          📜 历史版本 ({{ historyVers.length }}) {{ expanded ? '▲' : '▼' }}
        </div>
        <template v-if="expanded">
          <div v-for="v in historyVers" :key="v.id" class="history-item">
            <div class="release-header">
              <span class="release-title">{{ v.version }}</span>
              <span class="release-date">{{ fmtDate(v.publishedAt) }}</span>
            </div>
            <div class="release-notes" style="max-height:100px">{{ v.changelog || '无更新日志' }}</div>
            <div class="download-list">
              <a
                v-for="dl in v.downloads"
                :key="dl.url"
                :href="dl.url"
                target="_blank"
                class="download-btn"
              >
                <span class="apk-name">{{ dl.filename }}</span>
                <span class="apk-size">{{ dl.size }}</span>
              </a>
            </div>
          </div>
        </template>
      </div>
    </template>

    <footer></footer>
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

.detail-card {
  border-radius: var(--border-radius);
  padding: 24px;
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  margin-bottom: 20px;
  animation: riseFade 0.4s ease both;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}
.icon {
  width: 48px;
  height: 48px;
  background: var(--icon-bg-start);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--icon-fg);
  font-weight: 700;
  font-size: 22px;
  flex-shrink: 0;
  border: 1px solid rgba(31, 57, 70, 0.14);
  overflow: hidden;
}
.icon img { width: 100%; height: 100%; object-fit: cover; }
.card-title { font-size: 1.2rem; font-weight: 700; margin: 0; }
.source-desc { font-size: 0.92rem; color: var(--text-sec); }

.detail-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.meta-tag {
  font-size: 0.82rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(46, 42, 36, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-sec);
}
.meta-tag a { color: var(--accent-teal); text-decoration: none; }

.release-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 6px;
}
.release-title { font-weight: 700; font-size: 1rem; color: #2a241f; }
.release-date { font-size: 0.85rem; color: #8c7f73; }
.release-notes {
  background: var(--log-bg);
  padding: 12px;
  border-radius: 12px;
  font-size: 0.9rem;
  color: #3a332c;
  max-height: 130px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin-bottom: 15px;
  border-left: 3px solid var(--accent-teal);
  word-break: break-word;
}
.section-title { font-size: 1rem; font-weight: 700; margin-bottom: 12px; color: var(--text-main); }

.history-item {
  padding: 16px;
  border-radius: 12px;
  background: var(--card-soft);
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
}

.download-list { display: flex; flex-direction: column; gap: 8px; }
.download-btn {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  background: var(--btn-bg);
  color: #fffaf2;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 20px;
  font-weight: 600;
  transition: opacity 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
  font-size: 0.95rem;
  box-shadow: var(--btn-shadow);
}
.download-btn:hover {
  background: var(--btn-bg-hover);
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: var(--btn-shadow-hover);
}
.apk-name {
  font-family: monospace;
  font-size: 0.95rem;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow-x: auto;
}
.apk-name::-webkit-scrollbar { width: 0; height: 0; }
.apk-size {
  font-size: 0.82rem;
  opacity: 0.92;
  white-space: nowrap;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 9px;
  border-radius: 999px;
}

.error-msg {
  color: var(--accent-warm);
  font-size: 0.9rem;
  text-align: center;
  background: #fff0ec;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(221, 94, 67, 0.35);
}
.not-found {
  text-align: center;
  padding: 40px;
  color: var(--text-sec);
}

footer { text-align: center; margin-top: 40px; color: var(--text-sec); font-size: 0.82rem; padding-bottom: 20px; }

@media (max-width: 480px) {
  .detail-card { padding: 18px; }
  .download-btn { padding: 8px 12px; }
  .apk-name { font-size: 0.9rem; }
  .apk-size { font-size: 0.78rem; }
}
</style>
